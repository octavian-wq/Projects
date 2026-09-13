// Emit Shopify Online Store 2.0 page templates.
//
// Output is a JSON template plus a section — the same shape the theme editor
// produces. That matters: the pages are native to the theme, inherit its design
// system, stay editable by a non-developer in the customiser, and need no
// third-party app subscription to serve.
//
// Most SEO tooling bolts pages on via an app or a subdomain. Those pages never
// look like the store, and they stop existing when the subscription lapses.

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { PAGE_TYPES, slug } from "./pagetypes.js";
import { assertSubstantive, assertDistinct } from "./validate.js";

/** Build one page definition from a row of data. */
export function buildPage(type, data, { body, facts }) {
  const spec = PAGE_TYPES[type];
  if (!spec) throw new Error(`Unknown page type: ${type}`);

  const missing = spec.needs.filter((k) => !data[k]);
  if (missing.length) {
    throw new Error(`${type} needs ${missing.join(", ")}`);
  }

  return {
    type,
    intent: spec.intent,
    handle: spec.handle(data),
    title: spec.title(data),
    body,
    facts,
  };
}

/** The Online Store 2.0 template JSON for a page. */
export function toTemplate(page, { section = "seo-landing" } = {}) {
  return {
    sections: {
      main: {
        type: section,
        settings: {
          heading: page.title,
          body: page.body,
          facts: JSON.stringify(page.facts),
        },
      },
    },
    order: ["main"],
  };
}

/**
 * Write a whole set, refusing to emit anything thin or duplicated.
 * The validation runs before any file is written — a set either passes as a
 * whole or nothing is published.
 */
export function writeAll(pages, { outDir = "output", boilerplate = "" } = {}) {
  for (const page of pages) assertSubstantive(page, boilerplate);
  assertDistinct(pages);

  mkdirSync(outDir, { recursive: true });
  const written = [];

  for (const page of pages) {
    const file = join(outDir, `page.${page.handle}.json`);
    writeFileSync(file, JSON.stringify(toTemplate(page), null, 2));
    written.push({ file, handle: page.handle, intent: page.intent });
  }

  // Highest intent first — this is the build order, not just a sort.
  const rank = { highest: 0, high: 1, medium: 2, low: 3 };
  written.sort((a, b) => rank[a.intent] - rank[b.intent]);
  return written;
}

export { slug, PAGE_TYPES };
