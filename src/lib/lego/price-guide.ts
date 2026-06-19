import { Decimal } from "decimal.js";

import { Money } from "../money";
import {
  ConfidenceLevel,
  Valuation,
} from "../model/valuation";
import { Comparable } from "./comparable";
import {
  Completeness,
  completenessFactor,
  conditionMultiplier,
  SetCondition,
} from "./condition";
import { LegoSet } from "./set";
import {
  hampelKeep,
  median,
  medianAbsoluteDeviation,
  weightedMedian,
} from "./stats";

/**
 * Secondary-market price-guide model for LEGO sets.
 *
 * Given a set's reference data and a list of observed comparable sales, the
 * guide estimates the market value of a *target* example (a given condition +
 * completeness) as of a valuation date. The pipeline is deliberately robust and
 * fully deterministic:
 *
 *  1. Validate + currency-check every comp against the set.
 *  2. Normalize each comp to a factory-sealed, fully-complete equivalent by
 *     dividing out its condition multiplier and completeness factor.
 *  3. Drop normalized outliers with a Hampel (median ± k·MAD) filter.
 *  4. Aggregate the survivors with a *recency-weighted* median, where weight
 *     decays exponentially with the comp's age (half-life configurable).
 *  5. Re-apply the target grade's condition multiplier and completeness factor.
 *  6. Emit a {@link Valuation} (source `model`) whose confidence reflects the
 *     comp count, dispersion, and recency.
 *
 * READ-ONLY product: this reports an estimate; it never lists, buys, or sells.
 */

/** Tunable knobs for the price guide. All have documented, conservative defaults. */
export interface PriceGuideOptions {
  /**
   * Half-life, in days, of a comp's recency weight: a sale this many days old
   * counts half as much as a fresh one. Default 365 (one year).
   */
  recencyHalfLifeDays?: number;
  /** Hampel filter aggressiveness in MADs. Default 3 (typical). */
  hampelK?: number;
  /**
   * Maximum age, in days, before a comp is ignored entirely. Default 1825
   * (~5 years); older sales are too stale to inform the guide.
   */
  maxAgeDays?: number;
}

const DEFAULTS: Required<PriceGuideOptions> = {
  recencyHalfLifeDays: 365,
  hampelK: 3,
  maxAgeDays: 1825,
};

const MS_PER_DAY = 86_400_000;

