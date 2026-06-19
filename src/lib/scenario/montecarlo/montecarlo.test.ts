import { describe, expect, it } from "vitest";

import {
  conditionalValueAtRisk,
  distributionStats,
  MonteCarloError,
  percentileSorted,
  type SimAsset,
  type SimulationInput,
  simulateNetWorth,
  valueAtRisk,
} from "./montecarlo";

const ASSETS: SimAsset[] = [
  { key: "equity", value: 1_000_000, expectedReturn: 0.07, volatility: 0.16 },
  { key: "bond", value: 500_000, expectedReturn: 0.03, volatility: 0.05 },
  { key: "cash", value: 250_000, expectedReturn: 0.01, volatility: 0.0 },
];

const CORR = [
  [1, -0.1, 0],
  [-0.1, 1, 0.2],
  [0, 0.2, 1],
];

function baseInput(overrides: Partial<SimulationInput> = {}): SimulationInput {
  return {
    assets: ASSETS,
    correlation: CORR,
    paths: 5000,
    horizonYears: 5,
    steps: 12,
    seed: 20260619,
    ...overrides,
  };
}

describe("percentileSorted", () => {
  const sorted = [10, 20, 30, 40, 50];

  it("returns endpoints at 0 and 100", () => {
    expect(percentileSorted(sorted, 0)).toBe(10);
    expect(percentileSorted(sorted, 100)).toBe(50);
  });

  it("returns the median at 50", () => {
    expect(percentileSorted(sorted, 50)).toBe(30);
  });

  it("interpolates linearly between samples", () => {
    // rank = 0.25 * 4 = 1.0 -> exactly the second element
    expect(percentileSorted(sorted, 25)).toBe(20);
    // rank = 0.10 * 4 = 0.4 -> between 10 and 20
    expect(percentileSorted(sorted, 10)).toBeCloseTo(14, 9);
  });

  it("handles a single-element array", () => {
    expect(percentileSorted([42], 95)).toBe(42);
  });

  it("throws on an out-of-range percentile or empty array", () => {
    expect(() => percentileSorted(sorted, -1)).toThrow(MonteCarloError);
    expect(() => percentileSorted(sorted, 101)).toThrow(MonteCarloError);
    expect(() => percentileSorted([], 50)).toThrow(MonteCarloError);
  });
});

describe("distributionStats", () => {
  it("computes mean, stddev, min, max, median", () => {
    const s = distributionStats([1, 2, 3, 4, 5]);
    expect(s.count).toBe(5);
    expect(s.mean).toBe(3);
    expect(s.min).toBe(1);
    expect(s.max).toBe(5);
    expect(s.median).toBe(3);
    // sample stddev of 1..5 is sqrt(2.5)
    expect(s.stddev).toBeCloseTo(Math.sqrt(2.5), 9);
  });

  it("reports zero stddev for a single sample", () => {
    const s = distributionStats([7]);
    expect(s.stddev).toBe(0);
    expect(s.mean).toBe(7);
    expect(s.median).toBe(7);
  });

  it("includes requested percentiles", () => {
    const s = distributionStats([1, 2, 3, 4, 5], [25, 50, 75]);
    expect(s.percentiles[25]).toBe(2);
    expect(s.percentiles[50]).toBe(3);
    expect(s.percentiles[75]).toBe(4);
  });

  it("throws on an empty array or non-finite sample", () => {
    expect(() => distributionStats([])).toThrow(MonteCarloError);
    expect(() => distributionStats([1, NaN])).toThrow(MonteCarloError);
  });
});

describe("simulateNetWorth: determinism", () => {
  it("is identical across two runs with the same seed", () => {
    const a = simulateNetWorth(baseInput());
    const b = simulateNetWorth(baseInput());
    expect(a.terminalNetWorth).toEqual(b.terminalNetWorth);
    expect(a.stats).toEqual(b.stats);
    expect(a.probabilityOfLoss).toBe(b.probabilityOfLoss);
  });

  it("differs for a different seed", () => {
    const a = simulateNetWorth(baseInput({ seed: 1 }));
    const b = simulateNetWorth(baseInput({ seed: 2 }));
    expect(a.terminalNetWorth).not.toEqual(b.terminalNetWorth);
  });

  it("returns one terminal value per path, sorted ascending", () => {
    const r = simulateNetWorth(baseInput({ paths: 1000 }));
    expect(r.terminalNetWorth).toHaveLength(1000);
    for (let i = 1; i < r.terminalNetWorth.length; i++) {
      expect(r.terminalNetWorth[i]).toBeGreaterThanOrEqual(
        r.terminalNetWorth[i - 1],
      );
    }
  });
});

