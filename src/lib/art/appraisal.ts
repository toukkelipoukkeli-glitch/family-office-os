import { Decimal } from "decimal.js";

import { Money } from "../money";
import type {
  Artwork,
  Comparable,
  ConditionGrade,
  ProvenanceStrength,
} from "./artwork";

/**
 * Art appraisal model — comparable-sales valuation with an *honest* confidence
 * band.
 *
 * The art market is illiquid, heterogeneous, and thin: any single point
 * estimate is a fiction without a sense of how wide the uncertainty is. This
 * model therefore returns a point estimate *and* a confidence band, and is
 * deliberately conservative — it widens the band (lowers confidence) when the
 * evidence is weak, rather than projecting false precision.
 *
 * Method (weighted log-price comparable sales):
 *
 *  1. Each comparable is weighted by similarity x recency. Recency uses an
 *     exponential decay with a configurable half-life, so a sale from years
 *     ago counts for less than a fresh one.
 *  2. The point estimate is the weighted geometric mean of comparable prices
 *     (i.e. the weighted mean in log space), which is the natural centre for
 *     multiplicative, right-skewed price data like art.
 *  3. A condition and a provenance adjustment multiply the estimate down for
 *     impaired works.
 *  4. The band half-width (in log space) is driven by:
 *       - the weighted dispersion of the comps (how much they disagree),
 *       - a small-sample penalty (few comps => wider band),
 *       - a recency penalty (stale evidence => wider band),
 *       - an impairment penalty (condition/provenance below pristine => wider),
 *     all scaled by a z-multiplier for the requested confidence level.
 *
 * READ-ONLY: this estimates and reports value. It never transacts.
 */

/** Multiplicative discount applied to value for each condition grade. */
const CONDITION_FACTOR: Record<ConditionGrade, number> = {
  mint: 1.0,
  excellent: 0.97,
  good: 0.9,
  fair: 0.75,
  poor: 0.5,
};

/** Multiplicative discount applied to value for each provenance strength. */
const PROVENANCE_FACTOR: Record<ProvenanceStrength, number> = {
  documented: 1.0,
  strong: 0.95,
  moderate: 0.85,
  weak: 0.6,
  disputed: 0.35,
};

/**
 * Extra band widening (added to the log-space standard deviation) for each
 * impairment grade. The worse the condition / provenance, the *less*
 * predictable the value, independent of the central discount above.
 */
const CONDITION_UNCERTAINTY: Record<ConditionGrade, number> = {
  mint: 0,
  excellent: 0.0,
  good: 0.05,
  fair: 0.12,
  poor: 0.25,
};

const PROVENANCE_UNCERTAINTY: Record<ProvenanceStrength, number> = {
  documented: 0,
  strong: 0.02,
  moderate: 0.08,
  weak: 0.2,
  disputed: 0.4,
};

/**
 * z-multipliers for two-sided normal confidence intervals, keyed by the
 * confidence level. Only a few standard levels are supported; others throw.
 */
const Z_FOR_CONFIDENCE: Record<number, number> = {
  0.5: 0.674,
  0.68: 0.994,
  0.8: 1.282,
  0.9: 1.645,
  0.95: 1.96,
  0.99: 2.576,
};

const MS_PER_DAY = 86_400_000;
const DAYS_PER_YEAR = 365.25;

/** Default exponential decay half-life for comp recency, in years. */
export const DEFAULT_RECENCY_HALF_LIFE_YEARS = 2;

/** Options controlling the appraisal computation. */
export interface AppraisalOptions {
  /**
   * Valuation "as of" date (ISO `YYYY-MM-DD`). Recency of each comparable is
   * measured back from this date. Defaults to the most recent comp date so the
   * model is deterministic and never depends on the wall clock.
   */
  asOf?: string;
  /** Confidence level for the band; one of the supported standard levels. */
  confidence?: number;
  /** Recency half-life in years (must be > 0). */
  recencyHalfLifeYears?: number;
}

