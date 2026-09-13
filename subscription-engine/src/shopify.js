// The Shopify boundary. Everything that talks to the Admin GraphQL API lives
// here so the rest of the engine never has to know about GraphQL, cursors or
// user-errors.
//
// The engine charges Shopify-native subscription contracts. It never handles a
// card number — Shopify vaults the payment method and the engine asks it to
// bill a token. That keeps the whole system out of PCI scope.

const SHOP = process.env.SHOPIFY_SHOP;
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || "2026-04";

const ENDPOINT = () => `https://${SHOP}/admin/api/${VERSION}/graphql.json`;

class ShopifyError extends Error {
  constructor(message, { query, variables, userErrors } = {}) {
    super(message);
    this.name = "ShopifyError";
    this.query = query;
    this.variables = variables;
    this.userErrors = userErrors;
  }
}

/**
 * One GraphQL call, with retry on Shopify's throttle response.
 * Shopify rate-limits by query cost, not request count, so backing off on
 * THROTTLED and retrying is the documented behaviour — not a workaround.
 */
export async function gql(query, variables = {}, { retries = 3 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(ENDPOINT(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": TOKEN,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (res.status === 429 && attempt < retries) {
      await sleep(2 ** attempt * 1000);
      continue;
    }

    const body = await res.json();

    const throttled = body.errors?.some((e) => e.extensions?.code === "THROTTLED");
    if (throttled && attempt < retries) {
      await sleep(2 ** attempt * 1000);
      continue;
    }

    if (body.errors?.length) {
      throw new ShopifyError(body.errors.map((e) => e.message).join("; "), {
        query, variables,
      });
    }
    return body.data;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Throw if a mutation returned userErrors — they are not thrown by default. */
function assertNoUserErrors(payload, label) {
  const errs = payload?.userErrors ?? [];
  if (errs.length) {
    throw new ShopifyError(
      `${label}: ${errs.map((e) => `${e.field?.join(".") ?? "?"} ${e.message}`).join("; ")}`,
      { userErrors: errs },
    );
  }
}

// ── Payment methods ─────────────────────────────────────────────────────────

/** The customer's vaulted, reusable payment methods. */
export async function listPaymentMethods(customerGid) {
  const data = await gql(
    `query($id: ID!) {
      customer(id: $id) {
        paymentMethods(first: 10) {
          nodes {
            id
            revokedAt
            instrument {
              ... on CustomerCreditCard {
                brand lastDigits expiryMonth expiryYear
              }
            }
          }
        }
      }
    }`,
    { id: customerGid },
  );
  return (data.customer?.paymentMethods?.nodes ?? []).filter((m) => !m.revokedAt);
}

// ── Billing ─────────────────────────────────────────────────────────────────

/**
 * Charge a subscription contract and create the resulting order.
 *
 * `idempotencyKey` is the important argument. Shopify deduplicates billing
 * attempts on it, so a request that times out after Shopify has already
 * charged the card can be safely repeated with the same key: the second call
 * returns the original attempt rather than taking a second payment.
 */
export async function billContract({ contractGid, idempotencyKey }) {
  const data = await gql(
    `mutation($input: SubscriptionBillingAttemptInput!) {
      subscriptionBillingAttemptCreate(subscriptionBillingAttemptInput: $input) {
        subscriptionBillingAttempt {
          id
          ready
          errorCode
          errorMessage
          order { id name totalPriceSet { shopMoney { amount currencyCode } } }
        }
        userErrors { field message }
      }
    }`,
    { input: { idempotencyKey, subscriptionContractId: contractGid } },
  );

  const payload = data.subscriptionBillingAttemptCreate;
  assertNoUserErrors(payload, "billContract");
  return payload.subscriptionBillingAttempt;
}

/**
 * A billing attempt is created asynchronously — `ready: false` means Shopify
 * has accepted it but not finished. Poll until it resolves.
 */
export async function pollBillingAttempt(attemptGid, { tries = 10, waitMs = 2000 } = {}) {
  for (let i = 0; i < tries; i++) {
    const data = await gql(
      `query($id: ID!) {
        node(id: $id) {
          ... on SubscriptionBillingAttempt {
            id ready errorCode errorMessage
            order { id name totalPriceSet { shopMoney { amount } } }
          }
        }
      }`,
      { id: attemptGid },
    );
    const attempt = data.node;
    if (attempt?.ready || attempt?.errorCode) return attempt;
    await sleep(waitMs);
  }
  throw new ShopifyError("Billing attempt did not resolve in time", {
    variables: { attemptGid },
  });
}

// ── Contract contents ───────────────────────────────────────────────────────

/**
 * Replace the lines on a contract before charging, so the order reflects what
 * the customer actually picked this week. Shopify requires the draft/commit
 * dance — a contract cannot be edited in place.
 */
export async function setContractLines({ contractGid, lines }) {
  const draft = await gql(
    `mutation($id: ID!) {
      subscriptionContractUpdate(contractId: $id) {
        draft { id }
        userErrors { field message }
      }
    }`,
    { id: contractGid },
  );
  assertNoUserErrors(draft.subscriptionContractUpdate, "openDraft");
  const draftId = draft.subscriptionContractUpdate.draft.id;

  const existing = await gql(
    `query($id: ID!) {
      node(id: $id) {
        ... on SubscriptionDraft { lines(first: 250) { nodes { id } } }
      }
    }`,
    { id: draftId },
  );

  for (const line of existing.node?.lines?.nodes ?? []) {
    const del = await gql(
      `mutation($draftId: ID!, $lineId: ID!) {
        subscriptionDraftLineRemove(draftId: $draftId, lineId: $lineId) {
          userErrors { field message }
        }
      }`,
      { draftId, lineId: line.id },
    );
    assertNoUserErrors(del.subscriptionDraftLineRemove, "removeLine");
  }

  for (const line of lines) {
    const add = await gql(
      `mutation($draftId: ID!, $input: SubscriptionLineInput!) {
        subscriptionDraftLineAdd(draftId: $draftId, input: $input) {
          userErrors { field message }
        }
      }`,
      {
        draftId,
        input: {
          productVariantId: line.variantId,
          quantity: line.quantity,
          currentPrice: (line.pricePence / 100).toFixed(2),
        },
      },
    );
    assertNoUserErrors(add.subscriptionDraftLineAdd, "addLine");
  }

  const commit = await gql(
    `mutation($draftId: ID!) {
      subscriptionDraftCommit(draftId: $draftId) {
        contract { id }
        userErrors { field message }
      }
    }`,
    { draftId },
  );
  assertNoUserErrors(commit.subscriptionDraftCommit, "commitDraft");
  return commit.subscriptionDraftCommit.contract;
}

/**
 * Order attributes the warehouse and carrier read.
 *
 * Note the read-modify-write: Shopify replaces the whole customAttributes
 * array, it does not merge. Writing only the delivery fields here silently
 * destroys every other attribute on the order — a bug worth knowing about
 * before it eats your reference ids in production.
 */
export async function setOrderAttributes({ orderGid, attributes }) {
  const current = await gql(
    `query($id: ID!) {
      order(id: $id) { customAttributes { key value } }
    }`,
    { id: orderGid },
  );

  const merged = new Map(
    (current.order?.customAttributes ?? []).map((a) => [a.key, a.value]),
  );
  for (const [key, value] of Object.entries(attributes)) merged.set(key, value);

  const data = await gql(
    `mutation($input: OrderInput!) {
      orderUpdate(input: $input) {
        order { id }
        userErrors { field message }
      }
    }`,
    {
      input: {
        id: orderGid,
        customAttributes: [...merged].map(([key, value]) => ({ key, value })),
      },
    },
  );
  assertNoUserErrors(data.orderUpdate, "setOrderAttributes");
}

export { ShopifyError };
