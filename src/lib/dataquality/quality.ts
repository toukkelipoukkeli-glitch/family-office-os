import { Decimal } from "decimal.js";

import {
  type AssetClass,
  assetClassLabel,
  type ConfidenceLevel,
  type Holding,
  isLiquidAssetClass,
  type Valuation,
} from "../model";
import { Money } from "../money";

/**
 * Valuation staleness & data-quality monitor.
 *
 * A cross-cutting *trust layer* that scores how much the family should believe
 * the numbers the rest of the app reports. For every holding it computes:
 *
 *  - **valuation staleness** — how many whole days have elapsed between the most
 *    recent valuation's `asOf` and a fixed "today", judged against a per-asset
 *    -class freshness budget (a live equity quote should be hours old; a
 *    classic-car appraisal can be a year old and still be "fresh");
 *  - **valuation confidence** — the `confidenceScore` when a source provides one,
 *    otherwise a number derived from the coarse confidence band;
 *  - **missing-data flags** — concrete gaps (no valuation at all, no tax lots,
 *    an un-scored confidence, a missing symbol on a liquid instrument, a value
 *    stale past its budget, or an outright low-confidence number).
 *
 * These fold into a 0..1 per-holding quality score and a value-weighted
 * portfolio roll-up with a letter grade, so a single headline answers "how much
 * should I trust this dashboard right now?".
 *
 * Pure, deterministic and React-free. The caller passes an explicit `today` so
 * tests are reproducible offline (AGENTS.md). Money stays in {@link Decimal}
 * via {@link Money}; only the final render boundary turns it into a number.
 * READ-ONLY: this only *grades* existing valuations, it never changes them.
 */

/** Milliseconds in one whole day. */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Freshness budget, in days, per asset class. A valuation is "fresh" up to its
 * budget, "aging" up to twice the budget, and "stale" beyond that. Liquid
 * public-market instruments are expected to be marked daily; illiquid /
 * collectible holdings are valued by appraisal and tolerate a far longer gap.
 */
export const STALENESS_BUDGET_DAYS: Record<AssetClass, number> = {
  // Liquid — should be marked within a couple of trading days.
  equity: 3,
  etf: 3,
  bond: 5,
  crypto: 2,
  cash: 7,
  // Illiquid / collectible — appraisal-valued, long budgets.
  forest: 540,
  wine: 365,
  art: 365,
  lego: 365,
  car: 365,
  vineyard: 365,
  pe: 120,
  watch: 365,
};

/** Coarse staleness verdict relative to the asset class's freshness budget. */
export type StalenessStatus = "fresh" | "aging" | "stale";

/** A concrete data-quality issue found on a holding. */
export type QualityFlag =
  | "no_valuation"
  | "stale_valuation"
  | "low_confidence"
  | "unscored_confidence"
  | "no_lots"
  | "missing_symbol";

/** Human-readable label for each {@link QualityFlag}. */
export const QUALITY_FLAG_LABELS: Record<QualityFlag, string> = {
  no_valuation: "No valuation on record",
  stale_valuation: "Valuation past its freshness budget",
  low_confidence: "Low-confidence valuation",
  unscored_confidence: "No precise confidence score",
  no_lots: "No tax lots recorded",
  missing_symbol: "Liquid instrument without a market symbol",
};

/** Map a coarse confidence band to a representative 0..1 score. */
export function confidenceBandScore(band: ConfidenceLevel): number {
  switch (band) {
    case "high":
      return 0.9;
    case "medium":
      return 0.6;
    case "low":
      return 0.3;
  }
}

/**
 * Pick the most recent valuation by `asOf` (latest wins; ties broken by id for
 * determinism). Returns `undefined` when the holding has no valuations.
 */
export function latestValuation(holding: Holding): Valuation | undefined {
  let best: Valuation | undefined;
  let bestMs = Number.NEGATIVE_INFINITY;
  for (const v of holding.valuations) {
    const ms = Date.parse(v.asOf);
    if (Number.isNaN(ms)) continue;
    if (
      ms > bestMs ||
      (ms === bestMs && best !== undefined && v.id < best.id)
    ) {
      best = v;
      bestMs = ms;
    }
  }
  return best;
}

/** Whole days between a valuation's `asOf` and `today` (never negative). */
export function stalenessDays(asOf: string, today: Date): number {
  const asOfMs = Date.parse(asOf);
  if (Number.isNaN(asOfMs)) {
    throw new Error(`invalid valuation asOf: ${asOf}`);
  }
  const diff = today.getTime() - asOfMs;
  // A future-dated valuation is treated as zero days stale, not negative.
  if (diff <= 0) return 0;
  return Math.floor(diff / MS_PER_DAY);
}

/** Classify staleness given the days elapsed and the asset class's budget. */
export function stalenessStatus(
  days: number,
  budgetDays: number,
): StalenessStatus {
  if (days <= budgetDays) return "fresh";
  if (days <= budgetDays * 2) return "aging";
  return "stale";
}

