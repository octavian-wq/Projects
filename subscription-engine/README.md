# Shopify Subscription Engine

A headless subscription billing engine that charges **native Shopify subscription contracts** directly — no Recharge, no Appstle, no third-party billing app taking a cut of every order.

It owns the three things a subscription app owns: a **delivery calendar**, the **cut-off** that locks and charges a box, and **dunning** when a card fails. The storefront stays on Shopify; this replaces the subscription layer underneath it.

```
Storefront / customer portal
            │
            ▼
┌───────────────────────────┐        ┌──────────────────────┐
│   Subscription engine     │───────▶│  Shopify Admin API   │
│                           │        │  • payment contracts │
│  calendar → cut-off       │        │  • vaulted cards     │
│  biller   → dunning       │◀───────│  • orders            │
│  Postgres (3 tables)      │        └──────────────────────┘
└───────────────────────────┘
            │ pull-only, paged
            ▼
   WMS / ERP / fulfilment
```

## Why build this instead of installing an app

Subscription apps charge a platform fee plus a percentage of subscription revenue — for a business doing meaningful recurring volume that becomes one of the largest line items on the P&L. They also own your billing logic, which means your delivery schedule has to fit their model rather than your operation.

This engine inverts that: Shopify keeps custody of the cards (so you stay out of PCI scope), and you keep control of the schedule.

## The parts that are actually hard

Most of a subscription engine is CRUD. These four are not, and they're where the bugs cost real money.

### 1. Cut-offs that survive the clocks changing

Every date calculation happens in the merchant's local timezone and is only then converted to an absolute instant. A cut-off defined as "noon, two days before delivery" must stay at noon in March and in November.

Do this arithmetic on UTC timestamps and every cut-off silently shifts by an hour twice a year — charging one day's customers early, locking another day's boxes an hour late. It fails quietly and it fails for everyone at once.

```js
export function cutoffFor(deliveryDt) {
  return deliveryDt
    .minus({ days: CUTOFF_DAYS_BEFORE })
    .startOf("day")
    .set({ hour: CUTOFF_HOUR });   // noon local, always
}
```

Pinned by tests that run across a real DST boundary — see [`test/calendar.test.js`](test/calendar.test.js).

### 2. Billing that cannot double-charge

Every billing attempt carries an idempotency key derived from the delivery row, so the same delivery always produces the same key. If a request times out after Shopify has already taken the payment, retrying returns the original attempt instead of charging the card again.

The alternative — a random key per attempt — means a single network blip bills a customer twice, and you find out from the customer.

### 3. Dunning that respects the warehouse

A failed payment gets exactly one retry, fired at a **fixed hour the next morning** rather than at `+24h`.

The fixed hour is the point. Dispatch happens the day before delivery. A payment recovered at an arbitrary 24-hour offset can land after the van has loaded — so the customer has now paid for a box that will never arrive. That's a worse outcome than never retrying.

After the final failure the week is marked `SKIPPED`, not left `FAILED`. **The customer loses the week; they never lose the subscription.**

### 4. Never billing the past

A delivery whose date has already passed is skipped, not charged. Stale rows accumulate in any real system — a paused subscription that resumed late, a box that missed a run, a manual fix that left a row behind. Charging them produces a payment for a delivery that cannot happen, which is the single worst thing a subscription business can do to a customer.

## Safety model

Money-moving operations are deliberately awkward to trigger:

| Route | Behaviour |
|---|---|
| `GET /admin/billing-report` | Read-only dry run. Reports exactly what would be charged, with totals. |
| `POST /admin/run-billing` | Requires `{"confirm":"CHARGE-LIVE"}` in the body |
| `POST /admin/run-retries` | Requires `{"confirm":"RETRY-LIVE"}` in the body |

Nothing that moves money can be triggered by a GET, a browser prefetch, or a curl pulled out of shell history. **The dry run is not a convenience — it's the verification step.** Totals get sanity-checked against expectations before anything is committed.

Billing state lives on the `Delivery` row rather than in memory, so a crash mid-run resumes cleanly and never re-charges what already succeeded.

## Data model

Three tables carry the whole domain:

- **Customer** — who subscribes
- **Subscription** — the plan: size, price tier, frequency, usual delivery day, and the Shopify contract + vaulted payment method behind it
- **Delivery** — one row per dated shipment. This is what the biller works on and what the customer edits. Its status is the source of truth for "did this week happen".

Plus an append-only `Event` log for the audit trail.

Deliberately **not** stored: addresses, catalogue, order history. Those live in Shopify and are read from it. Duplicating them is how an engine drifts out of sync with the store it's supposed to serve.

## Partner integrations

Downstream systems (WMS, ERP, fulfilment) **pull** from `/integrations/*` on their own schedule, paged via `nextOffset`. The engine never pushes.

That direction is chosen deliberately: a partner system being down can never block or delay a billing run.

## Running it

```bash
cp .env.example .env     # add Shopify credentials + DATABASE_URL
npm install
npm run db:migrate
npm start
```

```bash
npm test                 # cut-off and calendar rules
```

Requires a Shopify app with `write_own_subscription_contracts`, `read_own_subscription_contracts` and `read_customer_payment_methods`. These are protected scopes — request access via the Partner Dashboard.

## Stack

Node 20+ · Hono · Prisma · PostgreSQL · Luxon · Shopify Admin GraphQL API

---

MIT licensed. Built by [Octavian](https://github.com/octavian-wq) — I build Shopify subscription infrastructure, headless storefronts and AI support tooling.
