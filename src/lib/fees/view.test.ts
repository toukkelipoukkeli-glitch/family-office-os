import { describe, expect, it } from "vitest";

import { portfolioCost } from "./fees";
import { seededPositions } from "./fixtures";
import { buildFeeModel, seededFeeModel } from "./view";

describe("buildFeeModel", () => {
  it("KPIs match the underlying portfolio cost", () => {
    const cost = portfolioCost(seededPositions);
    expect(seededFeeModel.kpis.totalInvested).toBe(cost.totalInvested.toNumber());
    expect(seededFeeModel.kpis.totalAnnualCost).toBe(cost.totalCost.toNumber());
    expect(seededFeeModel.kpis.blendedRate).toBeCloseTo(
      cost.blendedRate.toNumber(),
      12,
    );
  });

  it("seeded total invested is the sum of the seeded positions (11M)", () => {
    expect(seededFeeModel.kpis.totalInvested).toBe(11_000_000);
  });

  it("orders funds most-expensive-first by total cost", () => {
    const totals = seededFeeModel.funds.map((f) => f.totalCost);
    const sorted = [...totals].sort((a, b) => b - a);
    expect(totals).toEqual(sorted);
    // The PE fund (full 2-and-20 over a big gain) should be the costliest.
    expect(seededFeeModel.funds[0].id).toBe("fee-private-equity");
  });

  it("composition slices sum to the total annual cost", () => {
    const sum = seededFeeModel.composition.reduce((a, s) => a + s.value, 0);
    expect(sum).toBeCloseTo(seededFeeModel.kpis.totalAnnualCost, 6);
    expect(seededFeeModel.composition.map((s) => s.key)).toEqual([
      "management",
      "fundExpenses",
      "performance",
    ]);
  });

  it("per-fund total equals the sum of its components", () => {
    for (const f of seededFeeModel.funds) {
      expect(f.managementCost + f.fundExpenseCost + f.performanceCost).toBeCloseTo(
        f.totalCost,
        6,
      );
    }
  });

  it("builds a drag series of horizon+1 points anchored at the initial", () => {
    expect(seededFeeModel.drag).toHaveLength(seededFeeModel.horizonYears + 1);
    expect(seededFeeModel.drag[0].year).toBe(0);
    expect(seededFeeModel.drag[0].gross).toBe(seededFeeModel.drag[0].net);
    const last = seededFeeModel.drag[seededFeeModel.drag.length - 1];
    expect(last.gross).toBeGreaterThan(last.net);
    expect(seededFeeModel.terminalDrag).toBeCloseTo(last.gross - last.net, 4);
  });

  it("drag grows monotonically and net never exceeds gross", () => {
    let prevDrag = -1;
    for (const p of seededFeeModel.drag) {
      expect(p.gross).toBeGreaterThanOrEqual(p.net);
      expect(p.drag).toBeGreaterThanOrEqual(prevDrag);
      prevDrag = p.drag;
    }
  });

  it("dragShareOfProfit is a sensible fraction between 0 and 1", () => {
    expect(seededFeeModel.kpis.dragShareOfProfit).toBeGreaterThan(0);
    expect(seededFeeModel.kpis.dragShareOfProfit).toBeLessThan(1);
  });

  it("respects custom inputs", () => {
    const model = buildFeeModel({
      positions: [seededPositions[0]],
      horizonYears: 5,
      dragInitial: 1_000_000,
      dragGrossReturn: "0.05",
    });
    expect(model.drag).toHaveLength(6);
    expect(model.funds).toHaveLength(1);
    expect(model.drag[0].gross).toBe(1_000_000);
  });
});
