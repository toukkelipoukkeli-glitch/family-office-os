import { describe, expect, it } from "vitest";

import { buildCurrencyModel } from "./view";

describe("buildCurrencyModel", () => {
  it("defaults to the seeded EUR portfolio with a 50% uniform hedge", () => {
    const m = buildCurrencyModel();
    expect(m.base).toBe("EUR");
    expect(m.hedgeRatio).toBe(0.5);
    expect(m.kpis.totalBase).toBe(17800000);
    expect(m.kpis.foreignBase).toBe(11800000);
  });

  it("derives foreign share and residual share as fractions of total", () => {
    const m = buildCurrencyModel();
    // 11.8M / 17.8M.
    expect(m.kpis.foreignShare).toBeCloseTo(11800000 / 17800000, 10);
    // At 50% hedge, residual = 5.9M.
    expect(m.kpis.residualBase).toBe(5900000);
    expect(m.kpis.residualShare).toBeCloseTo(5900000 / 17800000, 10);
    expect(m.kpis.effectiveHedgeRatio).toBeCloseTo(0.5, 10);
  });

  it("exposure rows sum (weights) to 1 and put the base first", () => {
    const m = buildCurrencyModel();
    expect(m.exposures[0].currency).toBe("EUR");
    expect(m.exposures[0].isBase).toBe(true);
    const weightSum = m.exposures.reduce((a, r) => a + r.weight, 0);
    expect(weightSum).toBeCloseTo(1, 10);
    // Six currency buckets.
    expect(m.exposures).toHaveLength(6);
  });

  it("hedge rows cover the five foreign currencies, largest gross first", () => {
    const m = buildCurrencyModel();
    expect(m.hedges).toHaveLength(5);
    expect(m.hedges[0].currency).toBe("USD"); // 6.5M is the largest
    for (let i = 1; i < m.hedges.length; i++) {
      expect(m.hedges[i - 1].grossBase).toBeGreaterThanOrEqual(
        m.hedges[i].grossBase,
      );
    }
  });

  it("reports a negative annual cost (net carry earned) at full USD-heavy hedge", () => {
    const m = buildCurrencyModel({ policy: { defaultRatio: 1 } });
    // Total cost from the engine test: -10,025 EUR/yr.
    expect(m.kpis.annualCost).toBe(-10025);
    expect(m.kpis.annualCostBps).toBeCloseTo((-10025 / 17800000) * 10000, 6);
  });

  it("at a 0% hedge leaves the full foreign exposure and costs nothing", () => {
    const m = buildCurrencyModel({ policy: { defaultRatio: 0 } });
    expect(m.kpis.residualBase).toBe(11800000);
    expect(m.kpis.effectiveHedgeRatio).toBe(0);
    expect(m.kpis.annualCost).toBe(0);
    for (const h of m.hedges) {
      expect(h.ratio).toBe(0);
      expect(h.residualBase).toBe(h.grossBase);
      expect(h.annualCost).toBe(0);
    }
  });

  it("honours per-currency overrides in the policy", () => {
    const m = buildCurrencyModel({
      policy: { defaultRatio: 0, overrides: { USD: 1 } },
    });
    const usd = m.hedges.find((h) => h.currency === "USD")!;
    expect(usd.ratio).toBe(1);
    expect(usd.residualBase).toBe(0);
    const gbp = m.hedges.find((h) => h.currency === "GBP")!;
    expect(gbp.ratio).toBe(0);
  });
});
