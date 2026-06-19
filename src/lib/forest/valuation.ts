import { Decimal } from "decimal.js";

import { Money } from "../money";
import type { ConfidenceLevel } from "../model/valuation";
import {
  buildTimberPriceIndex,
  type TimberPriceIndex,
} from "./price-index";
import {
  growthParams,
  seasonGrowthMultiplier,
  standingVolumePerHectare,
} from "./growth";
import { ForestStand, type TimberPriceObservation } from "./stand";

/**
 * Forest / timber valuation engine.
 *
 * Values a {@link ForestStand} by composing three independent signals into a
 * point estimate with an explicit, *documented* confidence band:
 *
 *  1. a **biological growth model** (`growth.ts`) — drought-coupled standing
 *     merchantable volume per hectare from a Chapman-Richards curve;
 *  2. a **timber price index** (`price-index.ts`) — the reference price per m³
 *     and the recent price dispersion of the timber market;
 *  3. a **confidence band** combining, in quadrature, the market price
 *     dispersion, a biological/growth-model uncertainty that *grows with the
 *     drought stress actually applied*, and an optional flat model term.
 *
 * Point estimate  = volume/ha × area(ha) × referencePrice × managementFactor.
 * Band            = point × (1 ± z·σ_total), σ_total combined in quadrature.
 *
 * Every value-bearing step is exact-decimal and deterministic — no randomness,
 * no clock, no network (AGENTS.md) — so identical inputs always yield an
 * identical valuation.
 *
 * READ-ONLY: this *reports* what a stand of standing timber is worth. It never
 * quotes a firm price, never proposes a harvest, and never moves money.
 */

/** Default z-score for the confidence band (~95% two-sided normal). */
export const DEFAULT_CONFIDENCE_Z = 1.96;

/**
 * Floor on the biological growth-model uncertainty (1σ). Even a perfectly
 * average, undisturbed stand carries inventory-measurement risk, so the band is
 * never claimed tighter than this on the growth side.
 */
export const BASE_GROWTH_UNCERTAINTY = new Decimal("0.08");

/**
 * Extra growth-model uncertainty contributed per unit of *applied* drought
 * stress. A stand whose recent growth was heavily drought-modulated has a less
 * certain standing volume, widening the band. Scales with how far the net
 * drought effect pulled volume away from the undisturbed base curve.
 */
export const DROUGHT_UNCERTAINTY_SENSITIVITY = new Decimal("0.5");

/** Floor applied to the lower band so a valuation can never go negative. */
const LOWER_FLOOR = new Decimal(0);

export interface ForestValuationOptions {
  /**
   * z-score multiplier for the band half-width. 1.96 ≈ 95%, 1.0 ≈ 68%. Must be
   * a positive finite number. Defaults to {@link DEFAULT_CONFIDENCE_Z}.
   */
  z?: number;
  /**
   * Additional flat fractional uncertainty (1σ) for general model risk,
   * combined in quadrature with the market and growth terms. Default 0.
   */
  modelUncertainty?: number;
}

export interface ForestValuation {
  /** The stand being valued. */
  standId: string;
  /** Drought-adjusted standing merchantable volume per hectare (m³/ha). */
  volumePerHectare: Decimal;
  /** Undisturbed base-curve volume per hectare (m³/ha), for comparison. */
  baseVolumePerHectare: Decimal;
  /** Total drought-adjusted standing volume across the whole stand (m³). */
  totalVolume: Decimal;
  /** Net drought effect on volume (1.0 = none, < 1 = suppressed). */
  droughtEffect: Decimal;
  /** Reference timber price per m³ from the index. */
  referencePricePerCubicMeter: Money;
  /** Management premium/discount applied to the point (1.0 = neutral). */
  managementFactor: Decimal;
  /** Point estimate of total stand value. */
  pointEstimate: Money;
  /** Lower bound of the confidence band (never below zero). */
  low: Money;
  /** Upper bound of the confidence band. */
  high: Money;
  /** Fractional half-width of the band relative to the point (0.2 ⇒ ±20%). */
  bandFraction: Decimal;
  /** Total relative uncertainty (1σ) used to derive the band. */
  relativeUncertainty: Decimal;
  /** Market price-dispersion component of the uncertainty (1σ). */
  marketUncertainty: Decimal;
  /** Biological/growth-model component of the uncertainty (1σ). */
  growthUncertainty: Decimal;
  /** Coarse confidence label derived from the band fraction. */
  confidence: ConfidenceLevel;
}

/**
 * Map a band fraction to a coarse {@link ConfidenceLevel}. A tight band ⇒
 * `high`; a wide band ⇒ `low`. Thresholds are documented modeling choices.
 */
export function confidenceForBand(bandFraction: Decimal): ConfidenceLevel {
  if (bandFraction.lessThanOrEqualTo("0.2")) return "high";
  if (bandFraction.lessThanOrEqualTo("0.4")) return "medium";
  return "low";
}

/**
 * Growth-model uncertainty (1σ) for a stand. Starts at
 * {@link BASE_GROWTH_UNCERTAINTY} and widens with how far drought pulled the
 * volume off the undisturbed base curve: `base + sensitivity · |1 −
 * droughtEffect|`.
 */
