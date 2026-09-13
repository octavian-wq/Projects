# Hydrogen Portal

A headless Shopify **Hydrogen** customer portal for subscription management — where subscribers edit an upcoming box, skip a week, change their delivery day, pause, or reactivate.

## The one rule that matters

**The portal must agree with the biller exactly.**

If the portal believes a box is editable for one minute longer than the engine does, a customer edits a box that has already been charged and packed. That doesn't surface as an error — it surfaces as a complaint, weeks later, about a box that arrived with the wrong contents.

So editability is derived from the **same cut-off instant the engine stores on the delivery row**. The portal never recomputes it from a date string and never applies its own "minus 48 hours" rule.

That sounds obvious. It's the most common bug in portals of this kind, because the portal usually gets built first, against a rule written in a spec, and then the engine's rule changes.

## Lock states, explained rather than disabled

A greyed-out button with no explanation generates a support ticket. Every non-editable state carries a reason:

| State | What the customer sees |
|---|---|
| Editable | Full editing |
| Past cut-off, not yet charged | "The cut-off for this week has passed." |
| Charged, cancel still open | "This box is paid for and being prepared. You can still cancel it." |
| Charged, packing closed | "This box is packed and on its way." |
| Skipped | "You skipped this week." |

## Features

- Rolling calendar of upcoming boxes with per-week lock state
- Edit box contents up to the cut-off
- Skip a week, pause with an auto-resume date, cancel
- Change usual delivery day, with only genuinely bookable slots offered
- Order history and upcoming charge preview

## Stack

`Hydrogen` · `Remix` · `TypeScript` · `Tailwind` · Shopify Customer Account API

---

MIT licensed.