/**
 * The freshness component of the score (0..1): 1.0 within budget, decaying
 * linearly to 0 as staleness reaches three budgets, then pinned at 0.
 */
function freshnessScore(days: number, budgetDays: number): number {
  if (days <= budgetDays) return 1;
  const over = days - budgetDays;
  const window = budgetDays * 2; // fully decayed at 3× budget
  const score = 1 - over / window;
  return score < 0 ? 0 : score;
}

/** A full data-quality assessment for a single holding. */
export interface HoldingQuality {
  holdingId: string;
  name: string;
  assetClass: AssetClass;
  assetClassLabel: string;
  /** Reported value of the latest valuation (zero when none exists). */
  value: Money;
  /** The valuation that was assessed, if any. */
  asOf?: string;
  source?: Valuation["source"];
  /** Whole days since `asOf` vs `today`; `undefined` when no valuation. */
  stalenessDays?: number;
  budgetDays: number;
  stalenessStatus: StalenessStatus;
  /** Confidence band of the latest valuation. */
  confidence?: ConfidenceLevel;
  /** 0..1 confidence (precise score when present, else band-derived). */
  confidenceScore: number;
  /** 0..1 freshness component. */
  freshnessScore: number;
  /** 0..1 completeness component (penalised per missing-data flag). */
  completenessScore: number;
  /** 0..1 overall quality score for this holding. */
  score: number;
  flags: QualityFlag[];
}

/** Letter grade for a 0..1 quality score. */
export type QualityGrade = "A" | "B" | "C" | "D" | "F";

/** Map a 0..1 score to a letter grade. */
export function qualityGrade(score: number): QualityGrade {
  if (score >= 0.9) return "A";
  if (score >= 0.8) return "B";
  if (score >= 0.65) return "C";
  if (score >= 0.5) return "D";
  return "F";
}

/** Assessed value totalled within a single currency. */
export interface CurrencyTotal {
  currency: string;
  value: Money;
}

/** The portfolio-wide data-quality roll-up. */
export interface DataQualityReport {
  /** Fixed "today" the assessment was computed against. */
  today: string;
  /** Per-holding assessments, sorted worst (lowest score) first. */
  holdings: HoldingQuality[];
  /**
   * Assessed value, broken down by currency (the book is multi-currency, and
   * trust scoring deliberately does not convert FX). Sorted by magnitude desc.
   */
  totalsByCurrency: CurrencyTotal[];
  /** Value-magnitude-weighted overall score (0..1) and its letter grade. */
  score: number;
  grade: QualityGrade;
  /** Count of holdings whose latest valuation is stale (status === "stale"). */
  staleCount: number;
  /** Count of holdings with no valuation at all. */
  missingValuationCount: number;
  /** Total number of flags raised across all holdings. */
  flagCount: number;
  /** Count of holdings by staleness status. */
  byStatus: Record<StalenessStatus, number>;
  /** Total flags raised of each kind across the portfolio. */
  flagTotals: Record<QualityFlag, number>;
}

/**
 * Weights of the three score components. Freshness and confidence dominate;
 * completeness is a smaller structural penalty. They sum to 1.
 */
const W_FRESHNESS = 0.4;
const W_CONFIDENCE = 0.4;
const W_COMPLETENESS = 0.2;

/** Assess a single holding against a fixed `today`. */
export function assessHolding(holding: Holding, today: Date): HoldingQuality {
  const budgetDays = STALENESS_BUDGET_DAYS[holding.assetClass];
  const latest = latestValuation(holding);
  const flags: QualityFlag[] = [];

  // Structural completeness checks independent of valuation freshness. Cash is
  // exempt: it legitimately has no tax lots and no market symbol (it is valued
  // straight off a statement), so flagging those would be noise, not a gap.
  const isCash = holding.assetClass === "cash";
  if (!isCash && holding.lots.length === 0) flags.push("no_lots");
  if (
    isLiquidAssetClass(holding.assetClass) &&
    !isCash &&
    !holding.symbol
  ) {
    flags.push("missing_symbol");
  }

  if (!latest) {
    flags.push("no_valuation");
    // No number to trust: freshness and confidence both bottom out.
    const completenessScore = completenessFromFlags(flags);
    const score = round2(W_COMPLETENESS * completenessScore);
    return {
      holdingId: holding.id,
      name: holding.name,
      assetClass: holding.assetClass,
      assetClassLabel: assetClassLabel(holding.assetClass),
      value: Money.of(0, holding.currency),
      budgetDays,
      stalenessStatus: "stale",
      confidenceScore: 0,
      freshnessScore: 0,
      completenessScore,
      score,
      flags,
    };
  }

  const days = stalenessDays(latest.asOf, today);
  const status = stalenessStatus(days, budgetDays);
  const fresh = freshnessScore(days, budgetDays);

  const confidenceScore =
    latest.confidenceScore ?? confidenceBandScore(latest.confidence);

  if (status === "stale") flags.push("stale_valuation");
  if (latest.confidence === "low") flags.push("low_confidence");
  if (latest.confidenceScore === undefined) flags.push("unscored_confidence");

  const completenessScore = completenessFromFlags(flags);
  const score = round2(
    W_FRESHNESS * fresh +
      W_CONFIDENCE * confidenceScore +
      W_COMPLETENESS * completenessScore,
  );

  return {
    holdingId: holding.id,
    name: holding.name,
    assetClass: holding.assetClass,
    assetClassLabel: assetClassLabel(holding.assetClass),
    value: Money.of(latest.value.amount, latest.value.currency),
    asOf: latest.asOf,
    source: latest.source,
    stalenessDays: days,
    budgetDays,
    stalenessStatus: status,
    confidence: latest.confidence,
    confidenceScore: round2(confidenceScore),
    freshnessScore: round2(fresh),
    completenessScore: round2(completenessScore),
    score,
    flags,
  };
}

