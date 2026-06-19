import { Decimal } from "decimal.js";

import { Money } from "../money";
import type { ConfidenceLevel } from "../model/valuation";
import {
  ClassicCar,
  type ComparableSale,
  type ConditionGrade,
} from "./vehicle";

/**
 * Classic-car valuation model + confidence band.
 *
 * The model produces a point estimate and a low/high band from two
 * independent signals:
 *
 * 1. A **baseline** value adjusted for the subject's condition, mileage,
 *    provenance and rarity. This always exists.
 * 2. **Comparable sales**, normalized to the subject's condition, then
 *    summarized as a trimmed-mean point estimate and a dispersion-based band.
 *    This exists only when comps are supplied.
 *
 * When comps exist the two signals are blended (weighted by comp count) and
 * the confidence band reflects comp dispersion; otherwise the band is a fixed
 * fraction around the adjusted baseline, widened by how uncertain the
 * condition is. Confidence is higher with more, tightly-clustered comps.
 *
 * Everything is exact-decimal and deterministic — no randomness, no clock, no
 * network — so the same inputs always yield the same valuation (AGENTS.md:
 * tests must be deterministic and offline).
 *
 * READ-ONLY product: this reports an estimated value; it never moves money or
 * proposes a trade.
 */

/**
 * Multiplier applied to the baseline for each condition grade, relative to the
 * `good` (#3) baseline reference. A concours car is worth materially more than
 * a fair project of the same model. These are documented modeling assumptions,
 * not market truth.
 */
export const CONDITION_MULTIPLIER: Record<ConditionGrade, string> = {
  concours: "1.6",
  excellent: "1.25",
  good: "1.0",
  fair: "0.6",
};

/**
 * How much a comp's dispersion implies about confidence, and the fallback band
 * width when there is no comp evidence. Tunable modeling constants.
 */
const NO_COMP_BAND = new Decimal("0.18"); // ±18% around adjusted baseline
const CONDITION_UNCERTAINTY = new Decimal("0.04"); // extra ± per grade off concours
/** Value lost per mile over the baseline mileage, as a fraction of baseline. */
const MILEAGE_FRACTION_PER_MILE = new Decimal("0.0000008"); // ~0.8% per 10k miles
/** Mileage adjustment is clamped so it can never erase more than this share. */
const MAX_MILEAGE_PENALTY = new Decimal("0.4");

function conditionMultiplier(grade: ConditionGrade): Decimal {
  return new Decimal(CONDITION_MULTIPLIER[grade]);
}

/**
 * Mileage adjustment factor in (0, 1]: higher-than-baseline mileage reduces
 * value linearly, clamped at {@link MAX_MILEAGE_PENALTY}. Lower-than-baseline
 * mileage is treated as neutral (1.0) — we don't invent an upward premium for
 * low miles here; that belongs in `provenanceFactor`/`rarityFactor`.
 */
export function mileageFactor(
  mileage: number,
  baselineMileage: number,
): Decimal {
  const excess = mileage - baselineMileage;
  if (excess <= 0) return new Decimal(1);
  const penalty = Decimal.min(
    new Decimal(excess).times(MILEAGE_FRACTION_PER_MILE),
    MAX_MILEAGE_PENALTY,
  );
  return new Decimal(1).minus(penalty);
}

/**
 * The adjusted baseline value: the model's bottom-up estimate from the
 * vehicle's own attributes, before any comp evidence.
 */
export function adjustedBaseline(car: ClassicCar): Decimal {
  const base = new Decimal(car.baselineValue);
  return base
    .times(conditionMultiplier(car.conditionGrade))
    .times(mileageFactor(car.mileage, car.baselineMileage))
    .times(new Decimal(car.provenanceFactor))
    .times(new Decimal(car.rarityFactor));
}

/**
 * Normalize a comp's price to the subject's condition grade: divide out the
 * comp's condition multiplier and multiply in the subject's. A #2 comp is thus
 * adjusted down to value a #3 subject, and vice-versa.
 */
function normalizedCompPrice(
  comp: ComparableSale,
  subjectGrade: ConditionGrade,
): Decimal {
  return new Decimal(comp.price)
    .div(conditionMultiplier(comp.conditionGrade))
    .times(conditionMultiplier(subjectGrade));
}

/** Population standard deviation of a list of decimals (0 for <2 items). */
function stddev(values: Decimal[], mean: Decimal): Decimal {
  if (values.length < 2) return new Decimal(0);
  const variance = values
    .reduce((acc, v) => acc.plus(v.minus(mean).pow(2)), new Decimal(0))
    .div(values.length);
  return variance.sqrt();
}

/** Arithmetic mean of a non-empty list of decimals. */
function mean(values: Decimal[]): Decimal {
  return values
    .reduce((acc, v) => acc.plus(v), new Decimal(0))
    .div(values.length);
}

/**
 * A full classic-car valuation: a point estimate with an explicit low/high
 * confidence band, a coarse {@link ConfidenceLevel}, and the diagnostics that
 * produced them.
 */