/** A confidence band around a point estimate, all as {@link Money}. */
export interface ConfidenceBand {
  /** Lower bound of the band. */
  low: Money;
  /** Point estimate (weighted geometric mean, adjusted). */
  estimate: Money;
  /** Upper bound of the band. */
  high: Money;
  /** Confidence level the band was computed at (e.g. 0.8). */
  confidence: number;
}

/** Full appraisal result: the band plus the diagnostics behind it. */
export interface Appraisal extends ConfidenceBand {
  /** Number of comparables used. */
  compCount: number;
  /**
   * Relative half-width of the band as a fraction of the estimate
   * (`(high - low) / (2 * estimate)`), a unitless measure of uncertainty.
   * Larger => less certain. Useful for ranking how trustworthy an appraisal is.
   */
  relativeWidth: number;
  /**
   * Honesty flag: `true` when the appraisal rests on thin or stale evidence
   * (few comps, or a very wide band). Callers should surface this rather than
   * present the point estimate as gospel.
   */
  lowConfidence: boolean;
}

/** A comparable enriched with its computed weight, for transparency. */
export interface WeightedComparable {
  comparable: Comparable;
  /** Years between the comp sale and the valuation date (>= 0). */
  ageYears: number;
  /** Final weight = similarity x recency decay (>= 0). */
  weight: number;
}