/**
 * Completeness component: starts at 1.0 and loses 0.25 per missing-data flag,
 * floored at 0. (A `stale_valuation` / `low_confidence` flag is already priced
 * into the freshness / confidence components, so only structural-gap flags are
 * counted here.)
 */
function completenessFromFlags(flags: QualityFlag[]): number {
  const structural: QualityFlag[] = [
    "no_valuation",
    "unscored_confidence",
    "no_lots",
    "missing_symbol",
  ];
  let penalty = 0;
  for (const f of flags) {
    if (structural.includes(f)) penalty += 0.25;
  }
  const score = 1 - penalty;
  return score < 0 ? 0 : score;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Roll holdings up into a portfolio-wide data-quality report against a fixed
 * `today`.
 *
 * The headline score is **weighted by value magnitude**: a stale number on a
 * $5M position hurts the grade more than a stale number on a $5k collectible.
 * Because the book is multi-currency and this is a *trust* layer (not a
 * valuation engine), no FX conversion is applied — the raw decimal magnitude of
 * each holding's value is used as a relative-importance weight, and value
 * totals are reported per currency. When nothing is valued, the headline falls
 * back to the simple average of holding scores so the grade still reflects the
 * data gaps.
 *
 * @param holdings the holdings to assess.
 * @param today the fixed reference date (pass an explicit value in tests).
 */
export function assessPortfolio(
  holdings: readonly Holding[],
  today: Date,
): DataQualityReport {
  const assessments = holdings.map((h) => assessHolding(h, today));

  // Per-currency value totals (no FX conversion — trust layer, not valuation).
  const totals = new Map<string, Decimal>();
  let weighted = new Decimal(0);
  let weightSum = new Decimal(0);
  let scoreSum = 0;
  for (const a of assessments) {
    if (a.asOf !== undefined) {
      const prev = totals.get(a.value.currency) ?? new Decimal(0);
      totals.set(a.value.currency, prev.plus(a.value.amount));
    }
    const w = a.asOf === undefined ? new Decimal(0) : a.value.amount;
    weighted = weighted.plus(w.times(a.score));
    weightSum = weightSum.plus(w);
    scoreSum += a.score;
  }

  const score = weightSum.isZero()
    ? round2(assessments.length === 0 ? 1 : scoreSum / assessments.length)
    : round2(weighted.div(weightSum).toNumber());

  const totalsByCurrency: CurrencyTotal[] = [...totals.entries()]
    .map(([currency, amount]) => ({ currency, value: Money.of(amount, currency) }))
    .sort((x, y) => {
      const cmp = y.value.amount.comparedTo(x.value.amount);
      if (cmp !== 0) return cmp;
      return x.currency.localeCompare(y.currency);
    });

  const byStatus: Record<StalenessStatus, number> = {
    fresh: 0,
    aging: 0,
    stale: 0,
  };
  const flagTotals: Record<QualityFlag, number> = {
    no_valuation: 0,
    stale_valuation: 0,
    low_confidence: 0,
    unscored_confidence: 0,
    no_lots: 0,
    missing_symbol: 0,
  };
  let flagCount = 0;
  let missingValuationCount = 0;
  for (const a of assessments) {
    byStatus[a.stalenessStatus] += 1;
    for (const f of a.flags) {
      flagTotals[f] += 1;
      flagCount += 1;
    }
    if (a.flags.includes("no_valuation")) missingValuationCount += 1;
  }

  // Worst-first ordering: lowest score, then stalest, then by id for stability.
  const sorted = [...assessments].sort((x, y) => {
    if (x.score !== y.score) return x.score - y.score;
    const xs = x.stalenessDays ?? Number.POSITIVE_INFINITY;
    const ys = y.stalenessDays ?? Number.POSITIVE_INFINITY;
    if (xs !== ys) return ys - xs;
    return x.holdingId.localeCompare(y.holdingId);
  });

  return {
    today: today.toISOString(),
    holdings: sorted,
    totalsByCurrency,
    score,
    grade: qualityGrade(score),
    staleCount: byStatus.stale,
    missingValuationCount,
    flagCount,
    byStatus,
    flagTotals,
  };
}
