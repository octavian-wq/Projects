# AI Support Desk

An LLM support agent for commerce, built so the guardrails hold even when the model doesn't.

Every inbound message is routed to exactly one of three outcomes:

| Route | What happens |
|---|---|
| `auto_answer` | Fully answerable from the knowledge base. Reply goes straight to the customer. |
| `acknowledge_and_queue` | Understood, but answering needs someone to *do* something. Customer gets an acknowledgement now; an agent gets a drafted reply to confirm. |
| `escalate` | Held entirely for a human. No draft, no auto-send. |

## Why three routes, not "bot or human"

Most real support volume is the middle case. The question is understood perfectly — *"can you move Friday's delivery to Tuesday?"* — but answering it means changing something.

Treating that as automatable produces confident lies. Treating it as un-automatable means a human writes every reply from scratch. Routing it to a human **with the reply already drafted** removes most of the work and none of the accountability.

## The guardrails

The engineering here is in the safety, not the prompt.

**1. Hard topics never reach the model.** A regex pre-filter forces escalation on allergen and medical questions *before any API call*. It cannot be prompt-injected away, and it still works if the model is degraded or down.

```js
if (mustEscalate(message)) return { route: "escalate", reply: null, ... };
```

For a food business that list is allergens and health. An answer that's 99% reliable is not acceptable when the 1% is anaphylaxis.

**2. Every failure path fails safe.** Unparseable response, timeout, missing knowledge base, unknown route value — all of them land in `safeEscalate()` and produce an escalation. The system **never auto-sends on error** and never silently drops a message.

The worst case is "a human has to read this", which is also the normal case for any hard question.

**3. Low confidence is downgraded, not sent.** An `auto_answer` below 0.8 confidence becomes `acknowledge_and_queue` — a human sees it before the customer does.

## Knowledge base as live config

The knowledge base is injected into the system prompt at request time, not baked into a prompt file or a fine-tune. Editing an answer changes behaviour immediately, with no redeploy.

That's an ownership decision as much as a technical one: **the support team owns the answers, not the developer.**

It's sent as a cached prompt block, since it's large and identical across requests — uncached, re-sending it on every message is the dominant cost of running this.

## Model split

Judgement work (inbound email, admin triage) uses the stronger model. The live storefront widget uses the fast one, where a reply that arrives in 800ms and is slightly plainer beats one that arrives in four seconds.

## Reply style

Generated support replies get treated as dismissive — customers escalate because of the tone, not the content. `sanitiseReply()` strips the giveaways (em-dashes, "I apologize", "rest assured", "leverage") to match the plain British-English style the prompt asks for.

Cosmetic-looking, measurably not.

## Running it

```bash
cp .env.example .env    # add ANTHROPIC_API_KEY
npm install
npm test                # guardrail tests — these are the ones that matter
```

```js
import { routeMessage } from "./src/router.js";

const result = await routeMessage("Can I skip next week?", {
  knowledgeBase: [{ question: "Can I skip a week?", answer: "Yes - before the cut-off..." }],
});
// → { route: "auto_answer", reply: "...", confidence: 0.95 }
```

## Stack

`Node` · `Anthropic SDK` · prompt caching · designed to sit behind React Router / Prisma / Resend for the full helpdesk

---

MIT licensed.