describe("simulateNetWorth: fixed-seed snapshot", () => {
  // These values pin the deterministic output for seed 20260619. If the RNG or
  // model math changes, this test must be regenerated intentionally.
  it("matches the recorded distribution statistics", () => {
    const r = simulateNetWorth(baseInput());
    expect(r.initialNetWorth).toBe(1_750_000);
    expect(r.stats.count).toBe(5000);
    expect(r.stats.mean).toMatchInlineSnapshot(`2269501.2104169587`);
    expect(r.stats.median).toMatchInlineSnapshot(`2190712.54815814`);
    expect(r.stats.stddev).toMatchInlineSnapshot(`518420.69943276385`);
    expect(r.stats.percentiles[5]).toMatchInlineSnapshot(`1586356.579727331`);
    expect(r.stats.percentiles[95]).toMatchInlineSnapshot(`3232085.022368901`);
    expect(r.probabilityOfLoss).toMatchInlineSnapshot(`0.1338`);
  });
});

describe("simulateNetWorth: model behaviour", () => {
  it("mean terminal net worth roughly matches the analytic expectation", () => {
    // E[V_T] = V_0 * exp(mu * T) per asset (lognormal mean), summed.
    const T = 5;
    const expected =
      1_000_000 * Math.exp(0.07 * T) +
      500_000 * Math.exp(0.03 * T) +
      250_000 * Math.exp(0.01 * T);
    const r = simulateNetWorth(baseInput({ paths: 20_000 }));
    // Within ~2% of the analytic mean for 20k paths.
    expect(r.stats.mean).toBeGreaterThan(expected * 0.98);
    expect(r.stats.mean).toBeLessThan(expected * 1.02);
  });

  it("a single risk-free asset with zero vol grows deterministically", () => {
    const r = simulateNetWorth({
      assets: [{ key: "cash", value: 100_000, expectedReturn: 0.05, volatility: 0 }],
      paths: 100,
      horizonYears: 3,
      steps: 6,
      seed: 1,
    });
    const expected = 100_000 * Math.exp(0.05 * 3);
    // Zero volatility -> every path is identical and equals the deterministic value.
    for (const v of r.terminalNetWorth) {
      expect(v).toBeCloseTo(expected, 4);
    }
    expect(r.stats.stddev).toBeCloseTo(0, 6);
    expect(r.probabilityOfLoss).toBe(0);
  });

  it("higher volatility widens the distribution", () => {
    const lowVol = simulateNetWorth({
      assets: [{ key: "x", value: 1_000_000, expectedReturn: 0.05, volatility: 0.05 }],
      paths: 5000,
      horizonYears: 5,
      steps: 12,
      seed: 42,
    });
    const highVol = simulateNetWorth({
      assets: [{ key: "x", value: 1_000_000, expectedReturn: 0.05, volatility: 0.3 }],
      paths: 5000,
      horizonYears: 5,
      steps: 12,
      seed: 42,
    });
    expect(highVol.stats.stddev).toBeGreaterThan(lowVol.stats.stddev * 3);
    expect(highVol.probabilityOfLoss).toBeGreaterThan(lowVol.probabilityOfLoss);
  });

  it("a zero-value asset contributes nothing and stays at zero", () => {
    const r = simulateNetWorth({
      assets: [
        { key: "live", value: 100_000, expectedReturn: 0.05, volatility: 0.1 },
        { key: "empty", value: 0, expectedReturn: 0.5, volatility: 0.5 },
      ],
      paths: 200,
      horizonYears: 1,
      steps: 4,
      seed: 9,
    });
    // initial net worth excludes the empty asset
    expect(r.initialNetWorth).toBe(100_000);
    // All terminal values are finite (the zero asset never injects NaN/Inf).
    for (const v of r.terminalNetWorth) expect(Number.isFinite(v)).toBe(true);
  });

  it("defaults to the identity correlation when none is given", () => {
    const withId = simulateNetWorth({
      assets: ASSETS,
      correlation: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      paths: 1000,
      horizonYears: 2,
      steps: 4,
      seed: 77,
    });
    const noCorr = simulateNetWorth({
      assets: ASSETS,
      paths: 1000,
      horizonYears: 2,
      steps: 4,
      seed: 77,
    });
    expect(noCorr.terminalNetWorth).toEqual(withId.terminalNetWorth);
  });

  it("more steps over the same horizon barely moves the mean (drift is consistent)", () => {
    const coarse = simulateNetWorth(baseInput({ steps: 1, paths: 20_000 }));
    const fine = simulateNetWorth(baseInput({ steps: 60, paths: 20_000 }));
    expect(fine.stats.mean).toBeGreaterThan(coarse.stats.mean * 0.97);
    expect(fine.stats.mean).toBeLessThan(coarse.stats.mean * 1.03);
  });
});