function parseIsoDateUtc(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Whole days between two ISO dates (`asOf - soldOn`), never negative. */
function ageInDays(soldOn: string, asOf: string): number {
  const diff = parseIsoDateUtc(asOf) - parseIsoDateUtc(soldOn);
  return Math.max(0, Math.floor(diff / MS_PER_DAY));
}

/** The exponential recency weight for an age, given a half-life. */
function recencyWeight(ageDays: number, halfLifeDays: number): Decimal {
  // 0.5 ** (age / halfLife)
  const exponent = new Decimal(ageDays).div(halfLifeDays);
  return new Decimal("0.5").pow(exponent);
}

/** A comp normalized to a factory-sealed, fully-complete equivalent price. */
interface NormalizedComp {
  /** Sealed-equivalent price (exact). */
  sealedEquivalent: Decimal;
  /** Recency weight for this comp. */
  weight: Decimal;
  /** Age in days at the valuation date. */
  ageDays: number;
}

/**
 * The full result of running the price guide: the headline {@link Valuation}
 * plus the intermediate evidence (sealed-equivalent comps, the chosen sealed
 * value, dispersion) so callers can show *why* a number was produced.
 */
export interface PriceGuideResult {
  /** The headline valuation for the requested target. */
  valuation: Valuation;
  /** Estimated value of a factory-sealed, complete example. */
  sealedValue: Money;
  /** How many comps survived currency/age/outlier filtering. */
  compCountUsed: number;
  /** How many comps were supplied in total. */
  compCountSupplied: number;
  /**
   * Robust coefficient of dispersion of the sealed-equivalent comps
   * (MAD / median), in [0, ∞). Smaller is tighter agreement. Zero when fewer
   * than two comps survive.
   */
  dispersion: Decimal;
}

/** What we are valuing: a specific example's condition + completeness. */
export interface ValuationTarget {
  condition: SetCondition;
  /** Completeness fraction in [0, 1]; defaults to fully complete. */
  completeness?: Completeness;
}

function targetCompleteness(target: ValuationTarget): Decimal {
  // Sealed examples are complete by definition; ignore any supplied value.
  if (target.condition === "sealed") return new Decimal(1);
  return new Decimal(target.completeness ?? "1");
}

function normalizeComp(
  comp: Comparable,
  asOf: string,
  halfLifeDays: number,
): NormalizedComp {
  const price = new Decimal(comp.price);
  const condMult = conditionMultiplier(comp.condition);
  const compFactor = completenessFactor(new Decimal(comp.completeness));
  const adjustment = condMult.times(compFactor);
  // A zero adjustment (fully-missing incomplete example) carries no price
  // signal; guard against divide-by-zero by treating it as unusable.
  const sealedEquivalent = adjustment.isZero()
    ? new Decimal(0)
    : price.div(adjustment);
  const ageDays = ageInDays(comp.soldOn, asOf);
  return {
    sealedEquivalent,
    weight: recencyWeight(ageDays, halfLifeDays),
    ageDays,
  };
}

function confidenceFor(
  compCount: number,
  dispersion: Decimal,
  freshestAgeDays: number,
): { level: ConfidenceLevel; score: number } {
  // Three independent signals, each mapped to [0, 1], then averaged.
  // 1. Sample size: saturates at ~8 comps.
  const sizeScore = Math.min(1, compCount / 8);
  // 2. Agreement: dispersion 0 -> 1.0, dispersion >= 0.5 -> 0.
  const disp = dispersion.toNumber();
  const agreementScore = Math.max(0, 1 - disp / 0.5);
  // 3. Recency: freshest comp today -> 1.0, >= 2 years -> 0.
  const recencyScore = Math.max(0, 1 - freshestAgeDays / 730);

  const score = (sizeScore + agreementScore + recencyScore) / 3;
  const level: ConfidenceLevel =
    score >= 0.66 ? "high" : score >= 0.33 ? "medium" : "low";
  return { level, score: Math.round(score * 1000) / 1000 };
}

/**
 * Estimate the secondary-market value of a target example of `set` from a list
 * of comparable sales, as of `asOf` (an ISO date).
 *
 * @throws if a comp's currency does not match the set, if no usable comps
 *   remain after filtering, or on invalid inputs.
 */
export function estimateSetValue(
  set: LegoSet,
  comps: Comparable[],
  target: ValuationTarget,
  asOf: string,
  options: PriceGuideOptions = {},
): PriceGuideResult {
  const opts = { ...DEFAULTS, ...options };
  const parsedSet = LegoSet.parse(set);
  const currency = parsedSet.currency;

  const compCountSupplied = comps.length;

  // 1–2. Validate, currency-check, age-gate, and normalize to sealed-equivalent.
  const normalized: NormalizedComp[] = [];
  for (const raw of comps) {
    const comp = Comparable.parse(raw);
    if (comp.currency !== currency) {
      throw new Error(
        `Comparable ${comp.id} currency ${comp.currency} does not match set currency ${currency}`,
      );
    }
    const n = normalizeComp(comp, asOf, opts.recencyHalfLifeDays);
    if (n.ageDays > opts.maxAgeDays) continue; // too stale
    if (n.sealedEquivalent.lessThanOrEqualTo(0)) continue; // no signal
    normalized.push(n);
  }

  if (normalized.length === 0) {
    throw new Error(
      `No usable comparables for set ${parsedSet.setNumber} as of ${asOf}`,
    );
  }

  // 3. Hampel outlier filter on sealed-equivalent prices.
  const sealedEquivPrices = normalized.map((n) => n.sealedEquivalent);
  const { indices } = hampelKeep(sealedEquivPrices, new Decimal(opts.hampelK));
  const survivors = indices.map((i) => normalized[i]);

  // 4. Recency-weighted median of the survivors -> sealed value.
  const survivorPrices = survivors.map((s) => s.sealedEquivalent);
  const survivorWeights = survivors.map((s) => s.weight);
  const sealedEstimate = weightedMedian(survivorPrices, survivorWeights);

  // Dispersion of the survivors (robust coefficient of dispersion).
  let dispersion = new Decimal(0);
  if (survivorPrices.length >= 2) {
    const med = median(survivorPrices);
    if (med.greaterThan(0)) {
      dispersion = medianAbsoluteDeviation(survivorPrices).div(med);
    }
  }

  const sealedValue = Money.of(sealedEstimate, currency);

  // 5. Re-apply the target grade + completeness.
  const condMult = conditionMultiplier(target.condition);
  const compFactor = completenessFactor(targetCompleteness(target));
  const targetEstimate = sealedEstimate.times(condMult).times(compFactor);
  const value = Money.of(targetEstimate, currency).round();

  // 6. Confidence from count, dispersion, recency.
  const freshestAge = Math.min(...survivors.map((s) => s.ageDays));
  const { level, score } = confidenceFor(
    survivors.length,
    dispersion,
    freshestAge,
  );

  const valuation = Valuation.parse({
    id: `lego-${parsedSet.id}-${target.condition}-${asOf}`,
    value: value.toJSON(),
    asOf: `${asOf}T00:00:00Z`,
    source: "model",
    confidence: level,
    confidenceScore: score,
    note:
      `Price-guide estimate from ${survivors.length}/${compCountSupplied} comps ` +
      `(${target.condition}); sealed-equiv median ${sealedValue.toString()}.`,
  });

  return {
    valuation,
    sealedValue,
    compCountUsed: survivors.length,
    compCountSupplied,
    dispersion,
  };
}

/**
 * Premium of the current sealed estimate over original retail (MSRP), as an
 * exact decimal ratio. `0` means at retail, `1` means double retail, `-0.5`
 * means half retail. Returns `null` when retail is zero/unknown.
 */
export function appreciationOverRetail(
  set: LegoSet,
  sealedValue: Money,
): Decimal | null {
  const retail = new Decimal(set.retailPrice);
  if (retail.lessThanOrEqualTo(0)) return null;
  if (sealedValue.currency !== set.currency) {
    throw new Error(
      `sealed value currency ${sealedValue.currency} does not match set currency ${set.currency}`,
    );
  }
  return sealedValue.amount.minus(retail).div(retail);
}
