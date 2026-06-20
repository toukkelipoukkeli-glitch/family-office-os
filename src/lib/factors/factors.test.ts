import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import {
  FACTOR_KEYS,
  FactorRegressionError,
  regressFactors,
  type FactorObservation,
  type FactorRegressionInput,
} from "./factors";
import {
  SYNTHETIC_FACTOR_FIXTURE,
  SYNTHETIC_TRUE_ALPHA,
  SYNTHETIC_TRUE_BETAS,
  FAMILY_OFFICE_FACTOR_FIXTURE,
  FAMILY_OFFICE_TRUE_BETAS,
} from "./fixtures";

/** Build a zero-noise input from explicit betas + factor rows (oracle helper). */
function syntheticFrom(
  betas: Record<string, number>,
  alpha: number,
  rows: FactorObservation[],
): FactorRegressionInput {
  const y = rows.map((row) => {
    let r = new Decimal(alpha);
    for (const key of FACTOR_KEYS) {
      r = r.plus(new Decimal(betas[key]).times(row[key]));
    }
    return r.toString();
  });
  return { portfolioExcessReturns: y, factors: rows, fitIntercept: true };
}

describe("regressFactors — oracle on known betas", () => {
  it("recovers planted betas and alpha from a zero-noise synthetic series", () => {
    const r = regressFactors(SYNTHETIC_FACTOR_FIXTURE);

    for (const loading of r.loadings) {
      expect(loading.beta.toNumber()).toBeCloseTo(
        SYNTHETIC_TRUE_BETAS[loading.key],
        9,
      );
    }
    expect(r.alpha.toNumber()).toBeCloseTo(SYNTHETIC_TRUE_ALPHA, 9);
  });

  it("reports R² = 1 for a perfect (noise-free) fit", () => {
    const r = regressFactors(SYNTHETIC_FACTOR_FIXTURE);
    expect(r.rSquared.toNumber()).toBeCloseTo(1, 9);
    expect(r.adjustedRSquared.toNumber()).toBeCloseTo(1, 8);
    expect(r.residualStdError.toNumber()).toBeCloseTo(0, 9);
  });

  it("contributions sum with alpha to the mean portfolio return", () => {
    const r = regressFactors(SYNTHETIC_FACTOR_FIXTURE);
    const explained = r.alpha.plus(r.totalFactorContribution);
    expect(explained.toNumber()).toBeCloseTo(
      r.meanPortfolioReturn.toNumber(),
      9,
    );
  });

  it("each contribution equals beta × mean factor return", () => {
    const r = regressFactors(SYNTHETIC_FACTOR_FIXTURE);
    for (const l of r.loadings) {
      expect(l.contribution.toNumber()).toBeCloseTo(
        l.beta.times(l.meanFactorReturn).toNumber(),
        12,
      );
    }
  });

  it("recovers a different planted beta set", () => {
    const input = syntheticFrom(
      { market: 1.3, size: -0.5, value: 0.4, "rate-duration": 0.1, credit: -0.25, fx: 0.6 },
      -0.0005,
      SYNTHETIC_FACTOR_FIXTURE.factors,
    );
    const r = regressFactors(input);
    expect(r.loadings.find((l) => l.key === "market")!.beta.toNumber()).toBeCloseTo(1.3, 9);
    expect(r.loadings.find((l) => l.key === "size")!.beta.toNumber()).toBeCloseTo(-0.5, 9);
    expect(r.loadings.find((l) => l.key === "fx")!.beta.toNumber()).toBeCloseTo(0.6, 9);
    expect(r.alpha.toNumber()).toBeCloseTo(-0.0005, 9);
  });
});

describe("regressFactors — diagnostics & invariants", () => {
  it("realistic family-office fixture has R² in (0,1) and near-true betas", () => {
    const r = regressFactors(FAMILY_OFFICE_FACTOR_FIXTURE);
    expect(r.rSquared.toNumber()).toBeGreaterThan(0.5);
    expect(r.rSquared.toNumber()).toBeLessThan(1);
    // Small residual ⇒ betas close to (but not exactly) the planted values.
    for (const l of r.loadings) {
      expect(l.beta.toNumber()).toBeCloseTo(FAMILY_OFFICE_TRUE_BETAS[l.key], 1);
    }
    expect(r.observations).toBe(24);
  });

  it("residual standard error is non-negative and finite", () => {
    const r = regressFactors(FAMILY_OFFICE_FACTOR_FIXTURE);
    expect(r.residualStdError.isFinite()).toBe(true);
    expect(r.residualStdError.isNegative()).toBe(false);
  });

  it("fits through the origin when fitIntercept is false", () => {
    const r = regressFactors({
      ...SYNTHETIC_FACTOR_FIXTURE,
      fitIntercept: false,
    });
    expect(r.alpha.isZero()).toBe(true);
    expect(r.fitIntercept).toBe(false);
    // Betas absorb the dropped intercept, so they shift slightly off the true
    // values but the fit is still excellent (alpha was tiny).
    expect(r.rSquared.toNumber()).toBeGreaterThan(0.99);
  });

  it("a pure-market portfolio loads ~1 on market and ~0 elsewhere", () => {
    const rows = SYNTHETIC_FACTOR_FIXTURE.factors;
    const y = rows.map((row) => new Decimal(row.market).toString());
    const r = regressFactors({
      portfolioExcessReturns: y,
      factors: rows,
      fitIntercept: true,
    });
    expect(r.loadings.find((l) => l.key === "market")!.beta.toNumber()).toBeCloseTo(1, 9);
    for (const l of r.loadings) {
      if (l.key !== "market") {
        expect(l.beta.toNumber()).toBeCloseTo(0, 9);
      }
    }
  });
});

describe("regressFactors — input validation", () => {
  it("throws when portfolio and factor lengths mismatch", () => {
    expect(() =>
      regressFactors({
        portfolioExcessReturns: [0.01, 0.02],
        factors: [SYNTHETIC_FACTOR_FIXTURE.factors[0]],
      }),
    ).toThrow(FactorRegressionError);
  });

  it("throws when there are too few observations", () => {
    const rows = SYNTHETIC_FACTOR_FIXTURE.factors.slice(0, 5);
    const y = rows.map(() => 0.01);
    expect(() => regressFactors({ portfolioExcessReturns: y, factors: rows })).toThrow(
      /more observations/,
    );
  });

  it("throws on a non-finite portfolio return", () => {
    const rows = SYNTHETIC_FACTOR_FIXTURE.factors;
    const y = rows.map(() => 0.01);
    y[0] = Number.NaN;
    expect(() => regressFactors({ portfolioExcessReturns: y, factors: rows })).toThrow(
      /finite/,
    );
  });

  it("throws when factors are collinear (singular system)", () => {
    // Two identical factor columns ⇒ XᵀX singular. Build rows where size == market.
    const rows: FactorObservation[] = SYNTHETIC_FACTOR_FIXTURE.factors.map(
      (row) => ({ ...row, size: row.market }),
    );
    const y = rows.map(() => 0.01);
    expect(() => regressFactors({ portfolioExcessReturns: y, factors: rows })).toThrow(
      /singular|collinear/,
    );
  });
});
