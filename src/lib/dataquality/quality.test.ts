import { describe, expect, it } from "vitest";

import type { Holding } from "../model";

import {
  assessHolding,
  assessPortfolio,
  confidenceBandScore,
  latestValuation,
  qualityGrade,
  STALENESS_BUDGET_DAYS,
  stalenessDays,
  stalenessStatus,
} from "./quality";
import {
  DATA_QUALITY_HOLDINGS,
  DATA_QUALITY_TODAY,
  staleSculptureHolding,
  unvaluedAngelHolding,
} from "./fixtures";

const TODAY = DATA_QUALITY_TODAY;

/** Build a minimal holding for targeted unit tests. */
function holding(partial: Partial<Holding> & Pick<Holding, "id">): Holding {
  return {
    name: "Test Holding",
    assetClass: "equity",
    symbol: "TST",
    currency: "USD",
    lots: [
      {
        id: `${partial.id}-lot`,
        quantity: "1",
        unitCost: { amount: "100.00", currency: "USD" },
        acquiredOn: "2020-01-01",
      },
    ],
    valuations: [],
    tags: [],
    ...partial,
  } as Holding;
}

describe("stalenessDays", () => {
  it("counts whole days between asOf and today", () => {
    expect(stalenessDays("2026-06-18T17:00:00Z", TODAY)).toBe(2);
    expect(stalenessDays("2026-06-20T17:00:00Z", TODAY)).toBe(0);
  });

  it("floors partial days down", () => {
    // 2 days and 23h before today is still 2 whole days.
    expect(stalenessDays("2026-06-17T18:00:00Z", TODAY)).toBe(2);
  });

  it("treats a future-dated valuation as zero, never negative", () => {
    expect(stalenessDays("2026-12-31T00:00:00Z", TODAY)).toBe(0);
  });

  it("throws on an unparseable date", () => {
    expect(() => stalenessDays("not-a-date", TODAY)).toThrow(/invalid/);
  });
});

describe("stalenessStatus", () => {
  it("is fresh within budget, aging up to 2x, stale beyond", () => {
    expect(stalenessStatus(3, 3)).toBe("fresh");
    expect(stalenessStatus(4, 3)).toBe("aging");
    expect(stalenessStatus(6, 3)).toBe("aging");
    expect(stalenessStatus(7, 3)).toBe("stale");
  });
});

describe("confidenceBandScore", () => {
  it("maps coarse bands to representative scores", () => {
    expect(confidenceBandScore("high")).toBe(0.9);
    expect(confidenceBandScore("medium")).toBe(0.6);
    expect(confidenceBandScore("low")).toBe(0.3);
  });
});

describe("qualityGrade", () => {
  it("maps scores to letter grades at the documented thresholds", () => {
    expect(qualityGrade(0.95)).toBe("A");
    expect(qualityGrade(0.9)).toBe("A");
    expect(qualityGrade(0.85)).toBe("B");
    expect(qualityGrade(0.8)).toBe("B");
    expect(qualityGrade(0.7)).toBe("C");
    expect(qualityGrade(0.65)).toBe("C");
    expect(qualityGrade(0.55)).toBe("D");
    expect(qualityGrade(0.5)).toBe("D");
    expect(qualityGrade(0.49)).toBe("F");
    expect(qualityGrade(0)).toBe("F");
  });
});

describe("latestValuation", () => {
  it("picks the most recent by asOf", () => {
    const h = holding({
      id: "h-multi",
      valuations: [
        {
          id: "v-old",
          value: { amount: "100.00", currency: "USD" },
          asOf: "2024-01-01T00:00:00Z",
          source: "appraisal",
          confidence: "low",
        },
        {
          id: "v-new",
          value: { amount: "200.00", currency: "USD" },
          asOf: "2026-01-01T00:00:00Z",
          source: "market",
          confidence: "high",
        },
      ],
    });
    expect(latestValuation(h)?.id).toBe("v-new");
  });

  it("returns undefined when there are no valuations", () => {
    expect(latestValuation(holding({ id: "h-none" }))).toBeUndefined();
  });

  it("breaks asOf ties deterministically by id", () => {
    const h = holding({
      id: "h-tie",
      valuations: [
        {
          id: "v-b",
          value: { amount: "1.00", currency: "USD" },
          asOf: "2026-01-01T00:00:00Z",
          source: "market",
          confidence: "high",
        },
        {
          id: "v-a",
          value: { amount: "2.00", currency: "USD" },
          asOf: "2026-01-01T00:00:00Z",
          source: "market",
          confidence: "high",
        },
      ],
    });
    expect(latestValuation(h)?.id).toBe("v-a");
  });

  it("skips valuations whose asOf is unparseable", () => {
    const h = holding({
      id: "h-nan",
      valuations: [
        {
          id: "v-bad",
          value: { amount: "999.00", currency: "USD" },
          asOf: "not-a-date",
          source: "appraisal",
          confidence: "low",
        },
        {
          id: "v-good",
          value: { amount: "10.00", currency: "USD" },
          asOf: "2025-01-01T00:00:00Z",
          source: "market",
          confidence: "high",
        },
      ],
    });
    // The garbage-dated valuation is ignored, not picked as "latest".
    expect(latestValuation(h)?.id).toBe("v-good");
  });

  it("returns undefined when every valuation has an unparseable asOf", () => {
    const h = holding({
      id: "h-all-nan",
      valuations: [
        {
          id: "v-bad",
          value: { amount: "1.00", currency: "USD" },
          asOf: "garbage",
          source: "appraisal",
          confidence: "low",
        },
      ],
    });
    expect(latestValuation(h)).toBeUndefined();
  });
});

