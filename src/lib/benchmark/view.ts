import { growthCurve } from "./benchmark";
import {
  relativePerformance,
  type RelativePerformance,
} from "./relative";

/**
 * Presentation view-model for the benchmark / relative-performance page.
 *
 * Bundles the relative-performance metrics with the indexed growth curves of
 * the portfolio and benchmark (both starting at 1.0) and the per-period excess
 * series, so the page can chart cumulative outperformance and a tracking-error
 * bar strip without recomputing anything. Pure and deterministic.
 */

export interface BenchmarkView {
  portfolioLabel: string;
  benchmarkLabel: string;
  periodsPerYear: number;
  metrics: RelativePerformance;
  /** Indexed growth curve of the portfolio (length = periods + 1, starts 1). */
  portfolioCurve: number[];
  /** Indexed growth curve of the benchmark (length = periods + 1, starts 1). */
  benchmarkCurve: number[];
  /** Per-period active return (portfolio − benchmark). */
  excess: number[];
}

export interface BenchmarkViewInput {
  portfolioLabel: string;
  benchmarkLabel: string;
  portfolio: readonly number[];
  benchmark: readonly number[];
  periodsPerYear?: number;
}

/** Build the view-model from a portfolio and benchmark return series. */
export function buildBenchmarkView({
  portfolioLabel,
  benchmarkLabel,
  portfolio,
  benchmark,
  periodsPerYear = 1,
}: BenchmarkViewInput): BenchmarkView {
  const metrics = relativePerformance(portfolio, benchmark, { periodsPerYear });
  return {
    portfolioLabel,
    benchmarkLabel,
    periodsPerYear,
    metrics,
    portfolioCurve: growthCurve(portfolio),
    benchmarkCurve: growthCurve(benchmark),
    excess: metrics.excess,
  };
}
