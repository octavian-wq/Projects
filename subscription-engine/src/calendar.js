// The calendar — turns a subscription into dated deliveries with correct
// cut-offs.
//
// Every calculation is done in the merchant's local timezone and only then
// converted to an absolute instant. This is not fussiness: a subscription
// engine that does date arithmetic on UTC timestamps will silently shift every
// cut-off by an hour when the clocks change, charging a day's customers early
// or locking their boxes late, twice a year.

import { DateTime } from "luxon";
import {
  TIMEZONE,
  OFFERED_DELIVERY_DAYS,
  BLACKOUT_DATES,
  CUTOFF_DAYS_BEFORE,
  CUTOFF_HOUR,
  CANCEL_CLOSES_DAYS_BEFORE,
  CANCEL_CLOSES_HOUR,
} from "./config.js";

const WEEKDAY = {
  MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4,
  FRIDAY: 5, SATURDAY: 6, SUNDAY: 7,
};
const WEEKDAY_NAME = Object.fromEntries(
  Object.entries(WEEKDAY).map(([name, n]) => [n, name]),
);

/** The next occurrence of `day` on or after `fromDt`, at midday local. */
export function nextDeliveryOnOrAfter(fromDt, day) {
  const add = (WEEKDAY[day] - fromDt.weekday + 7) % 7;
  return fromDt.plus({ days: add }).startOf("day").set({ hour: 12 });
}

/** When a delivery locks and is charged. */
export function cutoffFor(deliveryDt) {
  return deliveryDt
    .minus({ days: CUTOFF_DAYS_BEFORE })
    .startOf("day")
    .set({ hour: CUTOFF_HOUR });
}

/** Last moment a charged order can still be pulled before packing. */
export function cancelClosesFor(deliveryDt) {
  return deliveryDt
    .minus({ days: CANCEL_CLOSES_DAYS_BEFORE })
    .startOf("day")
    .set({ hour: CANCEL_CLOSES_HOUR });
}

/** Describe one delivery: date, day, cut-off, cancel-close. */
export function buildDelivery(deliveryDt) {
  return {
    deliveryDate: deliveryDt.toJSDate(),
    deliveryDay: WEEKDAY_NAME[deliveryDt.weekday],
    cutoffAt: cutoffFor(deliveryDt).toJSDate(),
    cancelClosesAt: cancelClosesFor(deliveryDt).toJSDate(),
  };
}

/** Is this date deliverable at all? */
export function isBlackout(dt) {
  return BLACKOUT_DATES.has(dt.toISODate());
}

/**
 * The upcoming deliveries for a subscription, skipping blackout dates.
 * Pure: give it a clock and it is fully deterministic, which is what makes
 * the cut-off rules testable without freezing system time.
 */
export function generateUpcomingDeliveries({
  usualDeliveryDay,
  frequencyWeeks = 1,
  count = 4,
  from = DateTime.now(),
}) {
  const fromDt = from.setZone(TIMEZONE).startOf("day");
  let cursor = nextDeliveryOnOrAfter(fromDt, usualDeliveryDay);
  const out = [];

  while (out.length < count) {
    if (!isBlackout(cursor)) out.push(buildDelivery(cursor));
    cursor = cursor.plus({ weeks: frequencyWeeks });
  }
  return out;
}

/**
 * Slots a customer could move a delivery to. A slot is only bookable while its
 * own cut-off is still in the future — that is the entire "you need N days
 * notice" rule, expressed once.
 */
export function availableSlots({
  from = DateTime.now(),
  days = OFFERED_DELIVERY_DAYS,
  weeksAhead = 4,
} = {}) {
  const now = from.setZone(TIMEZONE);
  const today = now.startOf("day");
  const seen = new Set();
  const slots = [];

  for (let w = 0; w < weeksAhead; w++) {
    for (const day of days) {
      const slot = nextDeliveryOnOrAfter(today, day).plus({ weeks: w });
      const key = slot.toISODate();
      if (seen.has(key) || isBlackout(slot)) continue;
      seen.add(key);
      slots.push({
        deliveryDate: slot.toJSDate(),
        deliveryDay: day,
        bookable: now < cutoffFor(slot),
      });
    }
  }
  return slots.sort((a, b) => a.deliveryDate - b.deliveryDate);
}

/** Deliveries whose cut-off has passed and which are still awaiting billing. */
export function isDue(delivery, now = DateTime.now()) {
  return (
    delivery.status === "SCHEDULED" &&
    now.setZone(TIMEZONE) >= DateTime.fromJSDate(delivery.cutoffAt).setZone(TIMEZONE)
  );
}
