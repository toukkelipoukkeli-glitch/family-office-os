import type { PolicyBenchmark } from "./policy";

/**
 * Deterministic, offline fixtures for benchmark + relative performance.
 *
 * Twelve months (one calendar year) of stylised monthly simple returns for a
 * family-office book and the index series it is benchmarked against. The
 * numbers are hand-chosen so every relative metric is non-trivial and signed:
 * the portfolio beats its 60/40 policy on a total-return basis, runs a modest
 * tracking error, a positive information ratio, and an equity-tilted beta well
 * above one (≈1.70) against the blended policy benchmark.
 *
 * Nothing here hits a live API; these are static fixtures used by the engine
 * tests (oracle) and the charted view.
 */

/** Number of monthly observations in every fixture series. */
export const MONTHS = 12;

/** Months are observed; annualize per-period stats by sqrt(12). */
export const PERIODS_PER_YEAR = 12;

/** Broad-equity index: a developed-markets total-return proxy (monthly). */
export const BROAD_EQUITY_RETURNS: readonly number[] = [
  0.031, -0.018, 0.025, 0.014, -0.027, 0.041, 0.009, -0.012, 0.022, 0.017,
  -0.008, 0.029,
];

/** Aggregate-bond index: an investment-grade aggregate proxy (monthly). */
export const BROAD_BOND_RETURNS: readonly number[] = [
  0.004, 0.006, -0.003, 0.008, 0.002, -0.005, 0.007, 0.009, -0.002, 0.005,
  0.006, 0.003,
];

/** Cash / short-term proxy: a steady, low-volatility sleeve (monthly). */
export const CASH_RETURNS: readonly number[] = [
  0.0035, 0.0035, 0.0034, 0.0035, 0.0036, 0.0035, 0.0034, 0.0035, 0.0035,
  0.0034, 0.0035, 0.0035,
];

/**
 * The family's actual portfolio return series (monthly). Tilted toward equity
 * with some active selection, so it beats the policy mix overall while running
 * a real tracking error against it.
 */
export const PORTFOLIO_RETURNS: readonly number[] = [
  0.029, -0.012, 0.028, 0.011, -0.021, 0.038, 0.013, -0.007, 0.024, 0.019,
  -0.004, 0.031,
];

/**
 * The classic **60/40** benchmark: 60% broad equity, 40% aggregate bonds,
 * rebalanced each period. The most common single yardstick for a balanced book.
 */
export const BENCHMARK_60_40: PolicyBenchmark = {
  id: "balanced-60-40",
  label: "Balanced 60/40",
  components: [
    {
      id: "broad-equity",
      label: "Broad equity",
      weight: 0.6,
      returns: BROAD_EQUITY_RETURNS,
    },
    {
      id: "broad-bond",
      label: "Aggregate bond",
      weight: 0.4,
      returns: BROAD_BOND_RETURNS,
    },
  ],
};

/**
 * A **custom blended policy benchmark** that matches this family's strategic
 * asset allocation: 55% broad equity, 35% aggregate bonds, 10% cash. Built from
 * the underlying asset-class index returns and weighted to the policy.
 */
export const POLICY_BENCHMARK: PolicyBenchmark = {
  id: "family-policy-55-35-10",
  label: "Family policy (55/35/10)",
  components: [
    {
      id: "broad-equity",
      label: "Broad equity",
      weight: 0.55,
      returns: BROAD_EQUITY_RETURNS,
    },
    {
      id: "broad-bond",
      label: "Aggregate bond",
      weight: 0.35,
      returns: BROAD_BOND_RETURNS,
    },
    {
      id: "cash",
      label: "Cash",
      weight: 0.1,
      returns: CASH_RETURNS,
    },
  ],
};

/** All selectable benchmarks, keyed by id, for the view layer. */
export const BENCHMARKS: readonly PolicyBenchmark[] = [
  POLICY_BENCHMARK,
  BENCHMARK_60_40,
  {
    id: "broad-equity-only",
    label: "Broad equity (100%)",
    components: [
      {
        id: "broad-equity",
        label: "Broad equity",
        weight: 1,
        returns: BROAD_EQUITY_RETURNS,
      },
    ],
  },
  {
    id: "broad-bond-only",
    label: "Aggregate bond (100%)",
    components: [
      {
        id: "broad-bond",
        label: "Aggregate bond",
        weight: 1,
        returns: BROAD_BOND_RETURNS,
      },
    ],
  },
];
