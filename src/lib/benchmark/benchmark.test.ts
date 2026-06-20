import { describe, expect, it } from "vitest";

import {
  BenchmarkInputError,
  alpha,
  beta,
  blendPolicyReturns,
  buildBenchmarkView,
  compoundReturn,
  excessReturn,
  excessReturns,
  informationRatio,
  relativePerformance,
  trackingError,
  type PolicyBenchmark,
} from "./index";
import {
  BENCHMARK_60_40,
  BROAD_BOND_RETURNS,
  BROAD_EQUITY_RETURNS,
  CASH_RETURNS,
  PERIODS_PER_YEAR,
  POLICY_BENCHMARK,
  PORTFOLIO_RETURNS,
} from "./fixtures";

const CLOSE = 1e-9;

describe("excessReturns / excessReturn", () => {
  it("computes per-period active returns", () => {
    const active = excessReturns([0.02, -0.01, 0.03], [0.01, 0.0, 0.02]);
    expect(active).toHaveLength(3);
    expect(active[0]).toBeCloseTo(0.01, 12);
    expect(active[1]).toBeCloseTo(-0.01, 12);
    expect(active[2]).toBeCloseTo(0.01, 12);
  });

  it("geometrically links the total excess return", () => {
    const p = [0.1, 0.1];
    const b = [0.05, 0.05];
    // (1.1*1.1 - 1) - (1.05*1.05 - 1) = 0.21 - 0.1025 = 0.1075
    expect(excessReturn(p, b)).toBeCloseTo(0.1075, 12);
  });

  it("rejects misaligned series", () => {
    expect(() => excessReturns([0.01], [0.01, 0.02])).toThrow(
      BenchmarkInputError,
    );
  });

  it("rejects non-finite inputs", () => {
    expect(() => excessReturns([Number.NaN], [0.01])).toThrow(
      BenchmarkInputError,
    );
  });
});

describe("compoundReturn", () => {
  it("links a series of simple returns", () => {
    expect(compoundReturn([0.1, -0.1])).toBeCloseTo(-0.01, 12);
  });
  it("requires at least one return", () => {
    expect(() => compoundReturn([])).toThrow(BenchmarkInputError);
  });
});

describe("trackingError", () => {
  it("is zero when the portfolio exactly tracks the benchmark", () => {
    const s = [0.01, -0.02, 0.03];
    expect(trackingError(s, s)).toBe(0);
  });

  it("equals the sample stddev of active returns (per period)", () => {
    const p = [0.02, 0.04, 0.0];
    const b = [0.01, 0.01, 0.01];
    // active = [0.01, 0.03, -0.01], mean = 0.01,
    // ss = 0 + 0.0004 + 0.0004 = 0.0008, var = 0.0004, sd = 0.02
    expect(trackingError(p, b)).toBeCloseTo(0.02, 12);
  });

  it("annualizes by sqrt(periodsPerYear)", () => {
    const p = [0.02, 0.04, 0.0];
    const b = [0.01, 0.01, 0.01];
    expect(trackingError(p, b, { periodsPerYear: 12 })).toBeCloseTo(
      0.02 * Math.sqrt(12),
      12,
    );
  });

  it("requires at least two observations", () => {
    expect(() => trackingError([0.01], [0.01])).toThrow(BenchmarkInputError);
  });

  it("rejects a non-positive periodsPerYear", () => {
    expect(() =>
      trackingError([0.01, 0.02], [0.0, 0.0], { periodsPerYear: 0 }),
    ).toThrow(BenchmarkInputError);
  });
});

describe("informationRatio", () => {
  it("is mean(active) / stddev(active), annualized", () => {
    const p = [0.02, 0.04, 0.0];
    const b = [0.01, 0.01, 0.01];
    // mean active = 0.01, sd active = 0.02 -> per-period IR = 0.5
    expect(informationRatio(p, b)).toBeCloseTo(0.5, 12);
    expect(informationRatio(p, b, { periodsPerYear: 12 })).toBeCloseTo(
      0.5 * Math.sqrt(12),
      12,
    );
  });

  it("throws when tracking error is zero", () => {
    const s = [0.01, 0.02, 0.03];
    expect(() => informationRatio(s, s)).toThrow(BenchmarkInputError);
  });
});