describe("simulateNetWorth: validation", () => {
  it("throws with no assets", () => {
    expect(() => simulateNetWorth(baseInput({ assets: [] }))).toThrow(
      MonteCarloError,
    );
  });

  it("throws on duplicate asset keys", () => {
    expect(() =>
      simulateNetWorth(
        baseInput({
          assets: [
            { key: "x", value: 1, expectedReturn: 0, volatility: 0 },
            { key: "x", value: 1, expectedReturn: 0, volatility: 0 },
          ],
          correlation: [
            [1, 0],
            [0, 1],
          ],
        }),
      ),
    ).toThrow(/duplicate asset key/);
  });

  it("throws on a negative asset value or volatility", () => {
    expect(() =>
      simulateNetWorth(
        baseInput({
          assets: [{ key: "x", value: -1, expectedReturn: 0, volatility: 0 }],
          correlation: [[1]],
        }),
      ),
    ).toThrow(/non-negative/);
    expect(() =>
      simulateNetWorth(
        baseInput({
          assets: [{ key: "x", value: 1, expectedReturn: 0, volatility: -0.1 }],
          correlation: [[1]],
        }),
      ),
    ).toThrow(/volatility must be non-negative/);
  });

  it("throws on a correlation-dimension mismatch", () => {
    expect(() =>
      simulateNetWorth(
        baseInput({
          correlation: [
            [1, 0],
            [0, 1],
          ],
        }),
      ),
    ).toThrow(MonteCarloError);
  });

  it("throws on a non-PSD correlation matrix", () => {
    expect(() =>
      simulateNetWorth(
        baseInput({
          correlation: [
            [1, 0.9, -0.9],
            [0.9, 1, 0.9],
            [-0.9, 0.9, 1],
          ],
        }),
      ),
    ).toThrow(/positive semi-definite/);
  });

  it("throws on non-positive paths / steps / horizon", () => {
    expect(() => simulateNetWorth(baseInput({ paths: 0 }))).toThrow(MonteCarloError);
    expect(() => simulateNetWorth(baseInput({ steps: 0 }))).toThrow(MonteCarloError);
    expect(() => simulateNetWorth(baseInput({ horizonYears: 0 }))).toThrow(
      MonteCarloError,
    );
    expect(() => simulateNetWorth(baseInput({ paths: 1.5 }))).toThrow(MonteCarloError);
  });
});

