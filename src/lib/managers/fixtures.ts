/**
 * Deterministic, offline fixtures for the manager / fund due-diligence
 * scorecard.
 *
 * Four external managers a family office is evaluating, each with 24 months of
 * stylised **gross** monthly returns, a fee schedule, AUM, vintage and an
 * aligned benchmark series. The numbers are hand-chosen so the four occupy
 * clearly different corners of the scorecard:
 *
 *  - **Meridian Global Equity** — strong gross alpha, reasonable 1.5/15 fees;
 *    the standout that still beats its benchmark net of fees.
 *  - **Halcyon Macro** — moderate returns but rich 2/20 fees over a high
 *    hurdle, so fee drag eats most of the edge.
 *  - **Cypress Credit** — steady, low-vol credit with low fees; modest but
 *    consistent net excess.
 *  - **Aurora Ventures** — high gross but very high 2/20 fees and lumpy returns
 *    that trail the benchmark net of fees — the cautionary tale.
 *
 * Nothing here hits a live API; these are static fixtures used by the engine
 * tests (oracle) and the charted view.
 */

import type { Manager } from "./scorecard";

/** Months of observations in every fixture series. */
export const MONTHS = 24;

/** Monthly observations: annualize per-period stats by sqrt(12). */
export const PERIODS_PER_YEAR = 12;

// A shared developed-equity benchmark (monthly, 24m). Used by the equity-like
// managers; the credit manager has its own lower-vol benchmark below.
const EQUITY_BENCHMARK: readonly number[] = [
  0.021, -0.014, 0.018, 0.009, -0.02, 0.031, 0.006, -0.009, 0.016, 0.012,
  -0.006, 0.022, 0.018, -0.011, 0.02, 0.007, -0.016, 0.027, 0.005, -0.008,
  0.014, 0.011, -0.004, 0.019,
];

const CREDIT_BENCHMARK: readonly number[] = [
  0.005, 0.004, -0.002, 0.006, 0.003, -0.003, 0.005, 0.006, -0.001, 0.004,
  0.005, 0.003, 0.005, 0.004, -0.002, 0.006, 0.003, -0.003, 0.005, 0.006,
  -0.001, 0.004, 0.005, 0.003,
];

/** The four managers under due diligence. */
export const MANAGERS: readonly Manager[] = [
  {
    id: "meridian-global-equity",
    name: "Meridian Global Equity",
    strategy: "Long-only global equity",
    vintage: 2019,
    aum: 1_850_000_000,
    fees: { managementFee: 0.015, fundExpenses: 0.002, carry: 0.15, hurdle: 0.06 },
    grossReturns: [
      0.034, -0.011, 0.027, 0.016, -0.018, 0.041, 0.012, -0.006, 0.025, 0.02,
      -0.003, 0.033, 0.029, -0.008, 0.031, 0.014, -0.013, 0.038, 0.011, -0.005,
      0.024, 0.018, -0.002, 0.03,
    ],
    benchmarkReturns: EQUITY_BENCHMARK,
  },
  {
    id: "halcyon-macro",
    name: "Halcyon Macro",
    strategy: "Global macro",
    vintage: 2017,
    aum: 920_000_000,
    fees: { managementFee: 0.02, fundExpenses: 0.004, carry: 0.2, hurdle: 0.08 },
    grossReturns: [
      0.026, -0.009, 0.019, 0.012, -0.014, 0.03, 0.008, -0.004, 0.018, 0.015,
      -0.005, 0.024, 0.022, -0.007, 0.021, 0.011, -0.012, 0.028, 0.007, -0.006,
      0.017, 0.013, -0.003, 0.02,
    ],
    benchmarkReturns: EQUITY_BENCHMARK,
  },
  {
    id: "cypress-credit",
    name: "Cypress Credit",
    strategy: "Investment-grade credit",
    vintage: 2020,
    aum: 640_000_000,
    fees: { managementFee: 0.0075, fundExpenses: 0.0015, carry: 0.1, hurdle: 0.04 },
    grossReturns: [
      0.008, 0.006, -0.001, 0.009, 0.005, -0.002, 0.008, 0.009, 0.001, 0.007,
      0.008, 0.005, 0.008, 0.006, -0.001, 0.009, 0.005, -0.002, 0.008, 0.009,
      0.001, 0.007, 0.008, 0.005,
    ],
    benchmarkReturns: CREDIT_BENCHMARK,
  },
  {
    id: "aurora-ventures",
    name: "Aurora Ventures",
    strategy: "Concentrated growth equity",
    vintage: 2018,
    aum: 410_000_000,
    fees: { managementFee: 0.02, fundExpenses: 0.005, carry: 0.2, hurdle: 0.08 },
    grossReturns: [
      0.045, -0.038, 0.012, 0.034, -0.041, 0.052, -0.006, -0.028, 0.039, 0.008,
      -0.022, 0.029, 0.041, -0.035, 0.018, 0.026, -0.044, 0.048, -0.011, -0.024,
      0.033, 0.005, -0.019, 0.027,
    ],
    benchmarkReturns: EQUITY_BENCHMARK,
  },
];
