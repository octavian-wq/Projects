# Inventory SCM

Supply-chain tooling for a subscription operation: per-SKU demand forecasting, producer management, purchase orders, and Shopify stock sync.

Built as the fulfilment side of a subscription business, pulling from the [subscription engine](../subscription-engine)'s integration API.

## Forecasting is easier here than in normal retail

A subscription business has an advantage almost nothing else in commerce does: **next week's orders already exist.** Demand isn't predicted from historical trend — it's read directly from upcoming subscription lines.

History only fills the gap for boxes the customer hasn't chosen yet, and those mostly auto-fill from their previous selection at cut-off.

So the forecast separates two very different numbers:

| | Meaning | How to use it |
|---|---|---|
| **Confirmed** | The customer has chosen it. Not a forecast — a fact. | Order exactly |
| **Projected** | Unchosen box, modelled from last week's selection × repeat rate | Order with a buffer |
| **Certainty** | `confirmed / total` | Tells the buyer how much to trust the number |

A buyer ordering against a 100%-certain SKU can order exactly. Against a 20%-certain one, they need cover. Collapsing both into a single "demand" figure is how a subscription business ends up simultaneously over- and under-stocked.

## Recommendations, not writes

`purchaseRecommendation()` deliberately returns a recommendation instead of writing inventory levels.

The failure mode this avoids is specific and nasty: a system that sets Shopify inventory to `physical − projected demand` on every run **re-subtracts the same demand each time it runs**, and silently drains a well-stocked SKU to zero over a few days. Everything looks correct — the arithmetic is right each individual time.

Inventory writes should be an explicit decision, never a side effect of refreshing a forecast.

## Pull, don't push

This service polls the subscription engine on its own schedule rather than receiving pushes.

That direction is deliberate: **an outage in fulfilment tooling can never block or delay a billing run.** The engine has no idea whether anything is listening, and doesn't need to.

## Features

- Per-SKU weekly demand with confirmed/projected split
- Purchase-order generation against stock on hand
- Producer and supplier management, per-SKU sourcing
- Shopify inventory sync
- Packing and picking output for the warehouse

## Stack

`Node` · `Prisma` · `PostgreSQL` · Shopify Admin API

---

MIT licensed.
