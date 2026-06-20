/**
 * Relative-performance metrics: how a portfolio's periodic return series
 * compares to a benchmark return series.
 *
 *  - {@link excessReturns}      — per-period active return (portfolio − benchmark)
 *  - {@link meanExcessReturn}   — average active return per period
 *  - {@link trackingError}      — stddev of the active-return series (annualizable)
 *  - {@link informationRatio}   — mean active return / tracking error (annualizable)
 *  - {@link beta}               — sensitivity of portfolio to benchmark (cov / var)
 *  - {@link alpha}              — Jensen's alpha intercept of the regression
 *  - {@link correlation}        — Pearson correlation of the two series
 *  - {@link relativePerformance}— a bundled summary of all of the above
 *
 * Returns are decimal simple returns (`0.01` = +1%). Where a metric depends on
 * periodicity (tracking error, information ratio) an optional `periodsPerYear`
 * annualizes it. Pure, deterministic, offline — nothing here moves money.
 */

export class RelativePerformanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RelativePerformanceError";
  }
}

function assertAligned(
  portfolio: readonly number[],
  benchmark: readonly number[],
  minLen = 1,
): void {
  if (portfolio.length !== benchmark.length) {
    throw new RelativePerformanceError(
      `portfolio and benchmark series must be the same length; got ${portfolio.length} and ${benchmark.length}`,
    );
  }
  if (portfolio.length < minLen) {
    throw new RelativePerformanceError(
      `relative performance requires at least ${minLen} aligned period(s)`,
    );
  }
  for (let i = 0; i < portfolio.length; i++) {
    if (!Number.isFinite(portfolio[i])) {
      throw new RelativePerformanceError(
        `portfolio return at index ${i} is not finite: ${portfolio[i]}`,
      );
    }
    if (!Number.isFinite(benchmark[i])) {
      throw new RelativePerformanceError(
        `benchmark return at index ${i} is not finite: ${benchmark[i]}`,
      );
    }
  }
}

function assertPeriodsPerYear(periodsPerYear: number): void {
  if (periodsPerYear <= 0 || !Number.isFinite(periodsPerYear)) {
    throw new RelativePerformanceError(
      "periodsPerYear must be a positive finite number",
    );
  }
}

function meanOf(values: readonly number[]): number {
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/** Per-period active return: `portfolio[t] − benchmark[t]`. */
export function excessReturns(
  portfolio: readonly number[],
  benchmark: readonly number[],
): number[] {
  assertAligned(portfolio, benchmark, 1);
  const out: number[] = [];
  for (let i = 0; i < portfolio.length; i++) {
    out.push(portfolio[i] - benchmark[i]);
  }
  return out;
}

/** Average per-period active return (portfolio − benchmark). */
export function meanExcessReturn(
  portfolio: readonly number[],
  benchmark: readonly number[],
): number {
  return meanOf(excessReturns(portfolio, benchmark));
}

interface AnnualizeOptions {
  /** Periods per year for annualization. Default 1 (per-period figure). */
  periodsPerYear?: number;
}

/**
 * Tracking error: the (sample) standard deviation of the active-return series,
 * optionally annualized by `sqrt(periodsPerYear)`.
 *
 * Requires at least two aligned periods. A portfolio that exactly tracks its
 * benchmark every period has a tracking error of 0.
 */
export function trackingError(
  portfolio: readonly number[],
  benchmark: readonly number[],
  { periodsPerYear = 1 }: AnnualizeOptions = {},
): number {
  assertAligned(portfolio, benchmark, 2);
  assertPeriodsPerYear(periodsPerYear);
  const active = excessReturns(portfolio, benchmark);
  const m = meanOf(active);
  let ss = 0;
  for (const a of active) {
    const d = a - m;
    ss += d * d;
  }
  const variance = ss / (active.length - 1);
  return Math.sqrt(variance) * Math.sqrt(periodsPerYear);
}

/**
 * Information ratio: mean active return divided by tracking error, optionally
 * annualized by `sqrt(periodsPerYear)` (both numerator and denominator scale,
 * so the per-period IR is multiplied by `sqrt(periodsPerYear)`).
 *
 * Requires at least two aligned periods. Throws if the tracking error is zero
 * (an undefined ratio — the portfolio perfectly tracks the benchmark).
 */
export function informationRatio(
  portfolio: readonly number[],
  benchmark: readonly number[],
  { periodsPerYear = 1 }: AnnualizeOptions = {},
): number {
  assertAligned(portfolio, benchmark, 2);
  assertPeriodsPerYear(periodsPerYear);
  const active = excessReturns(portfolio, benchmark);
  const m = meanOf(active);
  // Per-period tracking error (unannualized) for the ratio's denominator.
  const tePerPeriod = trackingError(portfolio, benchmark);
  if (tePerPeriod === 0) {
    throw new RelativePerformanceError(
      "information ratio is undefined when tracking error is zero",
    );
  }
  return (m / tePerPeriod) * Math.sqrt(periodsPerYear);
}

/**
 * Beta: the sensitivity of the portfolio to the benchmark — the slope of the
 * least-squares regression of portfolio returns on benchmark returns, i.e.
 * `cov(portfolio, benchmark) / var(benchmark)`.
 *
 * Uses the sample (`n − 1`) convention for both covariance and variance (the
 * factor cancels, so it is equivalent to the population convention). Requires at
 * least two aligned periods. Throws if the benchmark has zero variance (beta is
 * undefined against a constant benchmark).
 */
export function beta(
  portfolio: readonly number[],
  benchmark: readonly number[],
): number {
  assertAligned(portfolio, benchmark, 2);
  const n = portfolio.length;
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
    throw new RelativePerformanceError(
      "beta is undefined when the benchmark has zero variance",
    );
  }
  return cov / varB;
}

