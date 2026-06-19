import { Decimal } from "decimal.js";

import { Money } from "../money";
import { buildWineIndex, type WineIndex } from "./index-series";
import { provenanceFactor, provenanceUncertainty } from "./provenance";
import {
  FORMAT_VOLUME_RATIO,
  type PriceObservation,
  type Wine,
  type WineLot,
} from "./wine";

/**
 * Fine-wine valuation engine.
 *
 * Values a {@link WineLot} by combining three independent signals:
 *
 *  1. a Liv-ex-style price **index** built from market observations
 *     (`index-series.ts`) → the reference price per 750ml bottle;
 *  2. a **provenance** premium/discount for this specific lot
 *     (`provenance.ts`) → condition, storage, OWC, documentation;
 *  3. a **confidence band** derived from market price dispersion *and*
 *     provenance uncertainty, combined in quadrature.
 *
 * The point estimate is `index × provenance × format-volume × quantity`. The
 * band is a multiplicative ± around the point estimate at a chosen z-score
 * (default ~95% ⇒ z = 1.96).
 *
 * READ-ONLY: this *reports* an estimate of what a holding is worth. It never
 * quotes a firm price, never offers to buy or sell, and never moves money.
 */

/** Default z-score for the confidence band (~95% two-sided normal). */
export const DEFAULT_CONFIDENCE_Z = 1.96;

/** Floor applied to the lower band so a valuation can never go negative. */
const LOWER_FLOOR = new Decimal(0);

export interface ValuationOptions {
  /**
   * z-score multiplier for the band half-width. 1.96 ≈ 95%, 1.0 ≈ 68%.
   * Must be a positive finite number. Defaults to {@link DEFAULT_CONFIDENCE_Z}.
   */
  z?: number;
  /**
   * Additional flat fractional uncertainty (e.g. 0.05 for general model risk),
   * combined in quadrature with market and provenance uncertainty. Default 0.
   */
  modelUncertainty?: number;
}

export interface WineValuation {
  /** The lot being valued. */
  lotId: string;
  /** The wine identity. */
  wineId: string;
  /** Reference index price per 750ml bottle (before provenance/format). */
  referencePricePerBottle: Money;
  /** Provenance multiplier applied (1.0 = reference provenance). */
  provenanceFactor: Decimal;
  /** Format volume ratio applied (1.0 for a standard bottle). */
  formatRatio: Decimal;
  /** Point estimate of value per physical bottle (after provenance + format). */
  valuePerBottle: Money;
  /** Point estimate of total lot value (per-bottle × quantity). */
  pointEstimate: Money;
  /** Lower bound of the confidence band (never below zero). */
  low: Money;
  /** Upper bound of the confidence band. */
  high: Money;
  /**
   * Fractional half-width of the band relative to the point estimate
   * (e.g. 0.18 ⇒ ±18%). Useful for sorting holdings by valuation confidence.
   */
  bandFraction: Decimal;
  /** Total relative uncertainty (1σ) used to derive the band. */
  relativeUncertainty: Decimal;
  /** Unrealized gain vs. acquisition cost (point estimate − cost basis). */
  unrealizedGain: Money;
}

/** Volatility floor so even tightly-quoted, well-documented lots keep a band. */
const MIN_RELATIVE_UNCERTAINTY = 0.02;

/**
 * Value a single wine lot against a prebuilt {@link WineIndex}.
 *
 * Lets a caller reuse one index across many lots of the same wine. The index's
 * `latestPrice` is the reference per-750ml price; this function applies the
 * lot's provenance and format, scales by quantity, and derives the band.
 */
