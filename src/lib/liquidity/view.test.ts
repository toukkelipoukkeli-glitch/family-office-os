import { describe, expect, it } from "vitest";

import { seededLiquidityInput, LIQUIDITY_HORIZON } from "./fixtures";
import { buildLiquidityModel, seededLiquidityModel } from "./view";

describe("buildLiquidityModel — seeded family", () => {
  const model = seededLiquidityModel;

  it("carries the currency and a full month series", () => {
    expect(model.currency).toBe("USD");
    expect(model.months).toHaveLength(LIQUIDITY_HORIZON);
    expect(model.months[0].period).toBe("2024-07");
    expect(model.months.at(-1)?.period).toBe("2026-06");
  });

  it("reduces the headline coverage KPIs to plain numbers", () => {
    // 9,190,000 deployable vs 4,560,000 obligations → ~2.0154 coverage.
    expect(model.kpis.totalLiquidity).toBe(9190000);
    expect(model.kpis.grossLiquidity).toBe(10000000);
    expect(model.kpis.totalObligations).toBe(4560000);
    expect(model.kpis.totalCalls).toBe(3700000);
    expect(model.kpis.totalBurn).toBe(860000);
    expect(model.kpis.coverageRatio).toBeCloseTo(2.0154, 4);
    expect(model.kpis.fullyCovered).toBe(true);
    expect(model.kpis.firstShortfallPeriod).toBeNull();
    expect(model.kpis.totalShortfall).toBe(0);
  });

  it("locates the worst-coverage month", () => {
    // Tightest covered month is the 2025-12 call (#3).
    expect(model.kpis.worstPeriod).toBe("2025-12");
    expect(model.kpis.worstCoverageRatio).toBeCloseTo(5.0905, 4);
  });

  it("breaks reserves down by tier with haircuts", () => {
    expect(model.reserves.map((r) => r.id)).toEqual(["cash", "tbills", "equities"]);
    const eq = model.reserves.find((r) => r.id === "equities");
    expect(eq?.gross).toBe(5000000);
    expect(eq?.deployable).toBe(4250000);
    expect(eq?.haircut).toBeCloseTo(0.15, 6);
    expect(eq?.availableFromMonth).toBe(1);
  });

  it("each month exposes coverage, shortfall and closing buffer", () => {
    const callMonth = model.months.find((m) => m.period === "2024-09");
    expect(callMonth?.obligation).toBe(1015000); // 1,000,000 call + 15,000 burn
    expect(callMonth?.coverageRatio).not.toBeNull();
    expect(callMonth?.shortfall).toBe(0);
    expect(callMonth?.covered).toBe(true);
  });
});

describe("buildLiquidityModel — stressed input surfaces a shortfall", () => {
  // Slash reserves so the family can no longer fund the calls.
  const stressed = buildLiquidityModel({
    input: {
      ...seededLiquidityInput,
      reserves: [
        { id: "cash", label: "Operating cash", balance: "500000", haircut: "0" },
      ],
    },
  });

  it("reports a shortfall and the period it first bites", () => {
    expect(stressed.kpis.fullyCovered).toBe(false);
    expect(stressed.kpis.totalShortfall).toBeGreaterThan(0);
    expect(stressed.kpis.firstShortfallPeriod).not.toBeNull();
    // Coverage well under 1×.
    expect(stressed.kpis.coverageRatio).toBeLessThan(1);
  });
});