export function growthUncertaintyFor(droughtEffect: Decimal): Decimal {
  const pull = droughtEffect.minus(1).abs();
  return BASE_GROWTH_UNCERTAINTY.plus(
    DROUGHT_UNCERTAINTY_SENSITIVITY.times(pull),
  );
}

/**
 * Value a forest stand against a prebuilt {@link TimberPriceIndex}. Lets a
 * caller reuse one index across many stands in the same market/currency.
 *
 * @throws if the stand and index currencies differ, or `z`/`modelUncertainty`
 *   are out of range.
 */
export function valueStandWithIndex(
  input: ForestStand | unknown,
  index: TimberPriceIndex,
  options: ForestValuationOptions = {},
): ForestValuation {
  const stand = ForestStand.parse(input);

  if (stand.currency !== index.currency) {
    throw new Error(
      `valueStand: stand currency ${stand.currency} does not match price index currency ${index.currency}`,
    );
  }

  const z = options.z ?? DEFAULT_CONFIDENCE_Z;
  if (!Number.isFinite(z) || z <= 0) {
    throw new Error("valueStand: z must be a positive finite number");
  }
  const modelU = options.modelUncertainty ?? 0;
  if (!Number.isFinite(modelU) || modelU < 0) {
    throw new Error(
      "valueStand: modelUncertainty must be a non-negative number",
    );
  }

  const params = growthParams(stand.species, stand.siteClass);
  const growth = standingVolumePerHectare(
    stand.standAgeYears,
    params,
    stand.seasons,
  );

  const area = new Decimal(stand.areaHectares);
  const totalVolume = growth.volumePerHectare.times(area);
  const reference = index.latestPrice;
  const management = new Decimal(stand.managementFactor);

  const point = totalVolume.times(reference).times(management);

  // Uncertainty terms (1σ), combined in quadrature.
  const marketU = index.dispersion;
  const growthU = growthUncertaintyFor(growth.droughtEffect);
  const relU = marketU
    .pow(2)
    .plus(growthU.pow(2))
    .plus(new Decimal(modelU).pow(2))
    .sqrt();

  const bandFraction = relU.times(z);
  const low = Decimal.max(
    LOWER_FLOOR,
    point.times(new Decimal(1).minus(bandFraction)),
  );
  const high = point.times(new Decimal(1).plus(bandFraction));

  const currency = stand.currency;
  return {
    standId: stand.id,
    volumePerHectare: growth.volumePerHectare,
    baseVolumePerHectare: growth.baseVolumePerHectare,
    totalVolume,
    droughtEffect: growth.droughtEffect,
    referencePricePerCubicMeter: Money.of(reference, currency),
    managementFactor: management,
    pointEstimate: Money.of(point, currency).round(0),
    low: Money.of(low, currency).round(0),
    high: Money.of(high, currency).round(0),
    bandFraction,
    relativeUncertainty: relU,
    marketUncertainty: marketU,
    growthUncertainty: growthU,
    confidence: confidenceForBand(bandFraction),
  };
}

/**
 * Value a forest stand from raw timber price observations: builds the price
 * index, then delegates to {@link valueStandWithIndex}.
 *
 * @throws if `observations` is empty (see {@link buildTimberPriceIndex}).
 */
export function valueStand(
  input: ForestStand | unknown,
  observations: TimberPriceObservation[],
  options: ForestValuationOptions = {},
): ForestValuation {
  const index = buildTimberPriceIndex(observations);
  return valueStandWithIndex(input, index, options);
}

export interface ForestPortfolioValuation {
  /** Currency of the rolled-up totals. */
  currency: string;
  /** Per-stand valuations, in input order. */
  stands: ForestValuation[];
  /** Sum of point estimates. */
  pointEstimate: Money;
  /** Sum of lower bounds. */
  low: Money;
  /** Sum of upper bounds. */
  high: Money;
  /** Total standing volume across all stands (m³). */
  totalVolume: Decimal;
}

/**
 * Roll up a set of stand valuations into a forest-portfolio total. All stands
 * must share one currency. The band is summed component-wise (a conservative,
 * fully-correlated aggregation — the portfolio band is never tighter than the
 * widest single stand's).
 *
 * @throws if `valuations` is empty or currencies differ.
 */
export function valueForest(
  valuations: ForestValuation[],
): ForestPortfolioValuation {
  if (valuations.length === 0) {
    throw new Error("valueForest: need at least one stand valuation");
  }
  const currency = valuations[0].pointEstimate.currency;
  for (const v of valuations) {
    if (v.pointEstimate.currency !== currency) {
      throw new Error(
        `valueForest: mixed currencies ${currency} vs ${v.pointEstimate.currency}`,
      );
    }
  }

  const point = valuations.reduce(
    (acc, v) => acc.plus(v.pointEstimate),
    Money.zero(currency),
  );
  const low = valuations.reduce(
    (acc, v) => acc.plus(v.low),
    Money.zero(currency),
  );
  const high = valuations.reduce(
    (acc, v) => acc.plus(v.high),
    Money.zero(currency),
  );
  const totalVolume = valuations.reduce(
    (acc, v) => acc.plus(v.totalVolume),
    new Decimal(0),
  );

  return {
    currency,
    stands: valuations,
    pointEstimate: point,
    low,
    high,
    totalVolume,
  };
}

// Re-exported so a caller can compute a single season's multiplier without
// reaching into the growth module directly (handy for UI/explainers).
export { seasonGrowthMultiplier };
