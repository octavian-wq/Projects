// The page types, ordered by commercial intent.
//
// This ordering is the whole strategy. Informational pages ("what to eat before
// running") are cheap to generate and easy to rank, but they're also where AI
// answer panels have taken the click — the answer appears on the results page
// and nobody visits. Commercial-intent pages survive, because someone choosing
// between two products still wants to see the product.
//
// Build the bottom of the funnel first. A hundred comparison pages beat two
// thousand informational ones.

export const PAGE_TYPES = {
  // Highest intent: they know the competitor and are actively looking to leave.
  alternative: {
    handle: (d) => `best-${slug(d.competitor)}-alternatives`,
    title: (d) => `The best ${d.competitor} alternatives in ${d.region}`,
    intent: "highest",
    needs: ["competitor", "region"],
  },

  // They're comparing you directly against one named rival.
  comparison: {
    handle: (d) => `${slug(d.brand)}-vs-${slug(d.competitor)}`,
    title: (d) => `${d.brand} vs ${d.competitor}: an honest comparison`,
    intent: "high",
    needs: ["brand", "competitor"],
  },

  // Two rivals, neither of them you. You intercept the comparison itself.
  // Counter-intuitive and usually the least contested page in the set —
  // neither competitor will ever write it, so there is nothing to outrank.
  headToHead: {
    handle: (d) => `${slug(d.competitorA)}-vs-${slug(d.competitorB)}`,
    title: (d) => `${d.competitorA} vs ${d.competitorB}: which should you pick?`,
    intent: "high",
    needs: ["competitorA", "competitorB"],
  },

  // Local intent. Only worth building where you genuinely serve the area.
  location: {
    handle: (d) => `${slug(d.category)}-${slug(d.city)}`,
    title: (d) => `${d.category} in ${d.city}`,
    intent: "medium",
    needs: ["category", "city"],
  },

  // Migration guides. Small volume, but the visitor is mid-switch.
  migration: {
    handle: (d) => `how-to-switch-from-${slug(d.competitor)}`,
    title: (d) => `How to switch from ${d.competitor} to ${d.brand}`,
    intent: "high",
    needs: ["competitor", "brand"],
  },
};

export const slug = (s) =>
  String(s).toLowerCase().trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
