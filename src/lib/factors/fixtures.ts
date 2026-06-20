import { Decimal } from "decimal.js";

import {
  FACTOR_KEYS,
  type FactorKey,
  type FactorObservation,
  type FactorRegressionInput,
} from "./factors";

/**
 * Deterministic, offline fixtures for factor & style decomposition.
 *
 * Two kinds of fixture live here:
 *
 *  1. {@link SYNTHETIC_FACTOR_FIXTURE} — a *constructed* series where the true
 *     betas, alpha and factor paths are known exactly. The portfolio return for
 *     each period is built as `α + Σ βⱼ·fⱼ` with **no noise**, so the OLS
 *     engine must recover the planted betas to high precision. This is the
 *     oracle for the regression maths.
 *
 *  2. {@link FAMILY_OFFICE_FACTOR_FIXTURE} — a stylised 24-month family-office
 *     book regressed onto the six factors, with a small deterministic residual
 *     so R² is realistic (<1) rather than a perfect fit. Drives the page.
 *
 * Both factor series are generated with a tiny deterministic LCG so they are
 * reproducible and require no live data.
 */

/** The known-true betas the synthetic oracle must recover. */
export const SYNTHETIC_TRUE_BETAS: Record<FactorKey, number> = {
  market: 0.95,
  size: 0.3,
  value: -0.2,
  "rate-duration": -0.45,
  credit: 0.6,
  fx: 0.15,
};

/** The known-true intercept (monthly alpha) of the synthetic series. */
export const SYNTHETIC_TRUE_ALPHA = 0.001; // +10 bps/month

/**
 * A small linear-congruential generator → deterministic pseudo-random factor
 * returns in roughly [-amplitude, +amplitude]. Seeded per factor so the six
 * series are distinct but reproducible across runs and machines.
 */
function lcgSeries(seed: number, length: number, amplitude: number): number[] {
  let state = seed >>> 0;
  const out: number[] = [];
  for (let i = 0; i < length; i++) {
    // Numerical Recipes LCG constants.
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const unit = state / 0xffffffff; // [0, 1]
    out.push((unit * 2 - 1) * amplitude);
  }
  return out;
}

const SYNTHETIC_PERIODS = 36;

// Distinct seed + amplitude per factor so columns are not collinear.
const FACTOR_SEEDS: Record<FactorKey, { seed: number; amp: number }> = {
  market: { seed: 11, amp: 0.05 },
  size: { seed: 23, amp: 0.03 },
  value: { seed: 37, amp: 0.025 },
  "rate-duration": { seed: 41, amp: 0.02 },
  credit: { seed: 53, amp: 0.015 },
  fx: { seed: 67, amp: 0.02 },
};

function buildFactorRows(periods: number): FactorObservation[] {
  const columns: Record<FactorKey, number[]> = {} as Record<
    FactorKey,
    number[]
  >;
  for (const key of FACTOR_KEYS) {
    const { seed, amp } = FACTOR_SEEDS[key];
    columns[key] = lcgSeries(seed, periods, amp);
  }
  const rows: FactorObservation[] = [];
  for (let i = 0; i < periods; i++) {
    const row = {} as Record<FactorKey, Decimal.Value>;
    for (const key of FACTOR_KEYS) {
      row[key] = columns[key][i];
    }
    rows.push(row);
  }
  return rows;
}

const SYNTHETIC_FACTOR_ROWS = buildFactorRows(SYNTHETIC_PERIODS);

/**
 * Portfolio return = α + Σ βⱼ·fⱼ, computed exactly in {@link Decimal} so the
 * oracle has no rounding slack. With zero residual the regression must recover
 * the planted betas and alpha and report R² = 1.
 */
const SYNTHETIC_PORTFOLIO_RETURNS: Decimal.Value[] = SYNTHETIC_FACTOR_ROWS.map(
  (row) => {
    let r = new Decimal(SYNTHETIC_TRUE_ALPHA);
    for (const key of FACTOR_KEYS) {
      r = r.plus(new Decimal(SYNTHETIC_TRUE_BETAS[key]).times(row[key]));
    }
    return r.toString();
  },
);

export const SYNTHETIC_FACTOR_FIXTURE: FactorRegressionInput = {
  portfolioExcessReturns: SYNTHETIC_PORTFOLIO_RETURNS,
  factors: SYNTHETIC_FACTOR_ROWS,
  fitIntercept: true,
};

// ---------------------------------------------------------------------------
// Realistic family-office fixture (24 months, factors + a small residual).
// ---------------------------------------------------------------------------

const FO_PERIODS = 24;

/** Plausible betas for a diversified, equity-tilted family-office book. */
export const FAMILY_OFFICE_TRUE_BETAS: Record<FactorKey, number> = {
  market: 0.72,
  size: 0.18,
  value: 0.1,
  "rate-duration": 0.25,
  credit: 0.35,
  fx: -0.08,
};

export const FAMILY_OFFICE_ALPHA = 0.0008; // +8 bps/month skill

const FO_FACTOR_ROWS = buildFactorRows(FO_PERIODS);

// A small deterministic idiosyncratic residual so the fit is realistic (R²<1)
// without being noise-dominated.
const FO_RESIDUALS = lcgSeries(907, FO_PERIODS, 0.0025);

const FO_PORTFOLIO_RETURNS: Decimal.Value[] = FO_FACTOR_ROWS.map((row, i) => {
  let r = new Decimal(FAMILY_OFFICE_ALPHA);
  for (const key of FACTOR_KEYS) {
    r = r.plus(new Decimal(FAMILY_OFFICE_TRUE_BETAS[key]).times(row[key]));
  }
  r = r.plus(FO_RESIDUALS[i]);
  return r.toString();
});

export const FAMILY_OFFICE_FACTOR_FIXTURE: FactorRegressionInput = {
  portfolioExcessReturns: FO_PORTFOLIO_RETURNS,
  factors: FO_FACTOR_ROWS,
  fitIntercept: true,
};
