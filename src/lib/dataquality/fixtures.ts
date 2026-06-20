import type { Holding } from "../model";
import { seededHoldings } from "@/fixtures";

/**
 * The fixed "today" the data-quality monitor judges staleness against. Pinned
 * so every staleness day-count and score is deterministic and offline
 * (AGENTS.md). Chosen a few days after the seeded portfolio's freshest market
 * marks (2026-06-18) so the liquid holdings read as "fresh" while the older
 * appraisals fan out across the aging/stale bands.
 */
export const DATA_QUALITY_TODAY = new Date("2026-06-20T17:00:00Z");

/**
 * A deliberately degraded holding with **no valuation on record** — exercises
 * the `no_valuation` / `no_lots` flags and the missing-valuation roll-up so the
 * monitor demonstrably surfaces a hole in the book, not just stale-but-present
 * numbers. READ-ONLY fixture: it only describes a gap, it moves nothing.
 */
export const unvaluedAngelHolding: Holding = {
  id: "hold-equity-angel",
  name: "SeedCo Angel SAFE (unpriced)",
  assetClass: "equity",
  currency: "USD",
  lots: [],
  valuations: [],
  tags: ["private", "angel", "unpriced"],
};

/**
 * A holding whose only valuation is **stale past its freshness budget** — a
 * sculpture last appraised in 2023, well over two art budgets (365d) before the
 * fixed `today`. Exercises the `stale_valuation` flag and the "stale" staleness
 * band on a *valued* holding (distinct from the unvalued angel above).
 */
export const staleSculptureHolding: Holding = {
  id: "hold-art-bronze",
  name: "Bronze Sculpture, Édition 3/8",
  assetClass: "art",
  currency: "EUR",
  lots: [
    {
      id: "lot-bronze-1",
      quantity: "1",
      unitCost: { amount: "95000.00", currency: "EUR" },
      acquiredOn: "2014-05-12",
    },
  ],
  valuations: [
    {
      id: "val-bronze-1",
      value: { amount: "150000.00", currency: "EUR" },
      asOf: "2023-01-15T00:00:00Z",
      source: "appraisal",
      confidence: "medium",
      confidenceScore: 0.55,
      note: "Last formal appraisal; overdue for a refresh",
    },
  ],
  tags: ["collectible", "art"],
};

/**
 * The seeded book plus the degraded holdings, used as the default input to the
 * data-quality monitor so the UI shows the full range of trust signals:
 * fresh-and-confident liquid marks, aging appraisals, an overdue (stale)
 * appraisal, and an outright unvalued position.
 */
export const DATA_QUALITY_HOLDINGS: readonly Holding[] = [
  ...seededHoldings,
  staleSculptureHolding,
  unvaluedAngelHolding,
];
