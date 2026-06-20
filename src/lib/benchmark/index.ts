/**
 * Benchmark + relative-performance engine for a read-only family office OS.
 *
 *  - {@link blendBenchmark} — build a static weighted-policy benchmark return
 *    series from several asset-class index series (exact {@link Decimal} math).
 *  - {@link cumulativeGrowth} / {@link totalReturn} / {@link growthCurve} —
 *    compound a return series into a growth multiple / total return / equity
 *    curve.
 *  - Relative performance vs. a benchmark: {@link excessReturns},
 *    {@link trackingError}, {@link informationRatio}, {@link beta},
 *    {@link alpha}, {@link correlation} and the bundled
 *    {@link relativePerformance}.
 *
 * Returns are decimal simple returns (`0.01` = +1%). Nothing here moves money or
 * places trades — it only measures a portfolio against an index.
 */
export {
  blendBenchmark,
  cumulativeGrowth,
  totalReturn,
  growthCurve,
  BenchmarkError,
  type IndexSeries,
  type BlendConstituent,
} from "./benchmark";
export {
  excessReturns,
  meanExcessReturn,
  trackingError,
  informationRatio,
  beta,
  alpha,
  correlation,
  relativePerformance,
  RelativePerformanceError,
  type RelativePerformance,
} from "./relative";
export {
  buildBenchmarkView,
  type BenchmarkView,
  type BenchmarkViewInput,
} from "./view";
export {
  PERIODS_PER_YEAR,
  BROAD_EQUITY,
  BOND_INDEX,
  CASH_INDEX,
  REAL_ASSETS_INDEX,
  CREDIT_INDEX,
  SIXTY_FORTY,
  POLICY_CONSTITUENTS,
  POLICY_BENCHMARK,
  FAMILY_PORTFOLIO,
  BENCHMARK_CHOICES,
  type BenchmarkChoice,
} from "./fixtures";