describe("assessHolding", () => {
  it("scores a fresh, scored, high-confidence market quote near the top", () => {
    const h = holding({
      id: "h-fresh",
      valuations: [
        {
          id: "v",
          value: { amount: "1000.00", currency: "USD" },
          asOf: "2026-06-19T16:00:00Z",
          source: "market",
          confidence: "high",
          confidenceScore: 0.98,
        },
      ],
    });
    const a = assessHolding(h, TODAY);
    expect(a.stalenessDays).toBe(1);
    expect(a.stalenessStatus).toBe("fresh");
    expect(a.freshnessScore).toBe(1);
    expect(a.confidenceScore).toBe(0.98);
    expect(a.completenessScore).toBe(1);
    // 0.4*1 + 0.4*0.98 + 0.2*1 = 0.992 -> 0.99
    expect(a.score).toBe(0.99);
    expect(a.flags).toEqual([]);
  });

  it("flags a holding with no valuation and zeroes its trust", () => {
    const a = assessHolding(unvaluedAngelHolding, TODAY);
    expect(a.flags).toContain("no_valuation");
    expect(a.flags).toContain("no_lots");
    expect(a.stalenessStatus).toBe("stale");
    expect(a.stalenessDays).toBeUndefined();
    expect(a.freshnessScore).toBe(0);
    expect(a.confidenceScore).toBe(0);
    expect(a.value.amount.isZero()).toBe(true);
    // Only the completeness component survives (0.2 * 0.25 = 0.05).
    expect(a.score).toBe(0.05);
  });

  it("flags a valuation past its freshness budget as stale", () => {
    const a = assessHolding(staleSculptureHolding, TODAY);
    expect(a.assetClass).toBe("art");
    expect(a.budgetDays).toBe(STALENESS_BUDGET_DAYS.art);
    expect(a.stalenessDays).toBe(1252);
    expect(a.stalenessStatus).toBe("stale");
    expect(a.freshnessScore).toBe(0);
    expect(a.flags).toContain("stale_valuation");
    // 0.4*0 + 0.4*0.55 + 0.2*1 = 0.42
    expect(a.score).toBe(0.42);
  });

  it("derives confidence from the band when no precise score is given", () => {
    const h = holding({
      id: "h-unscored",
      valuations: [
        {
          id: "v",
          value: { amount: "10.00", currency: "USD" },
          asOf: "2026-06-19T00:00:00Z",
          source: "manual",
          confidence: "medium",
        },
      ],
    });
    const a = assessHolding(h, TODAY);
    expect(a.confidenceScore).toBe(0.6);
    expect(a.flags).toContain("unscored_confidence");
    expect(a.completenessScore).toBe(0.75); // one structural flag
  });

  it("does not flag cash for missing lots or symbol", () => {
    const cash = holding({
      id: "h-cash",
      assetClass: "cash",
      symbol: undefined,
      lots: [],
      valuations: [
        {
          id: "v",
          value: { amount: "5000.00", currency: "USD" },
          asOf: "2026-06-19T00:00:00Z",
          source: "manual",
          confidence: "high",
        },
      ],
    });
    const a = assessHolding(cash, TODAY);
    expect(a.flags).not.toContain("no_lots");
    expect(a.flags).not.toContain("missing_symbol");
    // Only the unscored-confidence structural flag remains.
    expect(a.flags).toEqual(["unscored_confidence"]);
  });

  it("flags a liquid instrument missing its market symbol", () => {
    const h = holding({
      id: "h-nosym",
      assetClass: "equity",
      symbol: undefined,
      valuations: [
        {
          id: "v",
          value: { amount: "100.00", currency: "USD" },
          asOf: "2026-06-19T00:00:00Z",
          source: "market",
          confidence: "high",
          confidenceScore: 0.9,
        },
      ],
    });
    expect(assessHolding(h, TODAY).flags).toContain("missing_symbol");
  });
});

