# Projects

Shopify subscription infrastructure, headless storefronts, and AI tooling for commerce.

I build the layer underneath a store: recurring billing on native Shopify contracts, delivery scheduling, customer portals, and the internal tools an operations team actually runs the business on.

Everything here is a clean-room reference implementation. The architecture and the hard-won details from systems running in production, rebuilt as standalone, readable projects.

I take on this work at **[ownyourbilling.com](https://ownyourbilling.com)**.

---

## [subscription-engine](./subscription-engine)

**A headless subscription billing engine for Shopify.** Charges native Shopify subscription contracts directly , no Recharge, no Appstle, no third-party app taking a percentage of recurring revenue.

Owns the delivery calendar, the cut-off that locks and charges a box, and dunning when a card fails. Shopify keeps custody of the cards, so the engine stays out of PCI scope.

The hard parts, which is most of what the code is about:
- **DST-safe cut-offs** , all date maths in merchant-local time, pinned by tests across a real clock change
- **Idempotent billing** , a stable key per delivery, so a timeout can never double-charge
- **Dunning timed to dispatch** , one retry at a fixed morning hour, because a payment recovered after the van loads is worse than no payment
- **Never bills the past** , stale rows get skipped, not charged

`Node` `Hono` `Prisma` `PostgreSQL` `Shopify Admin GraphQL`

## [embedded-admin](./embedded-admin)

**A custom-branded embedded Shopify admin app.** App Bridge session-token auth, running inside Shopify admin, without Polaris , a real design system rather than the default component kit.

Subscriber list, per-customer calendar, billing dry-run reports, and the confirm-gated actions that move money.

`Node` `App Bridge` `Shopify OAuth`

## [ai-support-desk](./ai-support-desk)

**An LLM support agent with guardrails that actually hold.** Routes every inbound customer message three ways , answer from the knowledge base, acknowledge and queue for a human, or escalate.

The engineering is in the safety, not the prompt:
- A regex pre-filter forces escalation on allergen and medical questions **before any model call**
- Any knowledge-base, API or parse failure fails *safe* to escalation , it never auto-sends
- Knowledge base is injected at request time and prompt-cached, so editing an answer changes behaviour with no redeploy
- Bigger model for judgement, faster model for the live widget

`TypeScript` `React Router` `Anthropic SDK` `Prisma`

## [hydrogen-portal](./hydrogen-portal)

**A headless customer portal** on Shopify Hydrogen , where subscribers edit an upcoming box, skip a week, change their delivery day, pause, or reactivate.

Renders the same calendar the biller acts on, including which weeks are still editable and which have locked.

`Hydrogen` `Remix` `TypeScript` `Tailwind`

## [pseo-pages](./pseo-pages)

**A programmatic SEO page generator for Shopify themes.** Builds native Online Store 2.0 page templates , competitor comparisons, head-to-head pages, alternatives, and location pages , from structured data.

Theme-native rather than a bolt-on app, so pages inherit the store's design system and need no extra subscription. Built around the page types that hold commercial intent, with guidance on staying the right side of Google's scaled-content policy.

`Liquid` `Node` `JSON templates`

## [inventory-scm](./inventory-scm)

**Supply-chain tooling for a subscription operation.** Per-SKU demand forecasting from upcoming subscription line items, producer management, purchase orders, and Shopify inventory sync.

Pulls from the subscription engine's integration API on its own schedule , a pull model, so an outage here can never block billing.

`Node` `Prisma` `PostgreSQL` `Shopify Admin API`

---

## About

I'm Octavian, a developer in the UK. I work on Shopify subscription systems , the billing, scheduling and operational tooling that recurring-revenue commerce runs on.

Available for Shopify subscription work: custom billing engines, migrations off Recharge/Appstle onto native contracts, headless storefronts, and checkout extensions.