function parseIsoDateUtc(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function zFor(confidence: number): number {
  const z = Z_FOR_CONFIDENCE[confidence];
  if (z === undefined) {
    throw new Error(
      `Unsupported confidence level ${confidence}; supported: ${Object.keys(
        Z_FOR_CONFIDENCE,
      ).join(", ")}`,
    );
  }
  return z;
}

/**
 * Compute the similarity x recency weight for each comparable relative to the
 * valuation date. Exposed for transparency / UI, and reused by
 * {@link appraise}.
 */
export function weighComparables(
  comparables: Comparable[],
  asOfMs: number,
  halfLifeYears: number,
): WeightedComparable[] {
  if (halfLifeYears <= 0 || !Number.isFinite(halfLifeYears)) {
    throw new Error("recencyHalfLifeYears must be a positive finite number");
  }
  const decay = Math.log(2) / halfLifeYears;
  return comparables.map((comparable) => {
    const soldMs = parseIsoDateUtc(comparable.soldOn);
    // Clamp negative ages (comp dated after the valuation date) to 0 so a
    // future-dated comp is treated as maximally recent, never up-weighted.
    const ageYears = Math.max(0, (asOfMs - soldMs) / MS_PER_DAY / DAYS_PER_YEAR);
    const recency = Math.exp(-decay * ageYears);
    const weight = comparable.similarity * recency;
    return { comparable, ageYears, weight };
  });
}

/**
 * Appraise an {@link Artwork} from a set of {@link Comparable} sales, returning
 * a point estimate and an honest confidence band.
 *
 * @throws if there are no comparables, if any comp currency differs from the
 *   artwork's currency, or if every comp ends up with zero weight.
 */
export function appraise(
  artwork: Artwork,
  comparables: Comparable[],
  options: AppraisalOptions = {},
): Appraisal {
  if (comparables.length === 0) {
    throw new Error("appraise requires at least one comparable sale");
  }
  for (const comp of comparables) {
    if (comp.currency !== artwork.currency) {
      throw new Error(
        `Comparable ${comp.id} currency ${comp.currency} does not match artwork currency ${artwork.currency}`,
      );
    }
  }

  const confidence = options.confidence ?? 0.8;
  const z = zFor(confidence);
  const halfLife = options.recencyHalfLifeYears ?? DEFAULT_RECENCY_HALF_LIFE_YEARS;

  // Default valuation date: the most recent comp, so results are deterministic
  // and independent of the wall clock (tests must be offline + reproducible).
  const asOfMs = options.asOf
    ? parseIsoDateUtc(options.asOf)
    : Math.max(...comparables.map((c) => parseIsoDateUtc(c.soldOn)));

  const weighted = weighComparables(comparables, asOfMs, halfLife);
  const totalWeight = weighted.reduce((acc, w) => acc + w.weight, 0);
  if (totalWeight <= 0) {
    throw new Error(
      "All comparables have zero weight (similarity 0); cannot appraise",
    );
  }

  // Work in log-price space: art prices are multiplicative and right-skewed,
  // so the weighted mean of log prices (a geometric mean) is the right centre,
  // and log-space dispersion is a scale-free measure of disagreement.
  let sumLog = 0;
  for (const w of weighted) {
    const price = Number(w.comparable.price);
    if (price <= 0) {
      throw new Error(
        `Comparable ${w.comparable.id} has non-positive price; cannot take log`,
      );
    }
    sumLog += w.weight * Math.log(price);
  }
  const meanLog = sumLog / totalWeight;

  // Weighted variance of log prices (population form, weighted).
  let sumSqDev = 0;
  for (const w of weighted) {
    const dev = Math.log(Number(w.comparable.price)) - meanLog;
    sumSqDev += w.weight * dev * dev;
  }
  const compStdLog = Math.sqrt(sumSqDev / totalWeight);

  // --- Uncertainty budget (all in log space) -----------------------------
  // 1. comp disagreement, as the standard error of the weighted mean. We use
  //    the effective sample size (Kish) so heavily-tilted weights count as
  //    fewer independent observations.
  const sumWeightSq = weighted.reduce((acc, w) => acc + w.weight * w.weight, 0);
  const effectiveN = (totalWeight * totalWeight) / sumWeightSq;
  const standardError = compStdLog / Math.sqrt(effectiveN);

  // 2. small-sample penalty: with few effective comps, even agreeing comps are
  //    weak evidence. Decays as 1/sqrt(n).
  const smallSamplePenalty = 0.15 / Math.sqrt(effectiveN);

  // 3. recency penalty: stale evidence is less reliable. Weighted-average age.
  const meanAge =
    weighted.reduce((acc, w) => acc + w.weight * w.ageYears, 0) / totalWeight;
  const recencyPenalty = 0.04 * meanAge;

  // 4. impairment penalty: condition / provenance below pristine widen the band.
  const impairmentPenalty =
    CONDITION_UNCERTAINTY[artwork.condition] +
    PROVENANCE_UNCERTAINTY[artwork.provenance];

  // Combine independent sources of uncertainty in quadrature (RSS), which is
  // the standard way to add independent standard deviations.
  const sigmaLog = Math.sqrt(
    standardError * standardError +
      smallSamplePenalty * smallSamplePenalty +
      recencyPenalty * recencyPenalty +
      impairmentPenalty * impairmentPenalty,
  );

  // --- Central estimate, adjusted for condition + provenance --------------
  const adjustment =
    CONDITION_FACTOR[artwork.condition] * PROVENANCE_FACTOR[artwork.provenance];
  const centreLog = meanLog + Math.log(adjustment);
  const halfWidthLog = z * sigmaLog;

  const estimateNum = Math.exp(centreLog);
  const lowNum = Math.exp(centreLog - halfWidthLog);
  const highNum = Math.exp(centreLog + halfWidthLog);

  const toMoney = (n: number) =>
    Money.of(new Decimal(n).toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN), artwork.currency);

  const estimate = toMoney(estimateNum);
  const low = toMoney(lowNum);
  const high = toMoney(highNum);

  const relativeWidth = (highNum - lowNum) / (2 * estimateNum);
  const lowConfidence = effectiveN < 3 || relativeWidth > 0.5;

  return {
    low,
    estimate,
    high,
    confidence,
    compCount: comparables.length,
    relativeWidth,
    lowConfidence,
  };
}
