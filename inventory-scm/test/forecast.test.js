import { test } from "node:test";
import assert from "node:assert/strict";
import { forecastWeek, purchaseRecommendation } from "../src/forecast.js";

test("chosen boxes count as confirmed, not projected", () => {
  const out = forecastWeek([
    { upcomingLineItems: [{ sku: "A", quantity: 2 }] },
    { upcomingLineItems: [{ sku: "A", quantity: 1 }] },
  ]);
  assert.equal(out[0].sku, "A");
  assert.equal(out[0].confirmed, 3);
  assert.equal(out[0].projected, 0);
  assert.equal(out[0].certainty, 1);
});

test("unchosen boxes project from the previous selection at the repeat rate", () => {
  const out = forecastWeek(
    [{ upcomingLineItems: [], previousLineItems: [{ sku: "B", quantity: 10 }] }],
    { repeatRate: 0.8 },
  );
  assert.equal(out[0].projected, 8);
  assert.equal(out[0].confirmed, 0);
});

test("certainty separates what is known from what is modelled", () => {
  const out = forecastWeek([
    { upcomingLineItems: [{ sku: "C", quantity: 5 }] },
    { upcomingLineItems: [], previousLineItems: [{ sku: "C", quantity: 5 }] },
  ], { repeatRate: 1 });
  assert.equal(out[0].confirmed, 5);
  assert.equal(out[0].projected, 5);
  assert.equal(out[0].certainty, 0.5);
});

test("purchase recommendation subtracts stock on hand and adds a buffer", () => {
  const forecast = [{ sku: "D", confirmed: 100, projected: 0, total: 100, certainty: 1 }];
  const [row] = purchaseRecommendation(forecast, { D: 50 }, { buffer: 0.1 });
  assert.equal(row.need, 110);
  assert.equal(row.order, 60);
});

test("nothing to order when stock already covers demand", () => {
  const forecast = [{ sku: "E", confirmed: 10, projected: 0, total: 10, certainty: 1 }];
  assert.equal(purchaseRecommendation(forecast, { E: 500 }).length, 0);
});
