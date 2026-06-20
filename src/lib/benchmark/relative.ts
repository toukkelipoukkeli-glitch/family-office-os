/**
 * Relative-performance metrics for a portfolio measured against a benchmark.
 *
 * Everything here is pure, deterministic and offline. Inputs are two aligned
 * series of periodic *simple* returns expressed as decimals (`0.01` = +1%) —
 * the portfolio and its benchmark, observed over the same dates. None of this
 * moves money or places trades; it only describes how a book the family already
 * holds performed relative to the yardstick it is measured against.
 *
 * Where a metric depends on the periodicity of the data (tracking error,
 * information ratio) an optional `periodsPerYear` annualizes the result; omit it
 * (or pass `1`) to get the per-period figure (252 daily, 52 weekly, 12 monthly,
 * 4 quarterly).
 */

/** Thrown when a relative metric is given input it cannot meaningfully reduce. */
export class BenchmarkInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BenchmarkInputError";
  }
}

function assertPeriodsPerYear(periodsPerYear: number): void {
  if (periodsPerYear <= 0 || !Number.isFinite(periodsPerYear)) {
    throw new BenchmarkInputError(
      "periodsPerYear must be a positive finite number",
    );
  }
}

/**
 * Validate that two return series align (equal length) and contain only finite
 * numbers, with at least `minLength` observations each. Returns the shared
 * length.
 */
function assertAligned(
  portfolio: readonly number[],
  benchmark: readonly number[],
  minLength: number,
): number {
  if (portfolio.length !== benchmark.length) {
    throw new BenchmarkInputError(
      `portfolio and benchmark series must align; got lengths ${portfolio.length} and ${benchmark.length}`,
    );
  }
  if (portfolio.length < minLength) {
    throw new BenchmarkInputError(
      `at least ${minLength} observation(s) required; got ${portfolio.length}`,
    );
  }
  for (let i = 0; i < portfolio.length; i++) {
    if (!Number.isFinite(portfolio[i])) {
      throw new BenchmarkInputError(
        `portfolio series has non-finite value ${portfolio[i]} at index ${i}`,
      );
    }
    if (!Number.isFinite(benchmark[i])) {
      throw new BenchmarkInputError(
        `benchmark series has non-finite value ${benchmark[i]} at index ${i}`,
      );
    }
  }
  return portfolio.length;
}

