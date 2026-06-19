import { describe, expect, it } from "vitest";

import {
  RiskInputError,
  correlation,
  correlationMatrix,
  covariance,
  covarianceMatrix,
  downsideDeviation,
  maxDrawdown,
  mean,
  returnsFromLevels,
  sharpeRatio,
  sortinoRatio,
  stddev,
  variance,
  volatility,
} from "./index";

// Helper: assert two floats are equal to a tight tolerance (9 decimal places).
const near = (actual: number, expected: number) =>
  expect(actual).toBeCloseTo(expected, 9);

describe("returns: mean / variance / stddev", () => {
  it("computes the arithmetic mean", () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(mean([5])).toBe(5);
    expect(mean([-2, 2])).toBe(0);
  });

  it("computes sample variance (n-1) by known value", () => {
    // values [2,4,4,4,5,5,7,9]: mean 5, sum sq dev 32 -> sample var 32/7
    near(variance([2, 4, 4, 4, 5, 5, 7, 9]), 32 / 7);
  });

  it("computes population variance (n) by known value", () => {
    // same data: population var 32/8 = 4
    expect(variance([2, 4, 4, 4, 5, 5, 7, 9], { sample: false })).toBe(4);
  });

  it("computes population stddev = 2 for the classic example", () => {
    expect(stddev([2, 4, 4, 4, 5, 5, 7, 9], { sample: false })).toBe(2);
  });

  it("has zero variance for a constant series", () => {
    expect(variance([3, 3, 3, 3])).toBe(0);
    expect(stddev([3, 3, 3])).toBe(0);
  });

  it("rejects empty / too-short input", () => {
    expect(() => mean([])).toThrow(RiskInputError);
    expect(() => variance([1])).toThrow(RiskInputError); // sample needs 2
    expect(() => variance([], { sample: false })).toThrow(RiskInputError);
    expect(() => variance([5], { sample: false })).not.toThrow();
  });

  it("rejects non-finite values", () => {
    expect(() => mean([1, NaN])).toThrow(RiskInputError);
    expect(() => variance([1, Infinity, 3])).toThrow(RiskInputError);
  });
});

describe("returns: returnsFromLevels", () => {
  it("converts levels to simple returns", () => {
    const r = returnsFromLevels([100, 110, 99, 108.9]);
    expect(r).toHaveLength(3);
    near(r[0], 0.1);
    near(r[1], -0.1);
    near(r[2], 0.1);
  });

  it("requires at least two levels", () => {
    expect(() => returnsFromLevels([100])).toThrow(RiskInputError);
  });

  it("rejects a zero prior level (division by zero)", () => {
    expect(() => returnsFromLevels([0, 100])).toThrow(RiskInputError);
  });

  it("rejects non-finite levels", () => {
    expect(() => returnsFromLevels([100, NaN, 120])).toThrow(RiskInputError);
  });
});

describe("metrics: volatility", () => {
  // returns with mean 0.0375; sample variance computed by hand:
  // devs from mean: 0.0625, -0.0375, -0.0875, 0.0625
  // squares: 0.00390625, 0.00140625, 0.00765625, 0.00390625 => sum 0.016875
  // sample var = 0.016875 / 3 = 0.005625; stddev = 0.075
  const rets = [0.1, 0.0, -0.05, 0.1];

  it("per-period volatility equals the sample stddev (known value)", () => {
    near(volatility(rets), 0.075);
  });

  it("annualizes by sqrt(periodsPerYear)", () => {
    near(volatility(rets, { periodsPerYear: 252 }), 0.075 * Math.sqrt(252));
    near(volatility(rets, { periodsPerYear: 12 }), 0.075 * Math.sqrt(12));
  });

  it("is zero for a constant return series", () => {
    expect(volatility([0.01, 0.01, 0.01])).toBe(0);
  });

  it("rejects bad periodsPerYear and too-short input", () => {
    expect(() => volatility(rets, { periodsPerYear: 0 })).toThrow(RiskInputError);
    expect(() => volatility(rets, { periodsPerYear: -1 })).toThrow(RiskInputError);
    expect(() => volatility([0.01])).toThrow(RiskInputError);
  });
});