export function valueLotWithIndex(
  wine: Wine,
  lot: WineLot,
  index: WineIndex,
  options: ValuationOptions = {},
): WineValuation {
  const z = options.z ?? DEFAULT_CONFIDENCE_Z;
  if (!Number.isFinite(z) || z <= 0) {
    throw new Error("valueLot: z must be a positive finite number");
  }
  const modelU = options.modelUncertainty ?? 0;
  if (!Number.isFinite(modelU) || modelU < 0) {
    throw new Error("valueLot: modelUncertainty must be a non-negative number");
  }

  const currency = wine.currency;
  const reference = index.latestPrice;
  const pFactor = provenanceFactor(lot.provenance);
  const formatRatio = new Decimal(FORMAT_VOLUME_RATIO[lot.format]);

  // Per *physical* bottle of this format = reference (per 750ml) × format
  // volume × provenance.
  const perBottle = reference.times(formatRatio).times(pFactor);
  const point = perBottle.times(lot.quantity);

  // Combine uncertainties in quadrature: market dispersion + provenance + model.
  const marketU = index.dispersion;
  const provU = provenanceUncertainty(lot.provenance);
  let relU = marketU
    .pow(2)
    .plus(provU.pow(2))
    .plus(new Decimal(modelU).pow(2))
    .sqrt();
  if (relU.lessThan(MIN_RELATIVE_UNCERTAINTY)) {
    relU = new Decimal(MIN_RELATIVE_UNCERTAINTY);
  }

  const bandFraction = relU.times(z);
  const low = Decimal.max(LOWER_FLOOR, point.times(new Decimal(1).minus(bandFraction)));
  const high = point.times(new Decimal(1).plus(bandFraction));

  const costBasis = new Decimal(lot.costPerBottle).times(lot.quantity);

  return {
    lotId: lot.id,
    wineId: lot.wineId,
    referencePricePerBottle: Money.of(reference, currency),
    provenanceFactor: pFactor,
    formatRatio,
    valuePerBottle: Money.of(perBottle, currency),
    pointEstimate: Money.of(point, currency),
    low: Money.of(low, currency),
    high: Money.of(high, currency),
    bandFraction,
    relativeUncertainty: relU,
    unrealizedGain: Money.of(point.minus(costBasis), currency),
  };
}

/**
 * Value a single wine lot from raw price observations: builds the index, then
 * delegates to {@link valueLotWithIndex}.
 */
export function valueLot(
  wine: Wine,
  lot: WineLot,
  observations: PriceObservation[],
  options: ValuationOptions = {},
): WineValuation {
  if (lot.wineId !== wine.id) {
    throw new Error(
      `valueLot: lot.wineId ${lot.wineId} does not match wine.id ${wine.id}`,
    );
  }
  const index = buildWineIndex(observations);
  return valueLotWithIndex(wine, lot, index, options);
}

export interface CellarValuation {
  /** Currency of the rolled-up totals. */
  currency: string;
  /** Per-lot valuations, in input order. */
  lots: WineValuation[];
  /** Sum of point estimates. */
  pointEstimate: Money;
  /** Sum of lower bounds. */
  low: Money;
  /** Sum of upper bounds. */
  high: Money;
  /** Sum of unrealized gains. */
  unrealizedGain: Money;
}

/**
 * Roll up a set of lot valuations into a cellar total. All lots must share one
 * currency. The band is summed component-wise (a conservative, fully-correlated
 * aggregation — the cellar band is never tighter than the widest single lot's).
 *
 * @throws if `valuations` is empty or currencies differ.
 */
export function valueCellar(valuations: WineValuation[]): CellarValuation {
  if (valuations.length === 0) {
    throw new Error("valueCellar: need at least one valuation");
  }
  const currency = valuations[0].pointEstimate.currency;
  for (const v of valuations) {
    if (v.pointEstimate.currency !== currency) {
      throw new Error(
        `valueCellar: mixed currencies ${currency} vs ${v.pointEstimate.currency}`,
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
  const gain = valuations.reduce(
    (acc, v) => acc.plus(v.unrealizedGain),
    Money.zero(currency),
  );

  return {
    currency,
    lots: valuations,
    pointEstimate: point,
    low,
    high,
    unrealizedGain: gain,
  };
}
