import { blendBenchmark, type IndexSeries } from "./benchmark";

/**
 * Deterministic, offline benchmark fixtures for a stylised family-office book.
 *
 * Twelve monthly periods (one calendar year) of simple returns for a handful of
 * asset-class indices, plus three benchmarks built from them:
 *
 *  - {@link BROAD_EQUITY}    — a broad world-equity index
 *  - {@link BOND_INDEX}      — an aggregate investment-grade bond index
 *  - {@link SIXTY_FORTY}     — the classic 60% equity / 40% bond blend
 *  - {@link POLICY_BENCHMARK}— a bespoke five-sleeve strategic policy benchmark
 *
 * and the family portfolio's own monthly return series
 * ({@link FAMILY_PORTFOLIO}) to measure against them. Values are hand-chosen so
 * excess return, tracking error, information ratio and beta are all non-trivial.
 * Monthly data → annualize with `periodsPerYear: 12`.
 */

export const PERIODS_PER_YEAR = 12;

/** Broad world-equity index — the growth engine, higher volatility. */
export const BROAD_EQUITY: IndexSeries = {
  id: "broad-equity",
  label: "Broad equity",
  returns: [
    0.032, -0.018, 0.041, 0.012, -0.025, 0.038, 0.021, -0.011, 0.029, 0.005,
    -0.014, 0.026,
  ],
};

/** Aggregate investment-grade bond index — the ballast, lower volatility. */
export const BOND_INDEX: IndexSeries = {
  id: "bond-index",
  label: "Aggregate bonds",
  returns: [
    0.004, 0.008, -0.003, 0.006, 0.011, -0.002, 0.005, 0.009, -0.001, 0.007,
    0.012, 0.003,
  ],
};

/** Cash / short-term index — a low-return sleeve for the policy benchmark. */
export const CASH_INDEX: IndexSeries = {
  id: "cash-index",
  label: "Cash & equivalents",
  returns: [
    0.003, 0.003, 0.003, 0.0035, 0.0035, 0.0035, 0.004, 0.004, 0.004, 0.0045,
    0.0045, 0.0045,
  ],
};

/** Real-assets index (e.g. listed real estate / infrastructure). */
export const REAL_ASSETS_INDEX: IndexSeries = {
  id: "real-assets-index",
  label: "Real assets",
  returns: [
    0.018, -0.006, 0.022, 0.009, -0.013, 0.017, 0.011, 0.004, 0.015, -0.008,
    0.006, 0.013,
  ],
};

/** A diversified-credit / EM-debt sleeve, between bonds and equity in risk. */
export const CREDIT_INDEX: IndexSeries = {
  id: "credit-index",
  label: "Diversified credit",
  returns: [
    0.012, 0.001, 0.014, 0.007, -0.009, 0.013, 0.008, -0.002, 0.011, 0.003,
    -0.004, 0.01,
  ],
};

/**
 * The classic 60/40: 60% broad equity, 40% aggregate bonds, rebalanced each
 * period. Built from the index series so its construction is testable.
 */
export const SIXTY_FORTY: number[] = blendBenchmark([
  { ...BROAD_EQUITY, weight: 0.6 },
  { ...BOND_INDEX, weight: 0.4 },
]);

/**
 * The constituent weighting of the bespoke strategic-policy benchmark — the
 * actual long-run target mix this family's IPS specifies. Exported so the view
 * can show the policy weights alongside the blended series.
 */
export const POLICY_CONSTITUENTS = [
  { ...BROAD_EQUITY, weight: 0.45 },
  { ...BOND_INDEX, weight: 0.25 },
  { ...CREDIT_INDEX, weight: 0.1 },
  { ...REAL_ASSETS_INDEX, weight: 0.15 },
  { ...CASH_INDEX, weight: 0.05 },
] as const;

/**
 * The custom blended policy benchmark: a five-sleeve strategic mix
 * (45% equity / 25% bonds / 10% credit / 15% real assets / 5% cash) rebalanced
 * each period. This is the primary yardstick the family measures itself against.
 */
export const POLICY_BENCHMARK: number[] = blendBenchmark([...POLICY_CONSTITUENTS]);

/**
 * The family portfolio's own monthly return series over the same window. It
 * leans slightly more into equity and real assets than the policy, so it has a
 * modest positive excess return with non-zero tracking error and a beta a touch
 * above 1 to the policy benchmark.
 */
export const FAMILY_PORTFOLIO: IndexSeries = {
  id: "family-portfolio",
  label: "Family portfolio",
  returns: [
    0.026, -0.012, 0.035, 0.014, -0.019, 0.033, 0.019, -0.006, 0.027, 0.002,
    -0.009, 0.024,
  ],
};

/** A named benchmark choice the UI can switch between. */
export interface BenchmarkChoice {
  id: string;
  label: string;
  hint: string;
  returns: number[];
}

/** The selectable benchmarks for the relative-performance view. */
export const BENCHMARK_CHOICES: BenchmarkChoice[] = [
  {
    id: "policy",
    label: "Policy benchmark",
    hint: "bespoke 45/25/10/15/5 strategic mix",
    returns: POLICY_BENCHMARK,
  },
  {
    id: "sixty-forty",
    label: "60/40",
    hint: "60% equity / 40% bonds",
    returns: SIXTY_FORTY,
  },
  {
    id: "equity",
    label: "Broad equity",
    hint: "world-equity index",
    returns: [...BROAD_EQUITY.returns],
  },
  {
    id: "bonds",
    label: "Aggregate bonds",
    hint: "investment-grade bond index",
    returns: [...BOND_INDEX.returns],
  },
];