describe("metrics: maxDrawdown", () => {
  it("is zero for a monotonically rising curve", () => {
    expect(maxDrawdown([0.1, 0.1, 0.1]).maxDrawdown).toBe(0);
  });

  it("computes a simple single-drop drawdown (known value)", () => {
    // equity: 1 -> 1.0 (no), use [0.5, -0.5]: 1 -> 1.5 -> 0.75
    // peak 1.5, trough 0.75 -> dd = (1.5-0.75)/1.5 = 0.5
    const dd = maxDrawdown([0.5, -0.5]);
    near(dd.maxDrawdown, 0.5);
    expect(dd.peakIndex).toBe(0);
    expect(dd.troughIndex).toBe(1);
  });

  it("recovers and finds the worst of multiple drawdowns", () => {
    // levels via returns: start 1
    // +0.2 -> 1.2 (peak0)
    // -0.5 -> 0.6 (dd from 1.2 = 0.5)
    // +1.0 -> 1.2 (back to old peak, equal not greater so peak stays idx0... but equity==peak)
    // we want a new higher peak then bigger crash:
    // +0.25 -> 1.5 (new peak idx3)
    // -0.6 -> 0.6 (dd from 1.5 = 0.6) worst
    const dd = maxDrawdown([0.2, -0.5, 1.0, 0.25, -0.6]);
    near(dd.maxDrawdown, 0.6);
    expect(dd.troughIndex).toBe(4);
    expect(dd.peakIndex).toBe(3);
  });

  it("handles a 20% drawdown known value", () => {
    // 1 -> 1.25 -> 1.0 : dd = (1.25-1.0)/1.25 = 0.2
    near(maxDrawdown([0.25, -0.2]).maxDrawdown, 0.2);
  });

  it("rejects empty and non-finite input", () => {
    expect(() => maxDrawdown([])).toThrow(RiskInputError);
    expect(() => maxDrawdown([0.1, NaN])).toThrow(RiskInputError);
  });
});

describe("metrics: downsideDeviation", () => {
  it("counts only below-target periods (known value)", () => {
    // returns [0.1, -0.1, 0.2, -0.2], target 0
    // shortfalls: 0, -0.1, 0, -0.2 -> squares 0.01, 0.04 -> sum 0.05
    // /4 = 0.0125 -> sqrt = 0.1118033988...
    near(downsideDeviation([0.1, -0.1, 0.2, -0.2]), Math.sqrt(0.05 / 4));
  });

  it("is zero when nothing falls below target", () => {
    expect(downsideDeviation([0.1, 0.2, 0.0])).toBe(0);
  });

  it("respects a non-zero target return", () => {
    // returns [0.05, 0.05], target 0.1 -> shortfalls -0.05 each
    // sum sq = 0.0025 + 0.0025 = 0.005 /2 = 0.0025 -> sqrt 0.05
    near(downsideDeviation([0.05, 0.05], { targetReturn: 0.1 }), 0.05);
  });

  it("rejects empty / non-finite", () => {
    expect(() => downsideDeviation([])).toThrow(RiskInputError);
    expect(() => downsideDeviation([0.1, NaN])).toThrow(RiskInputError);
  });
});

describe("metrics: sharpeRatio", () => {
  const rets = [0.1, 0.0, -0.05, 0.1]; // mean 0.0375, sample stddev 0.075

  it("computes the per-period Sharpe (known value)", () => {
    // (0.0375 - 0) / 0.075 = 0.5
    near(sharpeRatio(rets), 0.5);
  });

  it("subtracts the risk-free rate", () => {
    // (0.0375 - 0.0075)/0.075 = 0.03/0.075 = 0.4
    near(sharpeRatio(rets, { riskFreeRate: 0.0075 }), 0.4);
  });

  it("annualizes by sqrt(periodsPerYear)", () => {
    near(sharpeRatio(rets, { periodsPerYear: 252 }), 0.5 * Math.sqrt(252));
  });

  it("throws for a zero-volatility series", () => {
    expect(() => sharpeRatio([0.01, 0.01, 0.01])).toThrow(RiskInputError);
  });

  it("requires two returns and valid options", () => {
    expect(() => sharpeRatio([0.1])).toThrow(RiskInputError);
    expect(() => sharpeRatio(rets, { periodsPerYear: 0 })).toThrow(RiskInputError);
    expect(() => sharpeRatio(rets, { riskFreeRate: NaN })).toThrow(RiskInputError);
  });
});

describe("metrics: sortinoRatio", () => {
  it("computes the per-period Sortino (known value)", () => {
    // returns [0.1, -0.1, 0.2, -0.2]: mean 0
    // downside dev = sqrt(0.05/4) (from above)
    // sortino = (0 - 0) / dd = 0
    near(sortinoRatio([0.1, -0.1, 0.2, -0.2]), 0);
  });

  it("computes a non-trivial Sortino (known value)", () => {
    // returns [0.2, -0.1, 0.2, -0.1]: mean = 0.05
    // downside: shortfalls 0, -0.1, 0, -0.1 -> sumsq 0.02 /4 = 0.005 -> dd sqrt(0.005)
    // sortino = 0.05 / sqrt(0.005)
    const expected = 0.05 / Math.sqrt(0.005);
    near(sortinoRatio([0.2, -0.1, 0.2, -0.1]), expected);
  });

  it("subtracts the risk-free / target rate from the numerator and downside", () => {
    // returns [0.2, -0.1, 0.2, -0.1], rf 0.05: mean excess 0
    // downside target 0.05: shortfalls -0.15? no: r-target: 0.15,-0.15,0.15,-0.15
    // negatives -0.15 twice -> sumsq 0.045 /4 = 0.01125 dd sqrt
    // sortino = 0 / dd = 0
    near(sortinoRatio([0.2, -0.1, 0.2, -0.1], { riskFreeRate: 0.05 }), 0);
  });

  it("annualizes by sqrt(periodsPerYear)", () => {
    const base = sortinoRatio([0.2, -0.1, 0.2, -0.1]);
    near(
      sortinoRatio([0.2, -0.1, 0.2, -0.1], { periodsPerYear: 12 }),
      base * Math.sqrt(12),
    );
  });

  it("throws when there is no downside (zero downside deviation)", () => {
    expect(() => sortinoRatio([0.1, 0.2, 0.05])).toThrow(RiskInputError);
  });
});

