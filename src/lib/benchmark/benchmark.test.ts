import { describe, expect, it } from "vitest";

import {
  blendBenchmark,
  cumulativeGrowth,
  totalReturn,
  growthCurve,
  BenchmarkError,
  excessReturns,
  meanExcessReturn,
  trackingError,
  informationRatio,
  beta,
  alpha,
  correlation,
  relativePerformance,
  RelativePerformanceError,
  buildBenchmarkView,
  BROAD_EQUITY,
  BOND_INDEX,
  SIXTY_FORTY,
  POLICY_BENCHMARK,
  POLICY_CONSTITUENTS,
  FAMILY_PORTFOLIO,
  PERIODS_PER_YEAR,
} from "./index";

const PRECISION = 12;

/** Independent reference implementations used purely as an oracle in tests. */
function refMean(xs: readonly number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function refSampleStd(xs: readonly number[]): number {
  const m = refMean(xs);
  const ss = xs.reduce((a, x) => a + (x - m) ** 2, 0);
  return Math.sqrt(ss / (xs.length - 1));
}
function refCompound(xs: readonly number[]): number {
  return xs.reduce((g, r) => g * (1 + r), 1) - 1;
}

describe("blendBenchmark", () => {
  it("computes a weighted-average return per period", () => {
    const blended = blendBenchmark([
      { id: "a", label: "A", weight: 0.6, returns: [0.1, -0.2, 0.05] },
      { id: "b", label: "B", weight: 0.4, returns: [0.0, 0.1, -0.05] },
    ]);
    // 0.6*0.1 + 0.4*0 = 0.06; 0.6*-0.2 + 0.4*0.1 = -0.08; 0.6*0.05+0.4*-0.05=0.01
    expect(blended).toHaveLength(3);
    expect(blended[0]).toBeCloseTo(0.06, PRECISION);
    expect(blended[1]).toBeCloseTo(-0.08, PRECISION);
    expect(blended[2]).toBeCloseTo(0.01, PRECISION);
  });

  it("is exact for weights that drift under float arithmetic", () => {
    // 0.1 * three constituents would drift with naive floats; Decimal keeps it
    // exact. A flat 0.3 blend of three equal series must be exactly the series.
    const blended = blendBenchmark([
      { id: "a", label: "A", weight: 0.1, returns: [0.3] },
      { id: "b", label: "B", weight: 0.2, returns: [0.3] },
      { id: "c", label: "C", weight: 0.7, returns: [0.3] },
    ]);
    expect(blended[0]).toBe(0.3);
  });

  it("rejects weights that do not sum to 1", () => {
    expect(() =>
      blendBenchmark([
        { id: "a", label: "A", weight: 0.5, returns: [0.1] },
        { id: "b", label: "B", weight: 0.4, returns: [0.1] },
      ]),
    ).toThrow(BenchmarkError);
  });

  it("rejects mismatched period counts", () => {
    expect(() =>
      blendBenchmark([
        { id: "a", label: "A", weight: 0.5, returns: [0.1, 0.2] },
        { id: "b", label: "B", weight: 0.5, returns: [0.1] },
      ]),
    ).toThrow(/same period count/);
  });

  it("rejects non-positive and non-finite weights", () => {
    expect(() =>
      blendBenchmark([
        { id: "a", label: "A", weight: 1, returns: [0.1] },
        { id: "b", label: "B", weight: 0, returns: [0.1] },
      ]),
    ).toThrow(BenchmarkError);
  });

  it("rejects non-finite returns and empty input", () => {
    expect(() =>
      blendBenchmark([
        { id: "a", label: "A", weight: 1, returns: [Number.NaN] },
      ]),
    ).toThrow(BenchmarkError);
    expect(() => blendBenchmark([])).toThrow(BenchmarkError);
  });
});

describe("cumulativeGrowth / totalReturn / growthCurve", () => {
  it("compounds a series into a growth multiple", () => {
    expect(cumulativeGrowth([0.1, 0.1])).toBeCloseTo(1.21, PRECISION);
    expect(totalReturn([0.1, 0.1])).toBeCloseTo(0.21, PRECISION);
  });

  it("returns 1 for an all-zero series", () => {
    expect(cumulativeGrowth([0, 0, 0])).toBe(1);
  });

  it("builds an indexed equity curve starting at 1", () => {
    const curve = growthCurve([0.1, -0.5, 0.2]);
    expect(curve).toHaveLength(4);
    expect(curve[0]).toBe(1);
    expect(curve[1]).toBeCloseTo(1.1, PRECISION);
    expect(curve[2]).toBeCloseTo(0.55, PRECISION);
    expect(curve[3]).toBeCloseTo(0.66, PRECISION);
  });
});

describe("excess return", () => {
  it("subtracts benchmark from portfolio per period", () => {
    expect(excessReturns([0.05, 0.02], [0.03, 0.04])).toEqual([
      expect.closeTo(0.02, PRECISION),
      expect.closeTo(-0.02, PRECISION),
    ]);
  });

  it("averages the active return", () => {
    expect(meanExcessReturn([0.05, 0.01], [0.03, 0.03])).toBeCloseTo(0, PRECISION);
  });

  it("rejects misaligned series", () => {
    expect(() => excessReturns([0.1], [0.1, 0.2])).toThrow(
      RelativePerformanceError,
    );
  });
});

describe("tracking error", () => {
  it("is zero when the portfolio tracks the benchmark exactly", () => {
    expect(trackingError([0.01, 0.02, 0.03], [0.01, 0.02, 0.03])).toBe(0);
  });

  it("equals the sample stddev of the active series", () => {
    const p = [0.05, 0.02, -0.01, 0.04];
    const b = [0.03, 0.03, 0.0, 0.02];
    const active = p.map((x, i) => x - b[i]);
    expect(trackingError(p, b)).toBeCloseTo(refSampleStd(active), PRECISION);
  });

  it("annualizes by sqrt(periodsPerYear)", () => {
    const p = [0.05, 0.02, -0.01, 0.04];
    const b = [0.03, 0.03, 0.0, 0.02];
    expect(trackingError(p, b, { periodsPerYear: 12 })).toBeCloseTo(
      trackingError(p, b) * Math.sqrt(12),
      PRECISION,
    );
  });

  it("requires at least two periods and a positive periodsPerYear", () => {
    expect(() => trackingError([0.1], [0.1])).toThrow(RelativePerformanceError);
    expect(() =>
      trackingError([0.1, 0.2], [0.1, 0.2], { periodsPerYear: 0 }),
    ).toThrow(RelativePerformanceError);
  });
});

describe("information ratio", () => {
  it("equals mean active return over per-period tracking error", () => {
    const p = [0.05, 0.02, -0.01, 0.04];
    const b = [0.03, 0.03, 0.0, 0.02];
    const active = p.map((x, i) => x - b[i]);
    const expected = refMean(active) / refSampleStd(active);
    expect(informationRatio(p, b)).toBeCloseTo(expected, PRECISION);
  });

  it("annualizes by sqrt(periodsPerYear)", () => {
    const p = [0.05, 0.02, -0.01, 0.04];
    const b = [0.03, 0.03, 0.0, 0.02];
    expect(informationRatio(p, b, { periodsPerYear: 12 })).toBeCloseTo(
      informationRatio(p, b) * Math.sqrt(12),
      PRECISION,
    );
  });

  it("throws when tracking error is zero", () => {
    expect(() => informationRatio([0.01, 0.02], [0.01, 0.02])).toThrow(
      /tracking error is zero/,
    );
  });
});

describe("beta and alpha", () => {
  it("is 1 when the portfolio equals the benchmark", () => {
    expect(beta([0.05, -0.02, 0.03], [0.05, -0.02, 0.03])).toBeCloseTo(
      1,
      PRECISION,
    );
  });

  it("doubles when the portfolio is 2x the benchmark", () => {
    const b = [0.05, -0.02, 0.03, 0.01];
    const p = b.map((x) => 2 * x);
    expect(beta(p, b)).toBeCloseTo(2, PRECISION);
    // alpha intercept of an exact 2x line through the origin is ~0.
    expect(alpha(p, b)).toBeCloseTo(0, PRECISION);
  });

  it("matches cov/var oracle for a general series", () => {
    const p = [0.05, 0.02, -0.01, 0.04, 0.03];
    const b = [0.03, 0.03, 0.0, 0.02, 0.025];
    const mp = refMean(p);
    const mb = refMean(b);
    let cov = 0;
    let varB = 0;
    for (let i = 0; i < p.length; i++) {
      cov += (p[i] - mp) * (b[i] - mb);
      varB += (b[i] - mb) ** 2;
    }
    expect(beta(p, b)).toBeCloseTo(cov / varB, PRECISION);
    expect(alpha(p, b)).toBeCloseTo(mp - (cov / varB) * mb, PRECISION);
  });

  it("throws when the benchmark has zero variance", () => {
    expect(() => beta([0.1, 0.2], [0.05, 0.05])).toThrow(/zero variance/);
  });
});

describe("correlation", () => {
  it("is 1 for perfectly co-moving series", () => {
    expect(correlation([0.01, 0.02, 0.03], [0.02, 0.04, 0.06])).toBeCloseTo(
      1,
      PRECISION,
    );
  });

  it("is -1 for perfectly anti-correlated series", () => {
    expect(correlation([0.01, 0.02, 0.03], [-0.01, -0.02, -0.03])).toBeCloseTo(
      -1,
      PRECISION,
    );
  });

  it("throws when a series has zero variance", () => {
    expect(() => correlation([0.1, 0.1], [0.2, 0.3])).toThrow(/zero variance/);
  });
});

describe("relativePerformance bundle", () => {
  it("bundles the metrics consistently", () => {
    const p = FAMILY_PORTFOLIO.returns;
    const b = POLICY_BENCHMARK;
    const rp = relativePerformance(p, b, { periodsPerYear: 12 });
    expect(rp.portfolioTotalReturn).toBeCloseTo(refCompound(p), PRECISION);
    expect(rp.benchmarkTotalReturn).toBeCloseTo(refCompound(b), PRECISION);
    expect(rp.totalExcessReturn).toBeCloseTo(
      refCompound(p) - refCompound(b),
      PRECISION,
    );
    expect(rp.trackingError).toBeCloseTo(
      trackingError(p, b, { periodsPerYear: 12 }),
      PRECISION,
    );
    expect(rp.informationRatio).toBeCloseTo(
      informationRatio(p, b, { periodsPerYear: 12 }),
      PRECISION,
    );
    expect(rp.beta).toBeCloseTo(beta(p, b), PRECISION);
    expect(rp.alpha).toBeCloseTo(alpha(p, b) * 12, PRECISION);
    expect(rp.correlation).toBeCloseTo(correlation(p, b), PRECISION);
    expect(rp.excess).toEqual(excessReturns(p, b));
  });
});

describe("fixtures", () => {
  it("all index series share twelve monthly periods", () => {
    expect(BROAD_EQUITY.returns).toHaveLength(12);
    expect(BOND_INDEX.returns).toHaveLength(12);
    expect(SIXTY_FORTY).toHaveLength(12);
    expect(POLICY_BENCHMARK).toHaveLength(12);
    expect(FAMILY_PORTFOLIO.returns).toHaveLength(12);
    expect(PERIODS_PER_YEAR).toBe(12);
  });

  it("60/40 is the 0.6/0.4 blend of equity and bonds", () => {
    for (let i = 0; i < 12; i++) {
      expect(SIXTY_FORTY[i]).toBeCloseTo(
        0.6 * BROAD_EQUITY.returns[i] + 0.4 * BOND_INDEX.returns[i],
        PRECISION,
      );
    }
  });

  it("policy benchmark weights sum to 1", () => {
    const sum = POLICY_CONSTITUENTS.reduce((a, c) => a + c.weight, 0);
    expect(sum).toBeCloseTo(1, PRECISION);
  });

  it("policy benchmark is the weighted blend of its constituents", () => {
    for (let i = 0; i < 12; i++) {
      const expected = POLICY_CONSTITUENTS.reduce(
        (acc, c) => acc + c.weight * c.returns[i],
        0,
      );
      expect(POLICY_BENCHMARK[i]).toBeCloseTo(expected, PRECISION);
    }
  });

  it("the family portfolio modestly outperforms its policy benchmark", () => {
    const rp = relativePerformance(FAMILY_PORTFOLIO.returns, POLICY_BENCHMARK, {
      periodsPerYear: 12,
    });
    // positive but small excess, non-zero tracking error, beta near 1.
    expect(rp.totalExcessReturn).toBeGreaterThan(0);
    expect(rp.trackingError).toBeGreaterThan(0);
    // The portfolio leans into equity, so its beta to the lower-volatility
    // policy mix sits comfortably above 1 (but still in a sane range).
    expect(rp.beta).toBeGreaterThan(1);
    expect(rp.beta).toBeLessThan(2);
    expect(rp.correlation).toBeGreaterThan(0.9);
  });
});

describe("buildBenchmarkView", () => {
  it("produces aligned growth curves and excess series", () => {
    const view = buildBenchmarkView({
      portfolioLabel: "Family portfolio",
      benchmarkLabel: "Policy benchmark",
      portfolio: FAMILY_PORTFOLIO.returns,
      benchmark: POLICY_BENCHMARK,
      periodsPerYear: 12,
    });
    expect(view.portfolioCurve).toHaveLength(13);
    expect(view.benchmarkCurve).toHaveLength(13);
    expect(view.portfolioCurve[0]).toBe(1);
    expect(view.benchmarkCurve[0]).toBe(1);
    expect(view.excess).toHaveLength(12);
    // final curve point reconciles to total return + 1.
    expect(view.portfolioCurve[12]).toBeCloseTo(
      1 + view.metrics.portfolioTotalReturn,
      PRECISION,
    );
  });
});
