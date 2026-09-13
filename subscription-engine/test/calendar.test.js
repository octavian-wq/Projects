// The cut-off rules are the part of a subscription engine most likely to be
// quietly wrong, and most expensive when it is. These tests pin the behaviour
// across a daylight-saving boundary, which is where naive date maths breaks.

import { test } from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import { generateUpcomingDeliveries, cutoffFor, availableSlots } from "../src/calendar.js";

const uk = (iso) => DateTime.fromISO(iso, { zone: "Europe/London" });

test("cut-off is two days before delivery at noon local", () => {
  const delivery = uk("2026-10-23T12:00");      // Friday
  const cutoff = cutoffFor(delivery);
  assert.equal(cutoff.toISODate(), "2026-10-21"); // Wednesday
  assert.equal(cutoff.hour, 12);
});

test("cut-off stays at noon local across the DST change", () => {
  // UK clocks go back on 25 Oct 2026. A delivery after the change still has a
  // cut-off before it — the naive UTC version of this lands at 11:00 or 13:00.
  const delivery = uk("2026-10-27T12:00");
  const cutoff = cutoffFor(delivery);
  assert.equal(cutoff.hour, 12, "cut-off must remain noon in local time");
  assert.equal(cutoff.toISODate(), "2026-10-25");
});

test("generates the requested number of weekly deliveries on the right day", () => {
  const out = generateUpcomingDeliveries({
    usualDeliveryDay: "FRIDAY",
    count: 4,
    from: uk("2026-10-01T09:00"),
  });
  assert.equal(out.length, 4);
  assert.ok(out.every((d) => d.deliveryDay === "FRIDAY"));
  assert.ok(out[1].deliveryDate > out[0].deliveryDate);
});

test("fortnightly subscriptions skip a week", () => {
  const out = generateUpcomingDeliveries({
    usualDeliveryDay: "TUESDAY",
    frequencyWeeks: 2,
    count: 2,
    from: uk("2026-10-01T09:00"),
  });
  const gapDays =
    (out[1].deliveryDate - out[0].deliveryDate) / (1000 * 60 * 60 * 24);
  assert.equal(gapDays, 14);
});

test("a slot stops being bookable once its own cut-off passes", () => {
  // Wednesday 13:00 — one hour after Friday's noon cut-off.
  const slots = availableSlots({ from: uk("2026-10-21T13:00"), weeksAhead: 1 });
  const friday = slots.find((s) => s.deliveryDate.toISOString().startsWith("2026-10-23"));
  assert.equal(friday.bookable, false);
});
