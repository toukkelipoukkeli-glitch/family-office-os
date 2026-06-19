import { Decimal } from "decimal.js";

import type { TimberPriceObservation } from "./stand";

/**
 * Timber price index for a single species/market.
 *
 * Given a series of dated price-per-m³ observations, this builds a normalized
 * index (base 100 at the first observation), reports the latest reference
 * price, and measures recent price *dispersion* — how noisy the recent quotes
 * are. Dispersion feeds the valuation confidence band: a thinly- or
 * noisily-quoted timber market gets a wider band than one with tight,
 * consistent quotes.
 *
 * Mirrors the rebasing approach used by published timber price indices (a
 * basket rebased to 100 at a start date), but tracks one market's own price
 * history.
 *
 * READ-ONLY: this reports prices; it never quotes a firm price for a trade.
 */

/** Base value of the index at its first observation. */
export const INDEX_BASE = 100;

/** One point on the rebased index. */
export interface IndexPoint {
  /** Observation date (ISO). */
  date: string;
  /** Reference price per m³ at this date, exact decimal. */
  price: Decimal;
  /** Index value rebased to {@link INDEX_BASE} at the first observation. */
  index: Decimal;
}

export interface TimberPriceIndex {
  /** Currency of all prices in this index. */
  currency: string;
  /** Rebased index series, ordered ascending by date. */
  points: IndexPoint[];
  /** Most recent reference price per m³. */
  latestPrice: Decimal;
  /** Date of the most recent observation. */
  latestDate: string;
  /** Total return of the index from first to last observation (0.25 = +25%). */
  totalReturn: Decimal;
  /**
   * Coefficient of variation (sample SD / mean) of the most recent
   * observations — a unitless measure of recent price dispersion in [0, ∞).
   * Zero when there are fewer than two recent observations or they are all
   * equal. Feeds the valuation confidence band.
   */
  dispersion: Decimal;
  /** Number of observations the index was built from. */
  observationCount: number;
}

/** Parse an ISO date (already validated upstream) to a UTC epoch for sorting. */
function epoch(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/**
 * Build a {@link TimberPriceIndex} from price observations. Observations are
 * sorted by date ascending; the first becomes the index base (100).
 * `dispersionWindow` caps how many of the most-recent observations feed the
 * dispersion estimate (default 6) so the band reflects current, not ancient,
 * market noise.
 *
 * @throws if `observations` is empty or mixes currencies.
 */
export function buildTimberPriceIndex(
  observations: TimberPriceObservation[],
  dispersionWindow = 6,
): TimberPriceIndex {
  if (observations.length === 0) {
    throw new Error(
      "buildTimberPriceIndex: need at least one price observation",
    );
  }
  const currency = observations[0].currency;
  for (const o of observations) {
    if (o.currency !== currency) {
      throw new Error(
        `buildTimberPriceIndex: mixed currencies ${currency} vs ${o.currency}`,
      );
    }
  }

  const sorted = [...observations].sort((a, b) => {
    const ea = epoch(a.date);
    const eb = epoch(b.date);
    if (ea !== eb) return ea - eb;
    // Stable tie-break on price so equal-date inputs are deterministic.
    return new Decimal(a.pricePerCubicMeter).comparedTo(b.pricePerCubicMeter);
  });

  const basePrice = new Decimal(sorted[0].pricePerCubicMeter);
  if (basePrice.lessThanOrEqualTo(0)) {
    throw new Error(
      "buildTimberPriceIndex: first observation price must be > 0 to rebase",
    );
  }

  const points: IndexPoint[] = sorted.map((o) => {
    const price = new Decimal(o.pricePerCubicMeter);
    return {
      date: o.date,
      price,
      index: price.div(basePrice).times(INDEX_BASE),
    };
  });

  const latest = points[points.length - 1];
  const totalReturn = latest.price.div(basePrice).minus(1);

  return {
    currency,
    points,
    latestPrice: latest.price,
    latestDate: latest.date,
    totalReturn,
    dispersion: dispersionOf(
      points.slice(Math.max(0, points.length - dispersionWindow)),
    ),
    observationCount: sorted.length,
  };
}

/**
 * Coefficient of variation (sample SD / mean) of a window's prices. Uses the
 * unbiased (n−1) sample variance. Returns 0 for fewer than two points or a
 * zero/negative mean.
 */
function dispersionOf(window: IndexPoint[]): Decimal {
  const n = window.length;
  if (n < 2) return new Decimal(0);

  const prices = window.map((p) => p.price);
  const mean = prices.reduce((a, b) => a.plus(b), new Decimal(0)).div(n);
  if (mean.lessThanOrEqualTo(0)) return new Decimal(0);

  const variance = prices
    .reduce((acc, p) => acc.plus(p.minus(mean).pow(2)), new Decimal(0))
    .div(n - 1);
  return variance.sqrt().div(mean);
}