function meanOf(values: readonly number[]): number {
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/**
 * Per-period excess (active) returns: `portfolio[i] - benchmark[i]`.
 *
 * Requires at least one aligned observation. This is the arithmetic active
 * return per period — the building block of tracking error and the information
 * ratio.
 */
export function excessReturns(
  portfolio: readonly number[],
  benchmark: readonly number[],
): number[] {
  assertAligned(portfolio, benchmark, 1);
  const out: number[] = new Array(portfolio.length);
  for (let i = 0; i < portfolio.length; i++) {
    out[i] = portfolio[i] - benchmark[i];
  }
  return out;
}

/**
 * Compound a series of periodic simple returns into one total return over the
 * whole window: `∏(1 + r) - 1`.
 */
export function compoundReturn(returns: readonly number[]): number {
  if (returns.length === 0) {
    throw new BenchmarkInputError("compoundReturn requires at least one return");
  }
  let growth = 1;
  for (let i = 0; i < returns.length; i++) {
    if (!Number.isFinite(returns[i])) {
      throw new BenchmarkInputError(
        `compoundReturn input must be finite; got ${returns[i]} at index ${i}`,
      );
    }
    growth *= 1 + returns[i];
  }
  return growth - 1;
}

/**
 * Total **excess return** over the whole window, geometrically linked: the
 * compounded portfolio return minus the compounded benchmark return. This is
 * the headline "did we beat the benchmark, and by how much" figure and, unlike
 * a naïve sum of per-period active returns, it accounts for compounding.
 */
export function excessReturn(
  portfolio: readonly number[],
  benchmark: readonly number[],
): number {
  assertAligned(portfolio, benchmark, 1);
  return compoundReturn(portfolio) - compoundReturn(benchmark);
}

/**
 * **Tracking error**: the (sample) standard deviation of the per-period excess
 * returns, optionally annualized by `sqrt(periodsPerYear)`.
 *
 * Requires at least two aligned observations. A portfolio that exactly tracks
 * its benchmark has a tracking error of 0.
 */
export function trackingError(
  portfolio: readonly number[],
  benchmark: readonly number[],
  { periodsPerYear = 1 }: { periodsPerYear?: number } = {},
): number {
  const n = assertAligned(portfolio, benchmark, 2);
  assertPeriodsPerYear(periodsPerYear);
  const active = excessReturns(portfolio, benchmark);
  const m = meanOf(active);
  let ss = 0;
  for (let i = 0; i < n; i++) {
    const d = active[i] - m;
    ss += d * d;
  }
  const variance = ss / (n - 1);
  return Math.sqrt(variance) * Math.sqrt(periodsPerYear);
}

/**
 * **Information ratio**: the mean per-period active return divided by the
 * tracking error (the per-period standard deviation of active returns). When
 * `periodsPerYear > 1`, both numerator and denominator are annualized, which
 * works out to scaling the per-period ratio by `sqrt(periodsPerYear)`.
 *
 * Requires at least two aligned observations. Throws if the tracking error is
 * zero (an undefined ratio) — a portfolio that perfectly tracks its benchmark
 * has no information ratio.
 */
export function informationRatio(
  portfolio: readonly number[],
  benchmark: readonly number[],
  { periodsPerYear = 1 }: { periodsPerYear?: number } = {},
): number {
  const n = assertAligned(portfolio, benchmark, 2);
  assertPeriodsPerYear(periodsPerYear);
  const active = excessReturns(portfolio, benchmark);
  const m = meanOf(active);
  let ss = 0;
  for (let i = 0; i < n; i++) {
    const d = active[i] - m;
    ss += d * d;
  }
  const sd = Math.sqrt(ss / (n - 1));
  if (sd === 0) {
    throw new BenchmarkInputError(
      "information ratio is undefined when tracking error is zero",
    );
  }
  return (m / sd) * Math.sqrt(periodsPerYear);
}

/**
 * **Beta** of the portfolio to its benchmark: the slope of an OLS regression of
 * portfolio returns on benchmark returns, i.e. `cov(p, b) / var(b)`. A beta of
 * 1 moves one-for-one with the benchmark; below 1 is defensive, above 1 is
 * aggressive.
 *
 * Requires at least two aligned observations. Throws if the benchmark has zero
 * variance (beta is undefined against a flat benchmark).
 */
export function beta(
  portfolio: readonly number[],
  benchmark: readonly number[],
): number {
  const n = assertAligned(portfolio, benchmark, 2);
  const mp = meanOf(portfolio);
  const mb = meanOf(benchmark);
  let cov = 0;
  let varB = 0;
  for (let i = 0; i < n; i++) {
    const db = benchmark[i] - mb;
    cov += (portfolio[i] - mp) * db;
    varB += db * db;
  }
  if (varB === 0) {
    throw new BenchmarkInputError(
      "beta is undefined for a zero-variance benchmark",
    );
  }
  return cov / varB;
}

/**
 * **Alpha** (Jensen's alpha, per period): the portfolio's mean return in excess
 * of what its beta exposure to the benchmark would predict, given a per-period
 * risk-free rate. `alpha = mean(p) - [rf + beta * (mean(b) - rf)]`.
 *
 * Requires at least two aligned observations. Defaults to a zero risk-free
 * rate, in which case it reduces to `mean(p) - beta * mean(b)`.
 */
export function alpha(
  portfolio: readonly number[],
  benchmark: readonly number[],
  { riskFreeRate = 0 }: { riskFreeRate?: number } = {},
): number {
  assertAligned(portfolio, benchmark, 2);
  if (!Number.isFinite(riskFreeRate)) {
    throw new BenchmarkInputError("riskFreeRate must be finite");
  }
  const b = beta(portfolio, benchmark);
  const mp = meanOf(portfolio);
  const mb = meanOf(benchmark);
  return mp - (riskFreeRate + b * (mb - riskFreeRate));
}

/** A full relative-performance summary of a portfolio vs. a benchmark. */
export interface RelativePerformance {
  /** Compounded portfolio total return over the window. */
  portfolioReturn: number;
  /** Compounded benchmark total return over the window. */
  benchmarkReturn: number;
  /** Geometric excess (active) return: portfolio − benchmark, compounded. */
  excessReturn: number;
  /** (Annualized) standard deviation of per-period active returns. */
  trackingError: number;
  /** Annualized information ratio (mean active / tracking error). */
  informationRatio: number;
  /** Portfolio beta to the benchmark. */
  beta: number;
  /** Per-period Jensen's alpha. */
  alpha: number;
}

/**
 * Compute the full relative-performance summary in one pass over the inputs.
 *
 * `periodsPerYear` annualizes the tracking error and information ratio;
 * `riskFreeRate` is the per-period risk-free used by alpha. Requires at least
 * two aligned observations.
 */
export function relativePerformance(
  portfolio: readonly number[],
  benchmark: readonly number[],
  {
    periodsPerYear = 1,
    riskFreeRate = 0,
  }: { periodsPerYear?: number; riskFreeRate?: number } = {},
): RelativePerformance {
  assertAligned(portfolio, benchmark, 2);
  assertPeriodsPerYear(periodsPerYear);
  return {
    portfolioReturn: compoundReturn(portfolio),
    benchmarkReturn: compoundReturn(benchmark),
    excessReturn: excessReturn(portfolio, benchmark),
    trackingError: trackingError(portfolio, benchmark, { periodsPerYear }),
    informationRatio: informationRatio(portfolio, benchmark, { periodsPerYear }),
    beta: beta(portfolio, benchmark),
    alpha: alpha(portfolio, benchmark, { riskFreeRate }),
  };
}
