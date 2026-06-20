import { describe, expect, it } from "vitest";

import { deployableValue, projectLiquidityCoverage } from "./engine";

/**
 * Independent tester's adversarial pass (m11-liquidity-coverage): boundary and
 * tie-breaking cases not exercised by the worker's own invariant suite. Targets
 * the exact edges where an off-by-one or a comparison operator would slip.
 */
describe("liquidity coverage — tester boundary cases", () => {
  it("worstMonth ties break to the FIRST month at the minimum ratio", () => {
    // Two months with identical 0.5× coverage; the earliest should win.
    const p = projectLiquidityCoverage({
      horizonMonths: 3,
      currency: "USD",
      reserves: [
        { id: "a", label: "a", balance: "100", availableFromMonth: 0 },
        { id: "b", label: "b", balance: "100", availableFromMonth: 2 },
      ],
      obligations: [
        { id: "x", label: "x", category: "pe-call", amount: "200", month: 0 },
        { id: "y", label: "y", category: "pe-call", amount: "200", month: 2 },
      ],
    });
    // Month 0: 100/200 = 0.5. Month 2: 100/200 = 0.5 (buffer floored to 0 then
    // +100 inflow). Both 0.5 → earliest (0) wins.
    expect(p.months[0].coverageRatio?.toFixed()).toBe("0.5");
    expect(p.months[2].coverageRatio?.toFixed()).toBe("0.5");
    expect(p.summary.worstMonth).toBe(0);
  });

  it("rejects a haircut of exactly 1 but accepts one just below", () => {
    expect(() =>
      deployableValue({ id: "z", label: "z", balance: "100", haircut: "1" }),
    ).toThrow(/haircut must be in \[0, 1\)/);
    // 0.999999 is valid and leaves a sliver of deployable value.
    const dep = deployableValue({
      id: "z",
      label: "z",
      balance: "1000000",
      haircut: "0.999999",
    });
    expect(dep.toFixed()).toBe("1");
  });

  it("a reserve available exactly AT the horizon never lands in the buffer", () => {
    const p = projectLiquidityCoverage({
      horizonMonths: 3,
      currency: "USD",
      reserves: [
        { id: "late", label: "late", balance: "9999", availableFromMonth: 3 },
        { id: "now", label: "now", balance: "100", availableFromMonth: 0 },
      ],
      obligations: [
        { id: "x", label: "x", category: "pe-call", amount: "100", month: 2 },
      ],
    });
    // Only the 100 ever comes online; the month-3 reserve is outside the window.
    // But totalLiquidity still counts gross deployable across ALL tiers.
    expect(p.summary.totalLiquidity.toFixed()).toBe("10099");
    expect(p.months[2].availableLiquidity.toFixed()).toBe("100");
    expect(p.months[2].covered).toBe(true);
  });

  it("an obligation exactly AT the horizon is dropped (cannot bind)", () => {
    const p = projectLiquidityCoverage({
      horizonMonths: 2,
      currency: "USD",
      reserves: [{ id: "a", label: "a", balance: "50" }],
      obligations: [
        { id: "in", label: "in", category: "pe-call", amount: "10", month: 1 },
        { id: "out", label: "out", category: "pe-call", amount: "999", month: 2 },
      ],
    });
    expect(p.months).toHaveLength(2);
    expect(p.summary.totalObligations.toFixed()).toBe("10");
    expect(p.summary.fullyCovered).toBe(true);
  });

  it("keeps sub-cent precision exact through haircut and coverage", () => {
    const p = projectLiquidityCoverage({
      horizonMonths: 1,
      currency: "USD",
      // 0.1 + 0.2 in float is 0.30000000000000004; Decimal must be exact.
      reserves: [
        { id: "a", label: "a", balance: "0.1" },
        { id: "b", label: "b", balance: "0.2" },
      ],
      obligations: [
        { id: "x", label: "x", category: "pe-call", amount: "0.3", month: 0 },
      ],
    });
    expect(p.summary.totalLiquidity.toFixed()).toBe("0.3");
    expect(p.months[0].coverageRatio?.toFixed()).toBe("1");
    expect(p.months[0].shortfall.toFixed()).toBe("0");
    expect(p.summary.fullyCovered).toBe(true);
  });

  it("treats any non-'pe-call' category as burn in the call/burn split", () => {
    const p = projectLiquidityCoverage({
      horizonMonths: 2,
      currency: "USD",
      reserves: [{ id: "a", label: "a", balance: "1000" }],
      obligations: [
        { id: "c", label: "c", category: "pe-call", amount: "100", month: 0 },
        { id: "b", label: "b", category: "household-burn", amount: "40", month: 0 },
        { id: "o", label: "o", category: "other-spend", amount: "60", month: 1 },
      ],
    });
    expect(p.summary.totalCalls.toFixed()).toBe("100");
    expect(p.summary.totalBurn.toFixed()).toBe("100"); // 40 + 60
    expect(p.summary.totalObligations.toFixed()).toBe("200");
  });

  it("rejects a non-integer or negative obligation month", () => {
    expect(() =>
      projectLiquidityCoverage({
        horizonMonths: 3,
        currency: "USD",
        reserves: [{ id: "a", label: "a", balance: "1" }],
        obligations: [
          { id: "x", label: "x", category: "pe-call", amount: "1", month: 1.5 },
        ],
      }),
    ).toThrow(/non-negative integer/);
    expect(() =>
      projectLiquidityCoverage({
        horizonMonths: 3,
        currency: "USD",
        reserves: [{ id: "a", label: "a", balance: "1" }],
        obligations: [
          { id: "x", label: "x", category: "pe-call", amount: "1", month: -1 },
        ],
      }),
    ).toThrow(/non-negative integer/);
  });

  it("rejects non-finite money and a zero/negative horizon", () => {
    expect(() =>
      projectLiquidityCoverage({
        horizonMonths: 1,
        currency: "USD",
        reserves: [{ id: "a", label: "a", balance: Infinity }],
        obligations: [],
      }),
    ).toThrow(/non-finite/);
    expect(() =>
      projectLiquidityCoverage({
        horizonMonths: 0,
        currency: "USD",
        reserves: [],
        obligations: [],
      }),
    ).toThrow(/positive integer/);
    expect(() =>
      projectLiquidityCoverage({
        horizonMonths: 1,
        currency: "USD",
        reserves: [{ id: "a", label: "a", balance: "-5" }],
        obligations: [],
      }),
    ).toThrow(/non-negative/);
  });

  it("a NaN amount is rejected rather than silently producing NaN coverage", () => {
    expect(() =>
      projectLiquidityCoverage({
        horizonMonths: 1,
        currency: "USD",
        reserves: [{ id: "a", label: "a", balance: "100" }],
        obligations: [
          { id: "x", label: "x", category: "pe-call", amount: NaN, month: 0 },
        ],
      }),
    ).toThrow(/non-finite/);
  });

  it("no-obligation horizon yields null ratios and full coverage", () => {
    const p = projectLiquidityCoverage({
      horizonMonths: 2,
      currency: "USD",
      reserves: [{ id: "a", label: "a", balance: "100" }],
      obligations: [],
    });
    expect(p.summary.coverageRatio).toBeNull();
    expect(p.summary.worstMonth).toBeNull();
    expect(p.summary.worstCoverageRatio).toBeNull();
    expect(p.summary.firstShortfallMonth).toBeNull();
    expect(p.summary.fullyCovered).toBe(true);
    expect(p.months.every((m) => m.coverageRatio === null)).toBe(true);
  });

  it("crosses a rounding boundary exactly: 1.0× coverage is covered, a hair below is not", () => {
    const exact = projectLiquidityCoverage({
      horizonMonths: 1,
      currency: "USD",
      reserves: [{ id: "a", label: "a", balance: "100" }],
      obligations: [{ id: "x", label: "x", category: "pe-call", amount: "100", month: 0 }],
    });
    expect(exact.months[0].covered).toBe(true);
    expect(exact.months[0].shortfall.toFixed()).toBe("0");

    const under = projectLiquidityCoverage({
      horizonMonths: 1,
      currency: "USD",
      reserves: [{ id: "a", label: "a", balance: "99.99" }],
      obligations: [{ id: "x", label: "x", category: "pe-call", amount: "100", month: 0 }],
    });
    expect(under.months[0].covered).toBe(false);
    expect(under.months[0].shortfall.toFixed()).toBe("0.01");
    expect(under.summary.firstShortfallMonth).toBe(0);
  });
});
