// The quality gate.
//
// Google's scaled-content-abuse policy is not about whether a machine wrote the
// page. It targets "many pages generated for the primary purpose of manipulating
// search rankings and not helping users" — the method is explicitly irrelevant.
//
// So the defence is not "write it by hand". The defence is that every page
// carries something the others don't. These checks refuse to emit a page that
// is a noun-swap of its neighbours, which is the pattern that gets a whole
// domain demoted rather than just the thin pages.

const MIN_UNIQUE_WORDS = 150;
const MAX_SHARED_RATIO = 0.7;

export class ThinContentError extends Error {}

/** Words that appear in this page's prose but not in the shared boilerplate. */
function uniqueWords(body, boilerplate) {
  const shared = new Set(tokenise(boilerplate));
  return tokenise(body).filter((w) => !shared.has(w));
}

const tokenise = (s) =>
  String(s).toLowerCase().replace(/<[^>]+>/g, " ").match(/[a-z0-9']{3,}/g) ?? [];

/**
 * Reject a page that is mostly template.
 * @throws ThinContentError
 */
export function assertSubstantive(page, boilerplate = "") {
  const unique = uniqueWords(page.body, boilerplate);
  const total = tokenise(page.body).length;

  if (unique.length < MIN_UNIQUE_WORDS) {
    throw new ThinContentError(
      `${page.handle}: only ${unique.length} words unique to this page ` +
      `(need ${MIN_UNIQUE_WORDS}). This is a template with the nouns swapped.`,
    );
  }

  const sharedRatio = total ? 1 - unique.length / total : 1;
  if (sharedRatio > MAX_SHARED_RATIO) {
    throw new ThinContentError(
      `${page.handle}: ${Math.round(sharedRatio * 100)}% shared with boilerplate ` +
      `(max ${MAX_SHARED_RATIO * 100}%).`,
    );
  }

  if (!page.facts?.length) {
    throw new ThinContentError(
      `${page.handle}: no structured facts. A comparison page with no comparison ` +
      `data is the exact thing the policy targets.`,
    );
  }

  return true;
}

/** Near-duplicate detection across the whole generated set. */
export function assertDistinct(pages, { threshold = 0.9 } = {}) {
  const sets = pages.map((p) => new Set(tokenise(p.body)));
  const clashes = [];

  for (let i = 0; i < pages.length; i++) {
    for (let j = i + 1; j < pages.length; j++) {
      const [a, b] = [sets[i], sets[j]];
      const overlap = [...a].filter((w) => b.has(w)).length;
      const jaccard = overlap / (a.size + b.size - overlap);
      if (jaccard > threshold) {
        clashes.push(`${pages[i].handle} ≈ ${pages[j].handle} (${Math.round(jaccard * 100)}%)`);
      }
    }
  }

  if (clashes.length) {
    throw new ThinContentError(`Near-duplicate pages:\n  ${clashes.join("\n  ")}`);
  }
  return true;
}