export interface CarValuation {
  /** Point estimate. */
  value: Money;
  /** Lower bound of the confidence band (band fraction below the point). */
  low: Money;
  /** Upper bound of the confidence band. */
  high: Money;
  /**
   * Half-width of the band as a fraction of the point estimate, in [0, 1].
   * e.g. 0.1 means ±10%.
   */
  bandFraction: Decimal;
  /** Coarse confidence label derived from comp count and dispersion. */
  confidence: ConfidenceLevel;
  /** The bottom-up adjusted baseline (signal 1). */
  adjustedBaseline: Money;
  /**
   * The comp-based point estimate (signal 2), or `undefined` when no comps
   * were supplied.
   */
  compEstimate: Money | undefined;
  /** Number of comparable sales that informed the valuation. */
  compCount: number;
}

/** Currency the band/point is rounded to (whole units of the car's currency). */
function money(amount: Decimal, currency: string): Money {
  return Money.of(amount, currency).round(0);
}

function confidenceFor(
  compCount: number,
  bandFraction: Decimal,
): ConfidenceLevel {
  if (compCount >= 3 && bandFraction.lessThanOrEqualTo("0.12")) return "high";
  if (compCount >= 1 && bandFraction.lessThanOrEqualTo("0.2")) return "medium";
  return "low";
}

/**
 * Value a classic car. Accepts either a parsed {@link ClassicCar} or raw input
 * (which is validated via {@link ClassicCar} so defaults are applied and bad
 * input is rejected at the boundary).
 */
export function valueClassicCar(input: ClassicCar | unknown): CarValuation {
  const car = ClassicCar.parse(input);
  const baseline = adjustedBaseline(car);

  // Comp currencies must match the subject; cross-currency normalization is the
  // FX layer's job (m1-fx), not this model's.
  for (const comp of car.comps) {
    if (comp.currency !== car.currency) {
      throw new Error(
        `Comparable sale ${comp.id} currency ${comp.currency} does not match vehicle currency ${car.currency}`,
      );
    }
  }

  const normalized = car.comps.map((c) =>
    normalizedCompPrice(c, car.conditionGrade),
  );

  let point: Decimal;
  let bandFraction: Decimal;
  let compEstimate: Decimal | undefined;

  if (normalized.length === 0) {
    // No comps: lean entirely on the adjusted baseline, with a wide band that
    // grows as the subject's condition moves away from concours (more
    // restoration-dependent value => more uncertainty).
    point = baseline;
    const gradeIndex = ["concours", "excellent", "good", "fair"].indexOf(
      car.conditionGrade,
    );
    bandFraction = NO_COMP_BAND.plus(
      CONDITION_UNCERTAINTY.times(gradeIndex),
    );
    compEstimate = undefined;
  } else {
    const compMean = trimmedMean(normalized);
    compEstimate = compMean;
    // Blend comp evidence with the baseline. More comps => trust comps more.
    // weight = n / (n + 1), so 1 comp = 0.5, 3 comps = 0.75, etc.
    const n = new Decimal(normalized.length);
    const compWeight = n.div(n.plus(1));
    point = compMean
      .times(compWeight)
      .plus(baseline.times(new Decimal(1).minus(compWeight)));

    // Band from comp dispersion: coefficient of variation, floored so a single
    // comp (zero dispersion) doesn't claim false precision.
    const cv = compMean.isZero()
      ? new Decimal(0)
      : stddev(normalized, mean(normalized)).div(compMean);
    const floor =
      normalized.length >= 3 ? new Decimal("0.05") : new Decimal("0.1");
    bandFraction = Decimal.max(cv, floor);
  }

  // A band fraction >= 1 would imply a non-positive lower bound; clamp so the
  // low bound stays non-negative and the band stays meaningful.
  bandFraction = Decimal.min(bandFraction, new Decimal("0.95"));

  const low = point.times(new Decimal(1).minus(bandFraction));
  const high = point.times(new Decimal(1).plus(bandFraction));

  return {
    value: money(point, car.currency),
    low: money(low, car.currency),
    high: money(high, car.currency),
    bandFraction,
    confidence: confidenceFor(normalized.length, bandFraction),
    adjustedBaseline: money(baseline, car.currency),
    compEstimate:
      compEstimate === undefined ? undefined : money(compEstimate, car.currency),
    compCount: normalized.length,
  };
}

/**
 * Trimmed mean: drop the single lowest and single highest value when there are
 * >= 4 points, to blunt the effect of one wild auction result; otherwise a
 * plain mean. Deterministic ordering by value.
 */
export function trimmedMean(values: Decimal[]): Decimal {
  if (values.length === 0) {
    throw new Error("trimmedMean of an empty list");
  }
  if (values.length < 4) return mean(values);
  const sorted = [...values].sort((a, b) => a.comparedTo(b));
  const trimmed = sorted.slice(1, sorted.length - 1);
  return mean(trimmed);
}
