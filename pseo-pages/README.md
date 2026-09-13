# pSEO Pages

Generate **native Shopify Online Store 2.0 page templates** for commercial-intent SEO — comparisons, alternatives, head-to-head and location pages — from structured data.

Not a bolt-on app. Output is theme-native, so pages inherit the store's design system, stay editable in the theme customiser by someone who doesn't write code, and don't disappear when a subscription lapses.

## The strategy: build the bottom of the funnel first

Page types are ranked by commercial intent, and that ranking *is* the build order:

| Type | Example handle | Intent |
|---|---|---|
| `alternative` | `best-competitor-alternatives` | **highest** — they know the competitor and want to leave |
| `comparison` | `yourbrand-vs-competitor` | high |
| `headToHead` | `competitor-a-vs-competitor-b` | high |
| `migration` | `how-to-switch-from-competitor` | high |
| `location` | `category-manchester` | medium |

**The head-to-head page is the sharpest one in the set.** You rank for a comparison between two rivals where *neither is you*, and intercept someone actively choosing. Neither competitor will ever write that page, so there's nothing to outrank.

Informational pages are cheap to generate and easy to rank — and they're exactly where AI answer panels have taken the click. The answer appears on the results page and nobody visits. Commercial-intent pages survive, because someone comparing two products still wants to see the products.

**A hundred comparison pages beat two thousand informational ones.**

## The quality gate

This is the part that matters, and it's why the generator refuses to emit some pages.

Google's scaled-content-abuse policy targets *"many pages generated for the primary purpose of manipulating search rankings and not helping users"* — and it says explicitly that the method is irrelevant, "whether content is produced through automation, human efforts, or a combination".

So the defence isn't "write it by hand". It's that every page carries something the others don't. Three checks enforce that, and they run **before any file is written** — a set passes as a whole or nothing gets published:

```
✗ best-x-alternatives: only 40 words unique to this page (need 150).
  This is a template with the nouns swapped.

✗ brand-vs-competitor: no structured facts. A comparison page with no
  comparison data is the exact thing the policy targets.

✗ Near-duplicate pages:
    city-leeds ≈ city-bradford (94%)
```

1. **Unique-word floor** — at least 150 words that aren't in the shared boilerplate
2. **Boilerplate ratio** — no more than 70% of a page may be template
3. **Near-duplicate detection** — pairwise Jaccard across the whole set

The failure mode this prevents isn't losing the thin pages. It's the *whole domain* getting demoted because of them.

## Usage

```js
import { buildPage, writeAll } from "./src/generate.js";

const pages = competitors.map((c) =>
  buildPage("alternative", { competitor: c.name, region: "UK" }, {
    body: c.prose,                              // real, per-competitor copy
    facts: [                                    // real, per-competitor data
      { label: "Price per box", value: c.price },
      { label: "Minimum order", value: c.minimum },
      { label: "Delivery days", value: c.days.join(", ") },
    ],
  }),
);

writeAll(pages, { outDir: "output", boilerplate: sharedIntro });
```

Drop the generated `page.*.json` files into the theme's `templates/` directory alongside a matching section, and each becomes a real page with a `/pages/<handle>` URL.

```bash
npm test        # the validation rules
```

## Notes from building this at scale

- **Structured facts are the moat.** Real prices, dates, delivery days and specifications are what make a page worth landing on and what a competitor can't copy. A page with no data table is filler.
- **Pillar pages matter more than page count.** A hub linking every comparison page is what stops them looking like orphaned doorways.
- **Refresh the facts.** A comparison page with last year's prices is worse than no page — it's actively wrong, and it's the reason these sets decay.

## Stack

`Node` · Shopify Online Store 2.0 JSON templates · Liquid sections

---

MIT licensed.
