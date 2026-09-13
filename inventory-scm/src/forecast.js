// Demand forecasting for a subscription operation.
//
// A subscription business has an advantage almost no other retailer has: next
// week's orders already exist. Demand isn't predicted from history — it's read
// from the upcoming subscription lines. History only fills the gap for boxes
// that haven't been chosen yet.

/**
 * Per-SKU demand for a delivery week.
 *
 * @param subscriptions upcoming subscription lines from the engine's
 *   /integrations/subscriptions endpoint
 * @param repeatRate    share of unchosen boxes expected to auto-fill from the
 *   customer's previous selection at cut-off
 */
export function forecastWeek(subscriptions, { repeatRate = 0.85 } = {}) {
  const confirmed = new Map();
  const projected = new Map();

  for (const sub of subscriptions) {
    const lines = sub.upcomingLineItems ?? [];

    if (lines.length) {
      // Already chosen — this is not a forecast, it's a fact.
      for (const line of lines) {
        confirmed.set(line.sku, (confirmed.get(line.sku) ?? 0) + line.quantity);
      }
      continue;
    }

    // Not yet chosen. At cut-off most of these auto-fill from last time.
    for (const line of sub.previousLineItems ?? []) {
      const expected = line.quantity * repeatRate;
      projected.set(line.sku, (projected.get(line.sku) ?? 0) + expected);
    }
  }

  const skus = new Set([...confirmed.keys(), ...projected.keys()]);

  return [...skus]
    .map((sku) => {
      const c = confirmed.get(sku) ?? 0;
      const p = projected.get(sku) ?? 0;
      return {
        sku,
        confirmed: c,
        projected: Math.round(p),
        total: c + Math.round(p),
        // How much of this number is real vs modelled. A buyer ordering stock
        // needs to know the difference — 100% confirmed can be ordered exactly,
        // 20% confirmed needs a buffer.
        certainty: c + p > 0 ? c / (c + p) : 0,
      };
    })
    .sort((a, b) => b.total - a.total);
}

/**
 * Stock to order, given what's already on hand.
 *
 * Deliberately returns a RECOMMENDATION rather than writing stock levels.
 *
 * The failure mode this avoids: a system that sets Shopify inventory to
 * `physical − projected demand` on every run re-subtracts the same demand each
 * time it runs, and silently drains a well-stocked SKU to zero over a few days.
 * Inventory writes should be an explicit decision, not a side effect of a
 * forecast refresh.
 */
export function purchaseRecommendation(forecast, onHand, { buffer = 0.1 } = {}) {
  return forecast
    .map((row) => {
      const have = onHand[row.sku] ?? 0;
      // Round to 6dp before ceiling: 100 * 1.1 is 110.00000000000001 in
      // binary floating point, which would otherwise order one unit too many
      // on every line, every week.
      const need = Math.ceil(Number((row.total * (1 + buffer)).toFixed(6)));
      return { sku: row.sku, have, need, order: Math.max(0, need - have), certainty: row.certainty };
    })
    .filter((row) => row.order > 0);
}
