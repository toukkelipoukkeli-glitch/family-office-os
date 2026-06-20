import { describe, expect, it } from "vitest";

import {
  buildCashflowModel,
  seededCashflowModel,
} from "./view";
import { seededCashflowInput } from "./fixtures";

describe("buildCashflowModel — seeded household", () => {
  it("exposes hand-computed headline KPIs as plain numbers", () => {
    const { kpis, currency, months } = seededCashflowModel;
    expect(currency).toBe("USD");
    expect(months).toHaveLength(24);

    // Hand-computed against an independent model (see fixtures doc comments):
    expect(kpis.openingBalance).toBe(4_000_000);
    expect(kpis.totalInflows).toBe(2_552_000);
    expect(kpis.totalOutflows).toBe(5_172_000);
    expect(kpis.netFlow).toBe(2_552_000 - 5_172_000);
    expect(kpis.endingBalance).toBe(4_000_000 + (2_552_000 - 5_172_000));
    expect(kpis.endingBalance).toBe(1_380_000);

    // Minimum balance occurs at month 17 (2025-12 call clears in 2025-12... the
    // big 1.2M call lands month 17, the deepest dip), and never goes negative.
    expect(kpis.minBalance).toBe(480_000);
    expect(kpis.minBalancePeriod).toBe("2025-12");
    expect(kpis.firstShortfallPeriod).toBeNull();
  });

  it("produces the exact monthly closing-balance series", () => {
    const closes = seededCashflowModel.months.map((m) => m.closingBalance);
    expect(closes).toEqual([
      3952000, 3971000, 2990000, 3002000, 3021000, 3040000, 3052000, 3071000,
      1590000, 1602000, 1621000, 1640000, 1592000, 1611000, 1630000, 1642000,
      1661000, 480000, 492000, 511000, 1330000, 1342000, 1361000, 1380000,
    ]);
    // The opening balance of each month equals the prior month's close.
    const months = seededCashflowModel.months;
    for (let i = 1; i < months.length; i++) {
      expect(months[i].openingBalance).toBe(months[i - 1].closingBalance);
    }
  });

  it("rolls flows up by category, largest first", () => {
    const cats = seededCashflowModel.categories;
    // Sorted descending by total.
    const totals = cats.map((c) => c.total);
    expect(totals).toEqual([...totals].sort((a, b) => b - a));

    const byKey = new Map(
      cats.map((c) => [`${c.direction}:${c.category}`, c.total]),
    );
    // Salary: 45,000 × 24 months = 1,080,000.
    expect(byKey.get("inflow:salary")).toBe(1_080_000);
    // Living: 38,000 × 24 = 912,000.
    expect(byKey.get("outflow:living")).toBe(912_000);
    // PE calls in window: 1,000,000 + 1,500,000 + 1,200,000 = 3,700,000.
    expect(byKey.get("outflow:pe-call")).toBe(3_700_000);
    // PE distributions in window: 800,000.
    expect(byKey.get("inflow:pe-distribution")).toBe(800_000);
    // Dividends: 30,000 × 8 quarters = 240,000.
    expect(byKey.get("inflow:dividends")).toBe(240_000);
  });

  it("category totals reconcile with the summary totals", () => {
    const cats = seededCashflowModel.categories;
    const inSum = cats
      .filter((c) => c.direction === "inflow")
      .reduce((a, c) => a + c.total, 0);
    const outSum = cats
      .filter((c) => c.direction === "outflow")
      .reduce((a, c) => a + c.total, 0);
    expect(inSum).toBe(seededCashflowModel.kpis.totalInflows);
    expect(outSum).toBe(seededCashflowModel.kpis.totalOutflows);
  });
});

describe("buildCashflowModel — shortfall warning", () => {
  it("flags the first month cash goes negative", () => {
    // Same seeded household, but with a thin opening cushion so a PE call
    // drives the balance negative — the liquidity early-warning case.
    const model = buildCashflowModel({
      input: { ...seededCashflowInput, openingBalance: "250000" },
    });
    expect(model.kpis.firstShortfallPeriod).not.toBeNull();
    // Month 2 (2024-09) is the first call; opening 250k can't absorb the 1M call.
    expect(model.kpis.firstShortfallPeriod).toBe("2024-09");
    expect(model.kpis.minBalance).toBeLessThan(0);
  });
});