describe("assessPortfolio against the fixed fixture today", () => {
  const report = assessPortfolio(DATA_QUALITY_HOLDINGS, TODAY);

  it("produces a deterministic value-weighted headline score and grade", () => {
    expect(report.score).toBe(0.82);
    expect(report.grade).toBe("B");
    expect(report.today).toBe("2026-06-20T17:00:00.000Z");
  });

  it("totals value per currency without converting FX", () => {
    const eur = report.totalsByCurrency.find((t) => t.currency === "EUR");
    const usd = report.totalsByCurrency.find((t) => t.currency === "USD");
    expect(eur?.value.amount.toFixed(0)).toBe("4308600");
    expect(usd?.value.amount.toFixed(0)).toBe("2194975");
    // Sorted by magnitude descending: EUR is the largest book.
    expect(report.totalsByCurrency[0]?.currency).toBe("EUR");
  });

  it("counts staleness, missing valuations and total flags", () => {
    expect(report.staleCount).toBe(2);
    expect(report.missingValuationCount).toBe(1);
    expect(report.byStatus).toEqual({ fresh: 14, aging: 0, stale: 2 });
    expect(report.flagCount).toBe(9);
    expect(report.flagTotals.stale_valuation).toBe(1);
    expect(report.flagTotals.no_valuation).toBe(1);
    expect(report.flagTotals.low_confidence).toBe(3);
  });

  it("sorts holdings worst-first so the riskiest numbers surface", () => {
    expect(report.holdings[0].holdingId).toBe("hold-equity-angel");
    expect(report.holdings[1].holdingId).toBe("hold-art-bronze");
    // Highest-trust holdings at the bottom.
    const last = report.holdings[report.holdings.length - 1];
    expect(last.score).toBeGreaterThanOrEqual(0.96);
  });

  it("assesses one row per input holding", () => {
    expect(report.holdings.length).toBe(DATA_QUALITY_HOLDINGS.length);
  });
});

describe("assessPortfolio edge cases", () => {
  it("falls back to the average score when nothing is valued", () => {
    const r = assessPortfolio([unvaluedAngelHolding], TODAY);
    expect(r.totalsByCurrency).toEqual([]);
    // Single unvalued holding -> headline equals its 0.05 score.
    expect(r.score).toBe(0.05);
    expect(r.grade).toBe("F");
  });

  it("returns a perfect score for an empty portfolio", () => {
    const r = assessPortfolio([], TODAY);
    expect(r.score).toBe(1);
    expect(r.grade).toBe("A");
    expect(r.holdings).toEqual([]);
  });

  it("uses the average fallback when every valued holding is worth zero", () => {
    // A valued-but-zero holding has weight 0, so the value-weighted roll-up
    // would divide by zero; the report must fall back to the simple average
    // rather than producing NaN.
    const zeroValued = holding({
      id: "h-zero",
      assetClass: "equity",
      valuations: [
        {
          id: "v-zero",
          value: { amount: "0.00", currency: "USD" },
          asOf: TODAY.toISOString(),
          source: "market",
          confidence: "high",
          confidenceScore: 0.95,
        },
      ],
    });
    const r = assessPortfolio([zeroValued], TODAY);
    expect(Number.isNaN(r.score)).toBe(false);
    // Fresh, scored, high-confidence, complete -> headline equals its score.
    expect(r.score).toBe(r.holdings[0].score);
    expect(r.totalsByCurrency).toEqual([
      expect.objectContaining({ currency: "USD" }),
    ]);
  });

  it("counts a zero-value valued holding as not stale and not missing", () => {
    const zeroValued = holding({
      id: "h-zero-2",
      valuations: [
        {
          id: "v-zero-2",
          value: { amount: "0.00", currency: "USD" },
          asOf: TODAY.toISOString(),
          source: "market",
          confidence: "high",
          confidenceScore: 0.9,
        },
      ],
    });
    const r = assessPortfolio([zeroValued], TODAY);
    expect(r.missingValuationCount).toBe(0);
    expect(r.staleCount).toBe(0);
    expect(r.byStatus.fresh).toBe(1);
  });

  it("is deterministic — same inputs give identical output", () => {
    const a = assessPortfolio(DATA_QUALITY_HOLDINGS, TODAY);
    const b = assessPortfolio(DATA_QUALITY_HOLDINGS, TODAY);
    expect(JSON.stringify(serialise(a))).toBe(JSON.stringify(serialise(b)));
  });
});

// Money objects don't JSON-serialise to a stable shape; reduce to comparables.
function serialise(r: ReturnType<typeof assessPortfolio>) {
  return {
    score: r.score,
    grade: r.grade,
    flagCount: r.flagCount,
    byStatus: r.byStatus,
    holdings: r.holdings.map((h) => ({
      id: h.holdingId,
      score: h.score,
      flags: h.flags,
      value: h.value.toString(),
    })),
    totals: r.totalsByCurrency.map((t) => t.value.toString()),
  };
}