describe("correlation: covariance & correlation", () => {
  it("covariance of identical series equals its variance", () => {
    const s = [0.1, 0.0, -0.05, 0.1];
    near(covariance(s, s), variance(s));
  });

  it("correlation of a series with itself is 1", () => {
    near(correlation([1, 2, 3, 4], [1, 2, 3, 4]), 1);
  });

  it("perfectly anti-correlated series give -1", () => {
    near(correlation([1, 2, 3, 4], [4, 3, 2, 1]), -1);
  });

  it("computes a known Pearson correlation", () => {
    // classic example: x=[1,2,3,4,5], y=[2,4,5,4,5]
    // r = 0.7745966692... (sqrt(0.6))
    near(correlation([1, 2, 3, 4, 5], [2, 4, 5, 4, 5]), 0.7745966692414834);
  });

  it("is invariant to positive affine transforms of a series", () => {
    const x = [0.1, -0.2, 0.05, 0.3, -0.1];
    const y = x.map((v) => 3 * v + 7);
    near(correlation(x, y), 1);
  });

  it("throws for zero-variance series and mismatched lengths", () => {
    expect(() => correlation([1, 1, 1], [1, 2, 3])).toThrow(RiskInputError);
    expect(() => correlation([1, 2], [1, 2, 3])).toThrow(RiskInputError);
    expect(() => covariance([1], [2])).toThrow(RiskInputError);
  });
});

describe("correlation: correlationMatrix", () => {
  const series = {
    A: [0.1, -0.2, 0.05, 0.3, -0.1],
    B: [0.2, -0.4, 0.1, 0.6, -0.2], // exactly 2*A -> corr 1 with A
    C: [-0.1, 0.2, -0.05, -0.3, 0.1], // -1 * A -> corr -1 with A
  };

  it("has an all-ones diagonal", () => {
    const { keys, matrix } = correlationMatrix(series);
    expect(keys).toEqual(["A", "B", "C"]);
    keys.forEach((_, i) => near(matrix[i][i] as number, 1));
  });

  it("is symmetric with the expected correlations", () => {
    const { matrix } = correlationMatrix(series);
    near(matrix[0][1] as number, 1); // A,B
    near(matrix[0][2] as number, -1); // A,C
    near(matrix[1][2] as number, -1); // B,C
    expect(matrix[0][1]).toBe(matrix[1][0]);
    expect(matrix[0][2]).toBe(matrix[2][0]);
  });

  it("reports null cells for a zero-variance series instead of throwing", () => {
    const { keys, matrix } = correlationMatrix({
      A: [0.1, -0.2, 0.05],
      FLAT: [0.5, 0.5, 0.5],
    });
    const flat = keys.indexOf("FLAT");
    const a = keys.indexOf("A");
    expect(matrix[flat][flat]).toBeNull();
    expect(matrix[flat][a]).toBeNull();
    expect(matrix[a][flat]).toBeNull();
    near(matrix[a][a] as number, 1);
  });

  it("clamps to [-1, 1]", () => {
    const { matrix } = correlationMatrix(series);
    for (const row of matrix) {
      for (const cell of row) {
        if (cell !== null) {
          expect(cell).toBeGreaterThanOrEqual(-1);
          expect(cell).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("rejects misaligned series", () => {
    expect(() =>
      correlationMatrix({ A: [1, 2, 3], B: [1, 2] }),
    ).toThrow(RiskInputError);
    expect(() => correlationMatrix({})).toThrow(RiskInputError);
    expect(() => correlationMatrix({ A: [1] })).toThrow(RiskInputError);
  });
});

describe("correlation: covarianceMatrix", () => {
  it("has variances on the diagonal and is symmetric", () => {
    const series = {
      A: [0.1, -0.2, 0.05, 0.3],
      B: [0.05, 0.1, -0.1, 0.2],
    };
    const { keys, matrix } = covarianceMatrix(series);
    expect(keys).toEqual(["A", "B"]);
    near(matrix[0][0], variance(series.A));
    near(matrix[1][1], variance(series.B));
    near(matrix[0][1], covariance(series.A, series.B));
    expect(matrix[0][1]).toBe(matrix[1][0]);
  });
});