describe("valueAtRisk / conditionalValueAtRisk", () => {
  it("VaR is the loss at the (1 - level) tail", () => {
    const r = simulateNetWorth(baseInput());
    const var95 = valueAtRisk(r, 0.95);
    const tail5 = percentileSorted(r.terminalNetWorth, 5);
    expect(var95).toBeCloseTo(r.initialNetWorth - tail5, 6);
  });

  it("CVaR is at least as large as VaR (deeper tail)", () => {
    const r = simulateNetWorth(baseInput());
    expect(conditionalValueAtRisk(r, 0.95)).toBeGreaterThanOrEqual(
      valueAtRisk(r, 0.95),
    );
  });

  it("a higher confidence level gives a larger VaR", () => {
    const r = simulateNetWorth(baseInput());
    expect(valueAtRisk(r, 0.99)).toBeGreaterThan(valueAtRisk(r, 0.9));
  });

  it("throws on an out-of-range level", () => {
    const r = simulateNetWorth(baseInput({ paths: 100 }));
    expect(() => valueAtRisk(r, 0)).toThrow(MonteCarloError);
    expect(() => valueAtRisk(r, 1)).toThrow(MonteCarloError);
    expect(() => conditionalValueAtRisk(r, 1.5)).toThrow(MonteCarloError);
  });

  it("rejects non-finite VaR / CVaR levels", () => {
    const r = simulateNetWorth(baseInput({ paths: 100 }));
    expect(() => valueAtRisk(r, NaN)).toThrow(MonteCarloError);
    expect(() => conditionalValueAtRisk(r, 0)).toThrow(MonteCarloError);
    expect(() => conditionalValueAtRisk(r, Infinity)).toThrow(MonteCarloError);
  });

  it("CVaR equals the single worst sample at an extreme level on a tiny run", () => {
    // With paths*(1-level) < 1 the tail collapses to exactly one (worst) sample.
    const r = simulateNetWorth(baseInput({ paths: 50 }));
    const cvar = conditionalValueAtRisk(r, 0.99);
    const worst = r.terminalNetWorth[0]; // ascending-sorted
    expect(cvar).toBeCloseTo(r.initialNetWorth - worst, 6);
  });
});

describe("simulateNetWorth: adversarial edge cases", () => {
  it("perfectly correlated assets move together (rank-deficient PSD Cholesky)", () => {
    // correlation = 1 makes the matrix rank-deficient PSD. Two identical assets
    // driven by perfectly correlated shocks must end every path at equal values.
    const r = simulateNetWorth({
      assets: [
        { key: "a", value: 100, expectedReturn: 0.05, volatility: 0.2 },
        { key: "b", value: 100, expectedReturn: 0.05, volatility: 0.2 },
      ],
      correlation: [
        [1, 1],
        [1, 1],
      ],
      paths: 1000,
      horizonYears: 1,
      steps: 6,
      seed: 4242,
    });
    expect(r.terminalNetWorth).toHaveLength(1000);
    // Two identical assets with identical shocks => each path's net worth is an
    // even split, so every terminal value must be finite and strictly positive.
    expect(r.stats.min).toBeGreaterThan(0);
    expect(Number.isFinite(r.stats.mean)).toBe(true);
  });

  it("is reproducible regardless of how the seed is supplied (truncation/fold)", () => {
    // Mulberry32 truncates toward zero and folds into u32; 7.9 and 7 must agree.
    const a = simulateNetWorth(baseInput({ seed: 7, paths: 200 }));
    const b = simulateNetWorth(baseInput({ seed: 7.9, paths: 200 }));
    expect(b.terminalNetWorth).toEqual(a.terminalNetWorth);
  });

  it("a single asset with zero volatility and zero correlation matrix is deterministic", () => {
    const r = simulateNetWorth({
      assets: [{ key: "tbill", value: 1000, expectedReturn: 0.04, volatility: 0 }],
      paths: 64,
      horizonYears: 2,
      steps: 8,
      seed: 1,
    });
    // exp(0.04 * 2) growth, identical on every path => zero spread.
    expect(r.stats.stddev).toBeCloseTo(0, 9);
    expect(r.stats.mean).toBeCloseTo(1000 * Math.exp(0.04 * 2), 6);
    expect(r.probabilityOfLoss).toBe(0);
  });

  it("an all-zero-value portfolio yields zero net worth and 0% loss probability", () => {
    const r = simulateNetWorth({
      assets: [
        { key: "a", value: 0, expectedReturn: 0.1, volatility: 0.3 },
        { key: "b", value: 0, expectedReturn: 0.2, volatility: 0.4 },
      ],
      paths: 100,
      seed: 9,
    });
    expect(r.initialNetWorth).toBe(0);
    expect(r.stats.max).toBe(0);
    expect(r.stats.min).toBe(0);
    // Terminal (0) is never strictly below initial (0): no path counts as a loss.
    expect(r.probabilityOfLoss).toBe(0);
  });
});

describe("distributionStats: percentile extremes", () => {
  it("reports the requested 0th and 100th percentiles as min and max", () => {
    const stats = distributionStats([5, 1, 4, 2, 3], [0, 100]);
    expect(stats.percentiles[0]).toBe(stats.min);
    expect(stats.percentiles[100]).toBe(stats.max);
    expect(stats.min).toBe(1);
    expect(stats.max).toBe(5);
  });
});
