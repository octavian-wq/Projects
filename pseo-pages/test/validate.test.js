import { test } from "node:test";
import assert from "node:assert/strict";
import { assertSubstantive, assertDistinct, ThinContentError } from "../src/validate.js";
import { buildPage } from "../src/generate.js";

const longBody = (topic) =>
  `${topic} `.repeat(20) +
  Array.from({ length: 200 }, (_, i) => `${topic}word${i}`).join(" ");

test("rejects a page that is boilerplate with the nouns swapped", () => {
  const boilerplate = longBody("shared");
  const page = { handle: "thin-page", body: boilerplate + " brandname", facts: [{ a: 1 }] };
  assert.throws(() => assertSubstantive(page, boilerplate), ThinContentError);
});

test("accepts a page with genuinely unique content", () => {
  const page = { handle: "real-page", body: longBody("unique"), facts: [{ price: "£10" }] };
  assert.equal(assertSubstantive(page, "some shared boilerplate"), true);
});

test("rejects a comparison page with no comparison data", () => {
  const page = { handle: "no-facts", body: longBody("unique"), facts: [] };
  assert.throws(() => assertSubstantive(page, ""), /no structured facts/);
});

test("catches near-duplicate pages across the set", () => {
  const body = longBody("same");
  assert.throws(
    () => assertDistinct([
      { handle: "a", body },
      { handle: "b", body: body + " tiny" },
    ]),
    /Near-duplicate/,
  );
});

test("head-to-head handles two competitors, neither of them the brand", () => {
  const page = buildPage(
    "headToHead",
    { competitorA: "Brand One", competitorB: "Brand Two" },
    { body: longBody("compare"), facts: [{ price: 1 }] },
  );
  assert.equal(page.handle, "brand-one-vs-brand-two");
  assert.equal(page.intent, "high");
});

test("refuses to build a page missing required data", () => {
  assert.throws(
    () => buildPage("comparison", { brand: "Mine" }, { body: "x", facts: [] }),
    /needs competitor/,
  );
});