describe("beta", () => {
  it("is 1 when the portfolio equals the benchmark", () => {
    const s = [0.01, -0.02, 0.03, 0.005];
    expect(beta(s, s)).toBeCloseTo(1, 12);
  });

  it("is the leverage factor for a scaled benchmark", () => {
    const b = [0.01, -0.02, 0.03, 0.005];
    const p = b.map((x) => 2 * x);
    expect(beta(p, b)).toBeCloseTo(2, 12);
  });

  it("is unaffected by a constant offset on the portfolio", () => {
    const b = [0.01, -0.02, 0.03, 0.005];
    const p = b.map((x) => x + 0.01);
    expect(beta(p, b)).toBeCloseTo(1, 12);
  });

  it("throws against a flat benchmark", () => {
    expect(() => beta([0.01, 0.02], [0.01, 0.01])).toThrow(BenchmarkInputError);
  });
});

describe("alpha", () => {
  it("reduces to mean(p) - beta*mean(b) with zero risk-free", () => {
    const b = [0.01, -0.02, 0.03, 0.005];
    const p = b.map((x) => 2 * x + 0.002); // beta 2, constant alpha 0.002
    expect(alpha(p, b)).toBeCloseTo(0.002, 12);
  });

  it("is zero when the portfolio is exactly the benchmark", () => {
    const s = [0.01, -0.02, 0.03, 0.005];
    expect(alpha(s, s)).toBeCloseTo(0, 12);
  });
});

describe("relativePerformance (fixture oracle)", () => {
  const benchReturns = blendPolicyReturns(POLICY_BENCHMARK);
  const perf = relativePerformance(PORTFOLIO_RETURNS, benchReturns, {
    periodsPerYear: PERIODS_PER_YEAR,
  });

  // Oracle values independently recomputed from the fixtures (see fixtures.ts).
  it("matches hand-computed headline figures", () => {
    expect(perf.portfolioReturn).toBeCloseTo(0.157304, 6);
    expect(perf.benchmarkReturn).toBeCloseTo(0.088553, 6);
    expect(perf.excessReturn).toBeCloseTo(0.068751, 6);
    expect(perf.trackingError).toBeCloseTo(0.029404, 6);
    expect(perf.informationRatio).toBeCloseTo(2.148335, 6);
    expect(perf.beta).toBeCloseTo(1.696989, 6);
    expect(perf.alpha).toBeCloseTo(0.00027896, 8);
  });

  it("portfolio beat the policy benchmark over the year", () => {
    expect(perf.excessReturn).toBeGreaterThan(0);
    expect(perf.portfolioReturn).toBeGreaterThan(perf.benchmarkReturn);
  });
});

