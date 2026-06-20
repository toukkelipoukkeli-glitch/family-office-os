import {
  LOOKTHROUGH_ENTITIES,
  LOOKTHROUGH_HOLDINGS,
  LOOKTHROUGH_ROOT_ID,
} from "../lookthrough";

import type { RiskLimitSet } from "./limits";

/**
 * Deterministic, offline fixtures for the risk-limits cockpit (unit
 * m9-risk-limits) — used by the engine test (the oracle) and the cockpit view.
 *
 * The book is the m8 look-through fixture consolidated from the Ravenscroft
 * family trust (total $31.7925M). Its true look-through concentration is:
 *
 *   real_estate     10,880,000  → 34.22%   (semi-liquid)
 *   equity           9,000,000  → 28.31%   (liquid)
 *   fixed_income     4,800,000  → 15.10%   (liquid)
 *   private_equity   4,462,500  → 14.04%   (illiquid)
 *   cash             2,500,000  →  7.86%   (liquid)
 *   crypto             150,000  →  0.47%   (liquid)
 *
 * Liquidity tiers: liquid 51.74%, semi-liquid 34.22%, illiquid 14.04%.
 *
 * {@link sampleRiskLimits} is tuned so the consolidated book breaches some
 * limits and satisfies others:
 *  - Real-estate cap 30%     → BREACHED (34.22%), critical.
 *  - Equity cap 35%          → satisfied (28.31%).
 *  - Private-equity cap 12%  → BREACHED (14.04%), warning.
 *  - Liquidity floor min 60% → BREACHED (liquid 51.74%), warning.
 *  - Illiquid cap max 10%    → BREACHED (illiquid 14.04%), warning.
 *
 * → 1 critical + 3 warning = 4 breaches.
 */

/** The look-through org hierarchy the cockpit reports from. */
export const RISK_ENTITIES = LOOKTHROUGH_ENTITIES;
/** Per-entity direct holdings consolidated by the cockpit. */
export const RISK_HOLDINGS = LOOKTHROUGH_HOLDINGS;
/** Default reporting root (the family trust). */
export const RISK_ROOT_ID = LOOKTHROUGH_ROOT_ID;

/** A realistic default cross-asset risk-limit set for the family office. */
export const sampleRiskLimits: RiskLimitSet = {
  id: "risk-ursin-2026",
  name: "Ursin Family Office risk limits 2026",
  limits: [
    {
      id: "conc-real-estate",
      kind: "concentration",
      label: "Real-estate concentration cap",
      assetClass: "real_estate",
      max: 0.3,
      severity: "critical",
      note: "No more than 30% look-through in real estate.",
    },
    {
      id: "conc-equity",
      kind: "concentration",
      label: "Public-equity concentration cap",
      assetClass: "equity",
      max: 0.35,
      severity: "warning",
    },
    {
      id: "conc-private-equity",
      kind: "concentration",
      label: "Private-equity concentration cap",
      assetClass: "private_equity",
      max: 0.12,
      severity: "warning",
      note: "Cap illiquid venture exposure at 12%.",
    },
    {
      id: "liq-floor-60",
      kind: "liquidityFloor",
      label: "Liquidity floor",
      min: 0.6,
      severity: "warning",
      note: "At least 60% held in the liquid tier.",
    },
    {
      id: "illiquid-cap-10",
      kind: "illiquidCap",
      label: "Illiquid exposure cap",
      max: 0.1,
      severity: "warning",
      note: "No more than 10% locked in illiquid private holdings.",
    },
  ],
};

/**
 * A deterministic 24-period monthly simple-return series for the metrics panel.
 * A realistic mix of up and down months with one drawdown stretch, so the
 * volatility / max-drawdown / Sharpe figures are non-trivial and stable.
 */
export const sampleReturns: readonly number[] = [
  0.021, 0.014, -0.009, 0.032, 0.018, -0.027, 0.011, 0.024, -0.015, 0.008,
  0.019, -0.041, -0.012, 0.029, 0.017, 0.006, -0.022, 0.013, 0.034, 0.009,
  -0.007, 0.026, 0.015, 0.012,
];

/** Periods per year for {@link sampleReturns} (monthly). */
export const sampleReturnsPeriodsPerYear = 12;

/**
 * Per-period risk-free rate used for the Sharpe ratio in the cockpit demo.
 * The risk module subtracts this from the *per-period* mean before annualizing,
 * so it is expressed per period (here, per month). Kept at 0 so the demo Sharpe
 * is the simple annualized return/vol ratio.
 */
export const sampleRiskFreeRate = 0;
