// The knobs that define the schedule. Kept deliberately plain: every timing
// rule in the system derives from this file, so changing the business rules is
// a config edit, not a code change.

export const TIMEZONE = process.env.TIMEZONE || "Europe/London";

// Days deliveries are offered on. Adding a day here is the WHOLE change needed
// to start offering it — the calendar, cut-offs and slot picker all derive.
export const OFFERED_DELIVERY_DAYS = ["TUESDAY", "FRIDAY"];

// Dates that cannot be delivered on (bank holidays, carrier non-collection),
// as YYYY-MM-DD. Never offered as a slot and never billed.
export const BLACKOUT_DATES = new Set([]);

// Cut-off — the moment a box locks AND is charged.
// N days before delivery, at this hour, in TIMEZONE local time.
export const CUTOFF_DAYS_BEFORE = 2;
export const CUTOFF_HOUR = 12;

// Cancellation after charge stays open until packing starts.
export const CANCEL_CLOSES_DAYS_BEFORE = 1;
export const CANCEL_CLOSES_HOUR = 9;

// Dunning. One retry only, fired at a fixed hour the next day rather than
// +24h — a retry must land before the warehouse cut-off to be worth taking.
export const MAX_ATTEMPTS = 2;
export const RETRY_HOUR = 9;

// Pricing by box size. Bigger box, lower unit price.
export const PRICE_PER_ITEM_PENCE = { 6: 795, 8: 775, 10: 760, 12: 750, 16: 740 };
export const DEFAULT_PRICE_PER_ITEM_PENCE = 795;
export const SHIPPING_FEE_PENCE = 499;

// Rolling window: the customer ever sees the current week plus this many ahead.
export const MAX_FUTURE_WEEKS = 3;

/** Unit price for a box size, falling back to the nearest defined tier. */
export function pricePerItem(itemCount) {
  if (PRICE_PER_ITEM_PENCE[itemCount]) return PRICE_PER_ITEM_PENCE[itemCount];
  const tiers = Object.keys(PRICE_PER_ITEM_PENCE).map(Number).sort((a, b) => a - b);
  const capped = tiers.filter((t) => t <= itemCount).pop();
  return capped ? PRICE_PER_ITEM_PENCE[capped] : DEFAULT_PRICE_PER_ITEM_PENCE;
}
