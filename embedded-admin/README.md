# Embedded Admin

A custom-branded embedded Shopify admin app — the kind of interface a subscription or ops app puts *inside* Shopify admin, built with a real design system instead of Polaris.

## Why not Polaris

Polaris makes an app look like Shopify. That's the right default for a utility, and the wrong one for software a team lives in all day. A custom design system means the interface can be shaped around the actual workflow — a dense subscriber table, a per-customer delivery calendar, a billing dry-run report — rather than around the available components.

App Bridge is still used for what it's genuinely good at: session tokens, toasts, navigation and the admin chrome.

## Session-token auth

The part that's easy to get subtly wrong.

An embedded app lives in an iframe and can't depend on cookies. App Bridge issues a short-lived JWT per request; the backend verifies it against the app's client secret.

Two checks people miss:

```js
const shop = String(payload.dest).replace(/^https:\/\//, "");
if (!shop.endsWith(".myshopify.com")) throw new AuthError(...);
```

- **`dest`** — the shop the token was minted for. Verify the signature alone and a valid token from *any other store that installed your app* authenticates against yours. This is a tenant-isolation bug, and it passes every happy-path test.
- **`aud`** — must be your app's own API key.
- **`nbf` as well as `exp`** — Shopify sets both; a token used before its window is as wrong as one used after.

## What it renders

- Subscriber list with status, plan size, next delivery
- Per-customer calendar: upcoming boxes, which are still editable, which have locked
- Billing dry-run report before any live run
- Confirm-gated actions for anything that moves money
- Append-only activity timeline per subscription

## Stack

`Node` · `Hono` · `App Bridge` · `jose` · server-rendered, no SPA build step

---

MIT licensed.
