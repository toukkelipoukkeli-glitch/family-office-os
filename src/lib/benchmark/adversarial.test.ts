import { describe, expect, it } from "vitest";

import {
  blendBenchmark,
  cumulativeGrowth,
  growthCurve,
  totalReturn,
  BenchmarkError,
  excessReturns,
  trackingError,
  informationRatio,
  beta,
  alpha,
  correlation,
  relativePerformance,
  RelativePerformanceError,
  buildBenchmarkView,
} from "./index";

/**
 * Adversarial edge-case tests (independent tester). These probe boundaries the
 * happy-path suite does not: numerically pathological inputs, sign conventions,
 * annualization consistency between the bundle and its parts, and guard rails.
 */

const PRECISION = 12;

describe("blendBenchmark — adversarial", () => {
  it("accepts a single 100%-weight constituent (identity blend)", () => {
    const blended = blendBenchmark([
      { id: "solo", label: "Solo", weight: 1, returns: [0.02, -0.03, 0.01] },
    ]);
    expect(blended).toEqual([0.02, -0.03, 0.01]);
  });

  it("tolerates weights that sum to 1 only within the 1e-9 epsilon", () => {
    // 0.3333333333 * 3 = 0.9999999999, within tolerance.
    const blended = blendBenchmark([
      { id: "a", label: "A", weight: 0.3333333333, returns: [0.1] },
      { id: "b", label: "B", weight: 0.3333333333, returns: [0.1] },
      { id: "c", label: "C", weight: 0.3333333334, returns: [0.1] },
    ]);
    expect(blended[0]).toBeCloseTo(0.1, PRECISION);
  });

  it("rejects a weight sum that drifts beyond the epsilon", () => {
    expect(() =>
      blendBenchmark([
        { id: "a", label: "A", weight: 0.5, returns: [0.1] },
        { id: "b", label: "B", weight: 0.5000001, returns: [0.1] },
      ]),
    ).toThrow(/sum to 1/);
  });

  it("rejects negative and infinite weights distinctly from zero", () => {
    expect(() =>
      blendBenchmark([
        { id: "a", label: "A", weight: 1.5, returns: [0.1] },
        { id: "b", label: "B", weight: -0.5, returns: [0.1] },
      ]),
    ).toThrow(BenchmarkError);
    expect(() =>
      blendBenchmark([
        { id: "a", label: "A", weight: Number.POSITIVE_INFINITY, returns: [0.1] },
      ]),
    ).toThrow(BenchmarkError);
  });

  it("rejects an Infinity return value", () => {
    expect(() =>
      blendBenchmark([
        { id: "a", label: "A", weight: 1, returns: [Number.POSITIVE_INFINITY] },
      ]),
    ).toThrow(/finite/);
  });
});

describe("growth math — adversarial", () => {
  it("a -100% period zeroes the curve and total return is -100%", () => {
    expect(cumulativeGrowth([0.1, -1, 0.5])).toBe(0);
    expect(totalReturn([0.1, -1, 0.5])).toBe(-1);
    const curve = growthCurve([0.1, -1, 0.5]);
    expect(curve[2]).toBe(0);
    expect(curve[3]).toBe(0);
  });

  it("growth curve handles a return below -100% (wipeout-plus) without NaN", () => {
    // Pathological but must stay finite: 1 + (-1.5) = -0.5 growth factor.
    const curve = growthCurve([-1.5]);
    expect(curve[1]).toBeCloseTo(-0.5, PRECISION);
    expect(Number.isFinite(curve[1])).toBe(true);
  });

  it("rejects an empty series", () => {
    expect(() => cumulativeGrowth([])).toThrow(BenchmarkError);
    expect(() => growthCurve([])).toThrow(BenchmarkError);
  });
});

