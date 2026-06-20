import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import { projectLiquidityCoverage } from "./engine";

/**
 * Adversarial / property tests for the coverage engine: the invariants that must
 * hold for *any* input, not just the seeded fixture.
 */
describe("liquidity coverage invariants", () => {
  it("buffer is conserved: closing = max(opening + new − obligation, 0)", () => {
    const p = projectLiquidityCoverage({
      horizonMonths: 4,
      currency: "USD",
      reserves: [
        { id: "a", label: "a", balance: "1000", availableFromMonth: 0 },
        { id: "b", label: "b", balance: "1000", availableFromMonth: 2 },
      ],
      obligations: [
        { id: "x", label: "x", category: "pe-call", amount: "600", month: 1 },
        { id: "y", label: "y", category: "pe-call", amount: "300", month: 3 },
      ],
    });
    // Month 0: 1000 avail, no ob → close 1000.
    // Month 1: 1000 avail, ob 600 → close 400.
    // Month 2: 400 + 1000 = 1400 avail → close 1400.
    // Month 3: 1400 avail, ob 300 → close 1100.
    expect(p.months.map((m) => m.closingLiquidity.toFixed())).toEqual([
      "1000",
      "400",
      "1400",
      "1100",
    ]);
  });

  it("never funds an obligation from negative cash — buffer floors at zero", () => {
    const p = projectLiquidityCoverage({
      horizonMonths: 2,
      currency: "USD",
      reserves: [{ id: "a", label: "a", balance: "100" }],
      obligations: [
        { id: "x", label: "x", category: "pe-call", amount: "500", month: 0 },
        { id: "y", label: "y", category: "pe-call", amount: "10", month: 1 },
      ],
    });
    // Month 0 shortfall 400, buffer floors to 0; month 1 sees 0 buffer.
    expect(p.months[0].closingLiquidity.toFixed()).toBe("0");
    expect(p.months[1].availableLiquidity.toFixed()).toBe("0");
    expect(p.months[1].shortfall.toFixed()).toBe("10");
  });

  it("total shortfall equals the sum of monthly shortfalls", () => {
    const p = projectLiquidityCoverage({
      horizonMonths: 3,
      currency: "USD",
      reserves: [{ id: "a", label: "a", balance: "100" }],
      obligations: [
        { id: "x", label: "x", category: "pe-call", amount: "300", month: 0 },
        { id: "z", label: "z", category: "pe-call", amount: "50", month: 2 },
      ],
    });
    const sum = p.months.reduce((acc, m) => acc.plus(m.shortfall), new Decimal(0));
    expect(p.summary.totalShortfall.toFixed()).toBe(sum.toFixed());
  });

  it("the worst month has the minimum monthly coverage ratio", () => {
    const p = projectLiquidityCoverage({
      horizonMonths: 3,
      currency: "USD",
      reserves: [{ id: "a", label: "a", balance: "1000" }],
      obligations: [
        { id: "x", label: "x", category: "pe-call", amount: "100", month: 0 },
        { id: "y", label: "y", category: "pe-call", amount: "800", month: 1 },
      ],
    });
    const ratios = p.months
      .filter((m) => m.coverageRatio !== null)
      .map((m) => m.coverageRatio!.toNumber());
    const min = Math.min(...ratios);
    expect(p.summary.worstCoverageRatio?.toNumber()).toBe(min);
  });

  it("fullyCovered is exactly equivalent to a zero total shortfall", () => {
    const covered = projectLiquidityCoverage({
      horizonMonths: 1,
      currency: "USD",
      reserves: [{ id: "a", label: "a", balance: "1000" }],
      obligations: [{ id: "x", label: "x", category: "pe-call", amount: "100", month: 0 }],
    });
    const short = projectLiquidityCoverage({
      horizonMonths: 1,
      currency: "USD",
      reserves: [{ id: "a", label: "a", balance: "10" }],
      obligations: [{ id: "x", label: "x", category: "pe-call", amount: "100", month: 0 }],
    });
    expect(covered.summary.fullyCovered).toBe(covered.summary.totalShortfall.isZero());
    expect(short.summary.fullyCovered).toBe(short.summary.totalShortfall.isZero());
    expect(covered.summary.fullyCovered).toBe(true);
    expect(short.summary.fullyCovered).toBe(false);
  });

  it("is deterministic: identical inputs yield identical projections", () => {
    const input = {
      horizonMonths: 2,
      currency: "USD",
      reserves: [{ id: "a", label: "a", balance: "1000", haircut: "0.05" }],
      obligations: [
        { id: "x", label: "x", category: "pe-call", amount: "100", month: 1 },
      ],
    } as const;
    expect(JSON.stringify(projectLiquidityCoverage(input))).toBe(
      JSON.stringify(projectLiquidityCoverage(input)),
    );
  });
});
