import { test } from "node:test";
import assert from "node:assert/strict";
import { mustEscalate, safeEscalate, sanitiseReply } from "../src/guardrails.js";

test("allergen and medical questions escalate before any model call", () => {
  for (const msg of [
    "Does this contain nuts?",
    "I'm coeliac, is the pasta safe?",
    "My son had an allergic reaction",
    "I'm pregnant, can I eat this?",
    "I think the chicken made me sick",
  ]) {
    assert.equal(mustEscalate(msg), true, `should escalate: ${msg}`);
  }
});

test("ordinary questions are not force-escalated", () => {
  for (const msg of [
    "When is my next delivery?",
    "Can I change my delivery day to Friday?",
    "How do I pause for two weeks?",
  ]) {
    assert.equal(mustEscalate(msg), false, `should not escalate: ${msg}`);
  }
});

test("failing safe never produces a sendable reply", () => {
  const out = safeEscalate("model timeout");
  assert.equal(out.route, "escalate");
  assert.equal(out.reply, null);
  assert.equal(out.confidence, 0);
});

test("sanitiser removes AI tells", () => {
  const out = sanitiseReply("I apologize — rest assured we will leverage our team");
  assert.ok(!out.includes("—"));
  assert.ok(!/apologize/i.test(out));
  assert.ok(!/leverage/i.test(out));
});
