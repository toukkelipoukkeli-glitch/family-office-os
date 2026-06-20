/**
 * View model for the benchmark / relative-performance page.
 *
 * Given the family's portfolio return series and a chosen benchmark (which may
 * be a single index or a blended policy basket), this builds everything the UI
 * needs: the headline relative-performance KPIs, a per-period table of returns
 * and active return, and two compounded growth curves (portfolio vs. benchmark)
 * plus a cumulative-excess curve for charting.
 *
 * Pure, deterministic and offline.
 */

import {
  excessReturns,
  relativePerformance,
  type RelativePerformance,
} from "./relative";
import {
  blendPolicyReturns,
  type PolicyBenchmark,
  type RebalanceMode,
} from "./policy";

/** A single period's row in the relative-performance table / curve. */
export interface PeriodRow {
  /** 1-based period index, for labels. */
  period: number;
  /** Portfolio simple return this period. */
  portfolioReturn: number;
  /** Benchmark simple return this period. */
  benchmarkReturn: number;
  /** Active (excess) return this period: portfolio − benchmark. */
  activeReturn: number;
  /** Portfolio cumulative growth multiple from 1 (e.g. 1.08 = +8% to date). */
  portfolioGrowth: number;
  /** Benchmark cumulative growth multiple from 1. */
  benchmarkGrowth: number;
  /** Cumulative excess: portfolioGrowth − benchmarkGrowth (in growth points). */
  cumulativeExcess: number;
}

/** The full benchmark view passed to the page. */
export interface BenchmarkView {
  /** Id of the benchmark being measured against. */
  benchmarkId: string;
  /** Human-readable benchmark label. */
  benchmarkLabel: string;
  /** Rebalancing convention used to blend the benchmark. */
  mode: RebalanceMode;
  /** Headline relative-performance summary. */
  performance: RelativePerformance;
  /** Per-period rows (returns, active return, growth curves). */
  rows: PeriodRow[];
}

export interface BuildBenchmarkViewInput {
  /** Portfolio periodic simple returns. */
  portfolio: readonly number[];
  /** The benchmark to measure against (single index or blended policy). */
  benchmark: PolicyBenchmark;
  /** Periods per year for annualizing tracking error / information ratio. */
  periodsPerYear?: number;
  /** Per-period risk-free rate used by alpha. Default 0. */
  riskFreeRate?: number;
  /** Rebalancing convention for blending the benchmark. Default "periodic". */
  mode?: RebalanceMode;
}

/**
 * Build the {@link BenchmarkView} from a portfolio series and a benchmark.
 *
 * The benchmark's component index returns are blended into a single series via
 * {@link blendPolicyReturns}, then compared to the portfolio with the full
 * relative-performance suite. Throws (via the underlying validators) if the
 * series are misaligned, empty, or contain non-finite values.
 */
export function buildBenchmarkView({
  portfolio,
  benchmark,
  periodsPerYear = 1,
  riskFreeRate = 0,
  mode = "periodic",
}: BuildBenchmarkViewInput): BenchmarkView {
  const benchReturns = blendPolicyReturns(benchmark, { mode });
  const performance = relativePerformance(portfolio, benchReturns, {
    periodsPerYear,
    riskFreeRate,
  });
  const active = excessReturns(portfolio, benchReturns);

  const rows: PeriodRow[] = [];
  let pGrowth = 1;
  let bGrowth = 1;
  for (let i = 0; i < portfolio.length; i++) {
    pGrowth *= 1 + portfolio[i];
    bGrowth *= 1 + benchReturns[i];
    rows.push({
      period: i + 1,
      portfolioReturn: portfolio[i],
      benchmarkReturn: benchReturns[i],
      activeReturn: active[i],
      portfolioGrowth: pGrowth,
      benchmarkGrowth: bGrowth,
      cumulativeExcess: pGrowth - bGrowth,
    });
  }

  return {
    benchmarkId: benchmark.id,
    benchmarkLabel: benchmark.label,
    mode,
    performance,
    rows,
  };
}