/**
 * Jensen's alpha (per period): the intercept of the regression of portfolio
 * returns on benchmark returns, `mean(portfolio) − beta · mean(benchmark)`. It
 * is the portfolio's average return not explained by its benchmark exposure.
 */
export function alpha(
  portfolio: readonly number[],
  benchmark: readonly number[],
): number {
  const b = beta(portfolio, benchmark);
  return meanOf(portfolio) - b * meanOf(benchmark);
}

/**
 * Pearson correlation coefficient between the portfolio and benchmark return
 * series, in `[-1, 1]`. Requires at least two aligned periods. Throws if either
 * series has zero variance (correlation undefined).
 */
export function correlation(
  portfolio: readonly number[],
  benchmark: readonly number[],
): number {
  assertAligned(portfolio, benchmark, 2);
  const n = portfolio.length;
  const mp = meanOf(portfolio);
  const mb = meanOf(benchmark);
  let cov = 0;
  let varP = 0;
  let varB = 0;
  for (let i = 0; i < n; i++) {
    const dp = portfolio[i] - mp;
    const db = benchmark[i] - mb;
    cov += dp * db;
    varP += dp * dp;
    varB += db * db;
  }
  if (varP === 0 || varB === 0) {
    throw new RelativePerformanceError(
      "correlation is undefined when a series has zero variance",
    );
  }
  return cov / Math.sqrt(varP * varB);
}

/** A bundled relative-performance summary for charting and tabular display. */
export interface RelativePerformance {
  periodsPerYear: number;
  /** Total compounded portfolio return over the window. */
  portfolioTotalReturn: number;
  /** Total compounded benchmark return over the window. */
  benchmarkTotalReturn: number;
  /** Compounded portfolio minus compounded benchmark. */
  totalExcessReturn: number;
  /** Average per-period active return. */
  meanExcessReturn: number;
  /** Per-period active-return series. */
  excess: number[];
  /** Annualized tracking error. */
  trackingError: number;
  /** Annualized information ratio. */
  informationRatio: number;
  beta: number;
  /** Annualized Jensen's alpha. */
  alpha: number;
  correlation: number;
}

function compound(returns: readonly number[]): number {
  let g = 1;
  for (const r of returns) g *= 1 + r;
  return g - 1;
}

/**
 * Compute the full relative-performance bundle for a portfolio measured against
 * a benchmark over the same aligned window. `periodsPerYear` annualizes the
 * tracking error, information ratio and alpha; pass it for the data's frequency
 * (12 monthly, 4 quarterly, 252 daily).
 */
export function relativePerformance(
  portfolio: readonly number[],
  benchmark: readonly number[],
  { periodsPerYear = 1 }: AnnualizeOptions = {},
): RelativePerformance {
  assertAligned(portfolio, benchmark, 2);
  assertPeriodsPerYear(periodsPerYear);
  const excess = excessReturns(portfolio, benchmark);
  const b = beta(portfolio, benchmark);
  return {
    periodsPerYear,
    portfolioTotalReturn: compound(portfolio),
    benchmarkTotalReturn: compound(benchmark),
    totalExcessReturn: compound(portfolio) - compound(benchmark),
    meanExcessReturn: meanOf(excess),
    excess,
    trackingError: trackingError(portfolio, benchmark, { periodsPerYear }),
    informationRatio: informationRatio(portfolio, benchmark, { periodsPerYear }),
    beta: b,
    alpha: alpha(portfolio, benchmark) * periodsPerYear,
    correlation: correlation(portfolio, benchmark),
  };
}
