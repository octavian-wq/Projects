// Guardrails.
//
// These run BEFORE the model, not after it. A safety check that depends on the
// model behaving correctly is not a safety check — it's a hope. The whole point
// is that these hold even if the model is jailbroken, degraded, or down.

/**
 * Topics that must always reach a human, regardless of what the knowledge base
 * says or how confident a model is.
 *
 * For a food business this is allergens and medical questions: an answer that
 * is 99% reliable is not acceptable when the 1% is anaphylaxis. Adjust the
 * list to whatever carries irreversible consequences in your domain.
 */
const ALWAYS_ESCALATE = [
  /\ballerg(y|ies|en|ic)\b/i,
  /\banaphyla/i,
  /\bcoeliac\b|\bceliac\b/i,
  /\bintoleran(t|ce)\b/i,
  /\bgluten\b|\bnut[s]?\b|\bpeanut/i,
  /\bpregnan(t|cy)\b/i,
  /\bdiabet(es|ic)\b/i,
  /\bmedication\b|\bprescri(bed|ption)\b/i,
  /\bill\b|\bsick\b|\bfood poison/i,
  /\bhospital\b|\bdoctor\b|\bgp\b/i,
];

/** True if the message must bypass the model entirely and go to a human. */
export function mustEscalate(message) {
  return ALWAYS_ESCALATE.some((re) => re.test(message));
}

/**
 * The fail-safe. Every error path in the router ends here.
 *
 * The critical property: an unparseable response, a timeout, a missing
 * knowledge base or a model outage all produce an ESCALATION, never a silent
 * auto-reply and never a dropped message. The system's worst case is "a human
 * has to read this", which is the same as its normal case on a hard question.
 */
export function safeEscalate(reason) {
  return {
    route: "escalate",
    reply: null,
    team: "unassigned",
    confidence: 0,
    reasoning: `Failed safe: ${reason}`,
  };
}

/**
 * Strip the tells that make a reply read as machine-written.
 *
 * Not cosmetic. Support replies that read as generated get treated as
 * dismissive, and customers escalate *because* of the tone rather than the
 * content. Keep these rules in sync with the style instructions in the prompt.
 */
export function sanitiseReply(text) {
  return text
    .replace(/[—–]/g, "-")
    .replace(/\b(I apologize|I sincerely apologize)\b/gi, "Sorry")
    .replace(/\b(Rest assured|Please rest assured)\b[,]?\s*/gi, "")
    .replace(/\b(delve|leverage|utilise|utilize)\b/gi, (m) =>
      ({ delve: "look", leverage: "use", utilise: "use", utilize: "use" })[m.toLowerCase()],
    )
    .replace(/\s{2,}/g, " ")
    .trim();
}