describe("relative metrics — adversarial", () => {
  it("beta is negative for an inverse portfolio", () => {
    const b = [0.05, -0.02, 0.03, 0.01];
    const p = b.map((x) => -x);
    expect(beta(p, b)).toBeCloseTo(-1, PRECISION);
    expect(correlation(p, b)).toBeCloseTo(-1, PRECISION);
  });

  it("correlation never escapes [-1, 1] on a noisy series", () => {
    const p = [0.031, -0.012, 0.044, 0.009, -0.027, 0.038];
    const b = [0.018, 0.004, 0.021, -0.006, 0.013, 0.0];
    const r = correlation(p, b);
    expect(r).toBeGreaterThanOrEqual(-1);
    expect(r).toBeLessThanOrEqual(1);
  });

  it("information ratio carries the sign of mean active return", () => {
    // Portfolio that consistently lags → negative IR.
    const p = [0.01, 0.0, 0.02, -0.01];
    const b = [0.03, 0.02, 0.03, 0.01];
    expect(informationRatio(p, b)).toBeLessThan(0);
  });

  it("tracking error is invariant to a common shift in both series", () => {
    const p = [0.05, 0.02, -0.01, 0.04];
    const b = [0.03, 0.03, 0.0, 0.02];
    const shift = 0.5;
    const te = trackingError(p, b);
    const teShifted = trackingError(
      p.map((x) => x + shift),
      b.map((x) => x + shift),
    );
    expect(teShifted).toBeCloseTo(te, PRECISION);
  });

  it("alpha against a zero-mean benchmark equals the portfolio mean", () => {
    const b = [0.05, -0.05, 0.05, -0.05]; // mean 0, non-zero variance
    const p = [0.06, -0.03, 0.04, -0.02];
    const mp = p.reduce((a, x) => a + x, 0) / p.length;
    expect(alpha(p, b)).toBeCloseTo(mp, PRECISION);
  });

  it("all metric functions reject misaligned series lengths", () => {
    const short = [0.01, 0.02];
    const long = [0.01, 0.02, 0.03];
    for (const fn of [trackingError, informationRatio, beta, correlation]) {
      expect(() => fn(short, long)).toThrow(RelativePerformanceError);
    }
    expect(() => excessReturns(short, long)).toThrow(RelativePerformanceError);
    expect(() => relativePerformance(short, long)).toThrow(
      RelativePerformanceError,
    );
  });

  it("two-period series is the minimum for the bundle; one period is rejected", () => {
    expect(() => relativePerformance([0.01], [0.02])).toThrow(
      RelativePerformanceError,
    );
    const rp = relativePerformance([0.05, 0.01], [0.03, 0.02]);
    expect(rp.excess).toHaveLength(2);
  });
});

describe("relativePerformance bundle — annualization consistency", () => {
  it("tracking error annualizes by sqrt while alpha annualizes linearly", () => {
    const p = [0.05, 0.02, -0.01, 0.04, 0.03, -0.02];
    const b = [0.03, 0.03, 0.0, 0.02, 0.025, -0.01];
    const perPeriod = relativePerformance(p, b, { periodsPerYear: 1 });
    const annual = relativePerformance(p, b, { periodsPerYear: 12 });

    expect(annual.trackingError).toBeCloseTo(
      perPeriod.trackingError * Math.sqrt(12),
      PRECISION,
    );
    expect(annual.informationRatio).toBeCloseTo(
      perPeriod.informationRatio * Math.sqrt(12),
      PRECISION,
    );
    expect(annual.alpha).toBeCloseTo(perPeriod.alpha * 12, PRECISION);
    // beta, correlation and total returns are periodicity-invariant.
    expect(annual.beta).toBeCloseTo(perPeriod.beta, PRECISION);
    expect(annual.correlation).toBeCloseTo(perPeriod.correlation, PRECISION);
    expect(annual.portfolioTotalReturn).toBeCloseTo(
      perPeriod.portfolioTotalReturn,
      PRECISION,
    );
  });

  it("rejects a non-finite periodsPerYear", () => {
    expect(() =>
      relativePerformance([0.01, 0.02], [0.01, 0.03], {
        periodsPerYear: Number.NaN,
      }),
    ).toThrow(RelativePerformanceError);
  });
});

describe("buildBenchmarkView — adversarial", () => {
  it("per-period returns reconstructed from the curve match the raw inputs", () => {
    const portfolio = [0.031, -0.012, 0.044, 0.009];
    const benchmark = [0.018, 0.004, 0.021, -0.006];
    const view = buildBenchmarkView({
      portfolioLabel: "P",
      benchmarkLabel: "B",
      portfolio,
      benchmark,
      periodsPerYear: 12,
    });
    // The page derives each row's period return as curve[i+1]/curve[i] - 1;
    // that must reconcile to the raw return series within float tolerance.
    for (let i = 0; i < portfolio.length; i++) {
      const derived =
        view.portfolioCurve[i + 1] / view.portfolioCurve[i] - 1;
      expect(derived).toBeCloseTo(portfolio[i], PRECISION);
    }
    expect(view.excess).toEqual(excessReturns(portfolio, benchmark));
  });
});
