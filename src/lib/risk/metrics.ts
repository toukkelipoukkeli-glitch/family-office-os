/**
 * Core risk metrics computed from a series of periodic simple returns.
 *
 * All functions are pure and deterministic. Returns are decimals (0.01 = +1%).
 * Where a metric depends on the periodicity of the data (volatility, Sharpe,
 * Sortino) an optional `periodsPerYear` annualizes the result; omit it (or pass
 * `1`) to get the per-period figure. None of this moves money — it only
 * summarizes the statistical shape of a series the family already holds.
 */

import { RiskInputError, mean, stddev } from "./returns";

/**
 * Per-period or annualized volatility: the (sample) standard deviation of the
 * return series, optionally scaled by `sqrt(periodsPerYear)`.
 *
 * Requires at least two returns. `periodsPerYear` must be positive (e.g. 252
 * for daily, 12 for monthly).
 */
export function volatility(
  returns: readonly number[],
  { periodsPerYear = 1 }: { periodsPerYear?: number } = {},
): number {
  if (periodsPerYear <= 0 || !Number.isFinite(periodsPerYear)) {
    throw new RiskInputError("periodsPerYear must be a positive finite number");
  }
  return stddev(returns, { sample: true }) * Math.sqrt(periodsPerYear);
}

/**
 * Maximum drawdown of a return series, as a non-negative fraction in `[0, 1]`.
 *
 * The series is compounded into an equity curve starting at 1; the drawdown at
 * each point is the relative drop from the running peak, and the maximum of
 * those is returned. A monotonically rising (or flat) curve has drawdown 0.
 *
 * Also reports the indices (into the *returns* array) where the peak preceding
 * the worst trough occurred and where the trough occurred, for charting.
 */
export interface MaxDrawdown {
  /** Worst peak-to-trough decline as a fraction in [0, 1]. */
  maxDrawdown: number;
  /**
   * Index of the return after which the preceding peak was set. The sentinel
   * `-1` means the peak is the *starting* equity (1.0), before any return — this
   * happens when the worst drawdown begins from the start of the series (e.g. an
   * all-negative series). Charting code should treat `-1` as the curve's origin.
   */
  peakIndex: number;
  /** Index of the return at which the worst trough was reached. */
  troughIndex: number;
}

export function maxDrawdown(returns: readonly number[]): MaxDrawdown {
  if (returns.length === 0) {
    throw new RiskInputError("maxDrawdown requires at least one return");
  }
  for (let i = 0; i < returns.length; i++) {
    if (!Number.isFinite(returns[i])) {
      throw new RiskInputError(
        `maxDrawdown input must be finite; got ${returns[i]} at index ${i}`,
      );
    }
  }
  let equity = 1;
  let peak = 1;
  // -1 means the peak is the starting equity (before any return). It is updated
  // to a real return index only when a later compounded equity exceeds it.
  let peakIdx = -1;
  let maxDd = 0;
  let bestPeakIdx = -1;
  let bestTroughIdx = 0;
  for (let i = 0; i < returns.length; i++) {
    equity *= 1 + returns[i];
    if (equity > peak) {
      peak = equity;
      peakIdx = i;
    }
    const dd = peak === 0 ? 0 : (peak - equity) / peak;
    if (dd > maxDd) {
      maxDd = dd;
      bestPeakIdx = peakIdx;
      bestTroughIdx = i;
    }
  }
  return {
    maxDrawdown: maxDd,
    peakIndex: bestPeakIdx,
    troughIndex: bestTroughIdx,
  };
}

/**
 * Downside deviation: the root-mean-square of returns that fall below
 * `targetReturn` (the minimum acceptable return, default 0), counting
 * above-target periods as zero shortfall. Uses an `n`-denominator (population
 * convention used by Sortino), so it requires at least one return.
 */
export function downsideDeviation(
  returns: readonly number[],
  { targetReturn = 0 }: { targetReturn?: number } = {},
): number {
  if (returns.length === 0) {
    throw new RiskInputError("downsideDeviation requires at least one return");
  }
  if (!Number.isFinite(targetReturn)) {
    throw new RiskInputError("targetReturn must be finite");
  }
  let ss = 0;
  for (let i = 0; i < returns.length; i++) {
    const r = returns[i];
    if (!Number.isFinite(r)) {
      throw new RiskInputError(
        `downsideDeviation input must be finite; got ${r} at index ${i}`,
      );
    }
    const shortfall = Math.min(0, r - targetReturn);
    ss += shortfall * shortfall;
  }
  return Math.sqrt(ss / returns.length);
}

interface RatioOptions {
  /** Per-period risk-free (Sharpe) / target (Sortino) return. Default 0. */
  riskFreeRate?: number;
  /** Periods per year for annualization. Default 1 (no annualization). */
  periodsPerYear?: number;
}

function assertRatioOptions(periodsPerYear: number, riskFreeRate: number): void {
  if (periodsPerYear <= 0 || !Number.isFinite(periodsPerYear)) {
    throw new RiskInputError("periodsPerYear must be a positive finite number");
  }
  if (!Number.isFinite(riskFreeRate)) {
    throw new RiskInputError("riskFreeRate must be finite");
  }
}

/**
 * Sharpe ratio: mean excess return over the risk-free rate, divided by the
 * (sample) standard deviation of returns. Annualized by `sqrt(periodsPerYear)`
 * when `periodsPerYear > 1`.
 *
 * Requires at least two returns. Throws if the return series has zero
 * volatility (an undefined ratio).
 */
export function sharpeRatio(
  returns: readonly number[],
  { riskFreeRate = 0, periodsPerYear = 1 }: RatioOptions = {},
): number {
  if (returns.length < 2) {
    throw new RiskInputError("sharpeRatio requires at least two returns");
  }
  assertRatioOptions(periodsPerYear, riskFreeRate);
  const vol = stddev(returns, { sample: true });
  if (vol === 0) {
    throw new RiskInputError(
      "sharpeRatio is undefined for a zero-volatility series",
    );
  }
  const excessMean = mean(returns) - riskFreeRate;
  return (excessMean / vol) * Math.sqrt(periodsPerYear);
}

/**
 * Sortino ratio: mean excess return over the risk-free / target rate, divided
 * by the downside deviation (penalizing only below-target volatility).
 * Annualized by `sqrt(periodsPerYear)` when `periodsPerYear > 1`.
 *
 * Requires at least one return. Throws if the downside deviation is zero (no
 * below-target periods → an undefined ratio).
 */
export function sortinoRatio(
  returns: readonly number[],
  { riskFreeRate = 0, periodsPerYear = 1 }: RatioOptions = {},
): number {
  if (returns.length === 0) {
    throw new RiskInputError("sortinoRatio requires at least one return");
  }
  assertRatioOptions(periodsPerYear, riskFreeRate);
  const dd = downsideDeviation(returns, { targetReturn: riskFreeRate });
  if (dd === 0) {
    throw new RiskInputError(
      "sortinoRatio is undefined when downside deviation is zero",
    );
  }
  const excessMean = mean(returns) - riskFreeRate;
  return (excessMean / dd) * Math.sqrt(periodsPerYear);
}
