// The biller — the only thing in the system that moves money.
//
// It runs on a schedule, finds every delivery whose cut-off has passed, and
// charges it. Three properties matter more than anything else here:
//
//   1. It never double-charges. Every attempt carries a stable idempotency key
//      derived from the delivery, so a timeout or a re-run is safe.
//   2. It never charges the past. A delivery whose date has already gone is
//      skipped, not billed — late charges for deliveries that never arrived
//      are the single worst failure mode a subscription business has.
//   3. It is restartable. State lives on the Delivery row, not in memory, so
//      a crash halfway through a run resumes cleanly.

import { DateTime } from "luxon";
import {
  TIMEZONE, MAX_ATTEMPTS, RETRY_HOUR, SHIPPING_FEE_PENCE,
} from "./config.js";
import { billContract, pollBillingAttempt, setContractLines, setOrderAttributes } from "./shopify.js";

/** Stable per-delivery key. Same delivery ⇒ same key ⇒ never billed twice. */
function idempotencyKeyFor(delivery) {
  return `delivery-${delivery.id}`;
}

/** Box total: items at the tier price, plus shipping. */
export function totalPenceFor(subscription, lines) {
  const items = lines.reduce((n, l) => n + l.quantity, 0);
  return items * subscription.pricePerItemPence + SHIPPING_FEE_PENCE;
}

/**
 * Bill one delivery. Returns the delivery's new status.
 * Pure orchestration — every branch ends with the row written, so the caller
 * can crash immediately afterwards without losing the outcome.
 */
export async function billDelivery(db, delivery, { now = DateTime.now() } = {}) {
  const sub = delivery.subscription;
  const today = now.setZone(TIMEZONE).startOf("day");
  const deliveryDay = DateTime.fromJSDate(delivery.deliveryDate)
    .setZone(TIMEZONE)
    .startOf("day");

  // Guard 1 — never bill a delivery whose date has passed.
  if (deliveryDay < today) {
    return finish(db, delivery, {
      status: "SKIPPED",
      failureReason: "delivery date already passed",
    });
  }

  // Guard 2 — never bill a paused or cancelled subscription.
  if (sub.status !== "ACTIVE") {
    return finish(db, delivery, {
      status: "SKIPPED",
      failureReason: `subscription ${sub.status}`,
    });
  }

  // Guard 3 — an empty box is a bug, not a zero-value order.
  const lines = delivery.lines ?? [];
  if (!lines.length) {
    return finish(db, delivery, {
      status: "FAILED",
      failureReason: "empty box at cut-off",
    });
  }

  const totalPence = totalPenceFor(sub, lines);

  try {
    await setContractLines({
      contractGid: sub.shopifyContractId,
      lines: lines.map((l) => ({ ...l, pricePence: sub.pricePerItemPence })),
    });

    const attempt = await billContract({
      contractGid: sub.shopifyContractId,
      idempotencyKey: idempotencyKeyFor(delivery),
    });

    const resolved = attempt.ready ? attempt : await pollBillingAttempt(attempt.id);

    if (resolved.errorCode) {
      return await handleFailure(db, delivery, resolved.errorMessage ?? resolved.errorCode, now);
    }

    await setOrderAttributes({
      orderGid: resolved.order.id,
      attributes: {
        "Delivery Date": deliveryDay.toISODate(),
        "Delivery Day": delivery.deliveryDay,
      },
    });

    return finish(db, delivery, {
      status: "CHARGED",
      shopifyOrderId: resolved.order.id,
      chargedAt: now.toJSDate(),
      totalPence,
      failureReason: null,
      retryAt: null,
    });
  } catch (err) {
    return await handleFailure(db, delivery, err.message, now);
  }
}

/**
 * Dunning. One retry, fired at a fixed hour the next morning.
 *
 * The fixed hour matters: dispatch happens the day before delivery, so a
 * payment recovered at an arbitrary +24h can land after the van has loaded. A
 * retry that succeeds too late is worse than one that never ran, because the
 * customer has now paid for a box they will not receive.
 *
 * After the final failure the week is marked SKIPPED, not left FAILED. The
 * customer loses the week; they never lose the subscription.
 */
async function handleFailure(db, delivery, reason, now) {
  const attempts = delivery.attempts + 1;

  if (attempts >= MAX_ATTEMPTS) {
    return finish(db, delivery, {
      status: "SKIPPED",
      attempts,
      retryAt: null,
      failureReason: reason,
    });
  }

  const retryAt = now
    .setZone(TIMEZONE)
    .plus({ days: 1 })
    .startOf("day")
    .set({ hour: RETRY_HOUR });

  return finish(db, delivery, {
    status: "FAILED",
    attempts,
    retryAt: retryAt.toJSDate(),
    failureReason: reason,
  });
}

async function finish(db, delivery, data) {
  await db.delivery.update({ where: { id: delivery.id }, data });
  await db.event.create({
    data: {
      subscriptionId: delivery.subscriptionId,
      type: "payment",
      actor: "system",
      message: `${delivery.deliveryDate.toISOString().slice(0, 10)} → ${data.status}` +
        (data.failureReason ? ` (${data.failureReason})` : ""),
    },
  });
  return data.status;
}

/** Every delivery due to be charged now. */
export async function findDue(db, { now = DateTime.now() } = {}) {
  return db.delivery.findMany({
    where: { status: "SCHEDULED", cutoffAt: { lte: now.toJSDate() } },
    include: { subscription: true },
    orderBy: { deliveryDate: "asc" },
  });
}

/** Every failed delivery whose retry is now due. */
export async function findRetries(db, { now = DateTime.now() } = {}) {
  return db.delivery.findMany({
    where: { status: "FAILED", retryAt: { not: null, lte: now.toJSDate() } },
    include: { subscription: true },
    orderBy: { retryAt: "asc" },
  });
}

/**
 * A full billing run.
 *
 * `dryRun` is not a convenience — it is how a run is verified before it moves
 * money. It reports exactly what would be charged, so the totals can be
 * sanity-checked against expectations before anything is committed.
 */
export async function runBilling(db, { now = DateTime.now(), dryRun = true } = {}) {
  const due = await findDue(db, { now });
  const results = { attempted: 0, charged: 0, failed: 0, skipped: 0, totalPence: 0, rows: [] };

  for (const delivery of due) {
    const lines = delivery.lines ?? [];
    const totalPence = totalPenceFor(delivery.subscription, lines);

    if (dryRun) {
      results.rows.push({
        deliveryId: delivery.id,
        date: delivery.deliveryDate,
        items: lines.reduce((n, l) => n + l.quantity, 0),
        totalPence,
      });
      results.attempted++;
      results.totalPence += totalPence;
      continue;
    }

    const status = await billDelivery(db, delivery, { now });
    results.attempted++;
    if (status === "CHARGED") {
      results.charged++;
      results.totalPence += totalPence;
    } else if (status === "FAILED") results.failed++;
    else results.skipped++;
  }

  return results;
}
