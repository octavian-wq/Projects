// The routing engine.
//
// Every inbound message resolves to exactly one of three outcomes:
//
//   auto_answer          fully answerable from the knowledge base; the reply
//                        goes straight to the customer
//   acknowledge_and_queue needs a human to DO something; the customer gets an
//                        acknowledgement now and an agent gets a drafted reply
//   escalate             held entirely for a human
//
// Three outcomes rather than "bot or human" is the design decision that makes
// this usable. Most real support volume is the middle case: the question is
// understood perfectly, but answering it requires changing something. Pretending
// that's automatable produces confident lies; routing it to a human with a draft
// already written removes most of the work without any of the risk.

import Anthropic from "@anthropic-ai/sdk";
import { mustEscalate, safeEscalate, sanitiseReply } from "./guardrails.js";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL_JUDGEMENT = process.env.MODEL_JUDGEMENT || "claude-sonnet-5";
const MODEL_FAST = process.env.MODEL_FAST || "claude-haiku-4-5-20251001";

const SYSTEM = `You are the support router for a subscription commerce business.

Classify the customer's message into exactly one route:

- "auto_answer": the knowledge base fully answers it. Write the complete reply.
- "acknowledge_and_queue": you understand it, but answering requires someone to
  take an action (refund, change an order, check a delivery). Draft the reply an
  agent will confirm and send.
- "escalate": anything about health, safety, complaints about harm, legal
  threats, or anything the knowledge base does not cover. Do not draft a reply.

Rules:
- Never invent policy. If the knowledge base does not say it, you do not know it.
- If you are not confident, escalate. Escalating is cheap; being wrong is not.
- British English. No emoji. Warm and plain, not corporate.

Respond with JSON only:
{"route": "...", "reply": "..." | null, "team": "tech"|"ops"|"unassigned",
 "confidence": 0.0-1.0, "reasoning": "one line"}`;

/**
 * Route one message.
 *
 * The knowledge base is injected at request time rather than baked into a
 * fine-tune or a static prompt file. Editing an answer changes the system's
 * behaviour immediately, with no redeploy — which means the support team owns
 * the answers, not the developer.
 */
export async function routeMessage(message, { knowledgeBase, fast = false } = {}) {
  // Guardrail 1 — runs before any model call, so it cannot be prompted away.
  if (mustEscalate(message)) {
    return {
      route: "escalate",
      reply: null,
      team: "unassigned",
      confidence: 1,
      reasoning: "Matched always-escalate topic (health/allergen)",
    };
  }

  if (!knowledgeBase?.length) return safeEscalate("knowledge base unavailable");

  try {
    const response = await client.messages.create({
      model: fast ? MODEL_FAST : MODEL_JUDGEMENT,
      max_tokens: 1024,
      system: [
        { type: "text", text: SYSTEM },
        {
          // Cached: the knowledge base is large, identical across requests, and
          // re-sending it uncached on every message is the dominant cost.
          type: "text",
          text: `KNOWLEDGE BASE\n\n${knowledgeBase.map((k) => `## ${k.question}\n${k.answer}`).join("\n\n")}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: message }],
    });

    const text = response.content.find((b) => b.type === "text")?.text ?? "";
    const parsed = parseJson(text);
    if (!parsed) return safeEscalate("could not parse model response");

    if (!["auto_answer", "acknowledge_and_queue", "escalate"].includes(parsed.route)) {
      return safeEscalate(`unknown route "${parsed.route}"`);
    }

    // Guardrail 2 — a low-confidence auto-answer is downgraded, not sent.
    if (parsed.route === "auto_answer" && (parsed.confidence ?? 0) < 0.8) {
      return { ...parsed, route: "acknowledge_and_queue" };
    }

    return { ...parsed, reply: parsed.reply ? sanitiseReply(parsed.reply) : null };
  } catch (err) {
    // Guardrail 3 — every failure lands here. Nothing is ever auto-sent on error.
    return safeEscalate(err.message);
  }
}

function parseJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}