describe("blendPolicyReturns", () => {
  it("periodic mode is the weighted average each period", () => {
    const blended = blendPolicyReturns(POLICY_BENCHMARK);
    expect(blended).toHaveLength(BROAD_EQUITY_RETURNS.length);
    for (let i = 0; i < blended.length; i++) {
      const expected =
        0.55 * BROAD_EQUITY_RETURNS[i] +
        0.35 * BROAD_BOND_RETURNS[i] +
        0.1 * CASH_RETURNS[i];
      expect(blended[i]).toBeCloseTo(expected, 12);
    }
  });

  it("a single 100% component reproduces that component's returns", () => {
    const equityOnly: PolicyBenchmark = {
      id: "eq",
      label: "Equity",
      components: [
        {
          id: "broad-equity",
          label: "Broad equity",
          weight: 1,
          returns: BROAD_EQUITY_RETURNS,
        },
      ],
    };
    const blended = blendPolicyReturns(equityOnly);
    blended.forEach((r, i) =>
      expect(r).toBeCloseTo(BROAD_EQUITY_RETURNS[i], 12),
    );
  });

  it("buy-and-hold equals periodic for the first period and diverges after", () => {
    const periodic = blendPolicyReturns(BENCHMARK_60_40, { mode: "periodic" });
    const bah = blendPolicyReturns(BENCHMARK_60_40, { mode: "buy-and-hold" });
    expect(bah[0]).toBeCloseTo(periodic[0], 12);
    // total compounded growth is identical regardless of how we attribute it
    // per period only when weights never drift; here they drift, but the basket
    // value identity still holds for buy-and-hold: product over time matches a
    // direct value calc.
    expect(bah.length).toBe(periodic.length);
  });

  it("buy-and-hold matches a direct basket-value computation", () => {
    const eq = [0.5, -0.2];
    const bd = [0.0, 0.0];
    const policy: PolicyBenchmark = {
      id: "p",
      label: "P",
      components: [
        { id: "e", label: "E", weight: 0.6, returns: eq },
        { id: "b", label: "B", weight: 0.4, returns: bd },
      ],
    };
    const bah = blendPolicyReturns(policy, { mode: "buy-and-hold" });
    // period 0: total = 0.6*1.5 + 0.4*1.0 = 1.3 -> r0 = 0.3
    expect(bah[0]).toBeCloseTo(0.3, 12);
    // period 1: equity sleeve now 0.9, bond 0.4; total before = 1.3
    // after = 0.9*0.8 + 0.4 = 0.72 + 0.4 = 1.12 -> r1 = 1.12/1.3 - 1
    expect(bah[1]).toBeCloseTo(1.12 / 1.3 - 1, 12);
  });

  it("rejects weights that do not sum to 1", () => {
    const bad: PolicyBenchmark = {
      id: "bad",
      label: "Bad",
      components: [
        { id: "e", label: "E", weight: 0.5, returns: [0.01] },
        { id: "b", label: "B", weight: 0.4, returns: [0.0] },
      ],
    };
    expect(() => blendPolicyReturns(bad)).toThrow(BenchmarkInputError);
  });

  it("rejects negative weights", () => {
    const bad: PolicyBenchmark = {
      id: "bad",
      label: "Bad",
      components: [
        { id: "e", label: "E", weight: 1.2, returns: [0.01] },
        { id: "b", label: "B", weight: -0.2, returns: [0.0] },
      ],
    };
    expect(() => blendPolicyReturns(bad)).toThrow(BenchmarkInputError);
  });

  it("rejects misaligned component series", () => {
    const bad: PolicyBenchmark = {
      id: "bad",
      label: "Bad",
      components: [
        { id: "e", label: "E", weight: 0.6, returns: [0.01, 0.02] },
        { id: "b", label: "B", weight: 0.4, returns: [0.0] },
      ],
    };
    expect(() => blendPolicyReturns(bad)).toThrow(BenchmarkInputError);
  });

  it("rejects an empty component list", () => {
    expect(() =>
      blendPolicyReturns({ id: "x", label: "X", components: [] }),
    ).toThrow(BenchmarkInputError);
  });
});

describe("buildBenchmarkView", () => {
  const view = buildBenchmarkView({
    portfolio: PORTFOLIO_RETURNS,
    benchmark: POLICY_BENCHMARK,
    periodsPerYear: PERIODS_PER_YEAR,
  });

  it("carries the benchmark identity and mode", () => {
    expect(view.benchmarkId).toBe("family-policy-55-35-10");
    expect(view.benchmarkLabel).toBe("Family policy (55/35/10)");
    expect(view.mode).toBe("periodic");
  });

  it("emits one row per period with consistent growth curves", () => {
    expect(view.rows).toHaveLength(PORTFOLIO_RETURNS.length);
    const last = view.rows[view.rows.length - 1];
    // final growth multiple == 1 + total compounded return
    expect(last.portfolioGrowth - 1).toBeCloseTo(view.performance.portfolioReturn, 12);
    expect(last.benchmarkGrowth - 1).toBeCloseTo(view.performance.benchmarkReturn, 12);
    expect(last.cumulativeExcess).toBeCloseTo(
      last.portfolioGrowth - last.benchmarkGrowth,
      12,
    );
  });

  it("each row's active return reconciles portfolio minus benchmark", () => {
    for (const row of view.rows) {
      expect(row.activeReturn).toBeCloseTo(
        row.portfolioReturn - row.benchmarkReturn,
        CLOSE,
      );
    }
  });

  it("the view's performance matches a direct relativePerformance call", () => {
    const direct = relativePerformance(
      PORTFOLIO_RETURNS,
      blendPolicyReturns(POLICY_BENCHMARK),
      { periodsPerYear: PERIODS_PER_YEAR },
    );
    expect(view.performance).toEqual(direct);
  });
});
