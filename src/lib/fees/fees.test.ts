import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import {
  FeeError,
  performanceFee,
  portfolioCost,
  positionCost,
  projectFeeDrag,
  type FeeSchedule,
  type Position,
} from "./fees";

const noCarry: FeeSchedule = {
  id: "f1",
  name: "Index",
  category: "Passive",
  managementFee: "0.001",
  fundExpenses: "0.0005",
  carry: "0",
};

const twoAndTwenty: FeeSchedule = {
  id: "f2",
  name: "PE",
  category: "Private equity",
  managementFee: "0.02",
  fundExpenses: "0.005",
  carry: "0.20",
  hurdle: "0.08",
};

describe("performanceFee", () => {
  it("charges carry only on profit above the hurdle", () => {
    // invested 1,000,000; gross 18%; hurdle 8% -> excess 10% = 100,000; carry 20% = 20,000
    const fee = performanceFee(
      new Decimal("1000000"),
      new Decimal("0.18"),
      new Decimal("0.20"),
      new Decimal("0.08"),
    );
    expect(fee.toString()).toBe("20000");
  });

  it("is zero when the gain does not clear the hurdle", () => {
    const fee = performanceFee(
      new Decimal("1000000"),
      new Decimal("0.08"), // exactly the hurdle
      new Decimal("0.20"),
      new Decimal("0.08"),
    );
    expect(fee.toString()).toBe("0");
  });

  it("is zero when the gain is below the hurdle", () => {
    const fee = performanceFee(
      new Decimal("1000000"),
      new Decimal("0.05"),
      new Decimal("0.20"),
      new Decimal("0.08"),
    );
    expect(fee.toString()).toBe("0");
  });

  it("is zero on a loss", () => {
    const fee = performanceFee(
      new Decimal("1000000"),
      new Decimal("-0.10"),
      new Decimal("0.20"),
      new Decimal("0"),
    );
    expect(fee.toString()).toBe("0");
  });

  it("with no hurdle charges carry on the whole gain", () => {
    const fee = performanceFee(
      new Decimal("500000"),
      new Decimal("0.10"),
      new Decimal("0.20"),
      new Decimal("0"),
    );
    // gain 50,000; carry 20% = 10,000
    expect(fee.toString()).toBe("10000");
  });
});

describe("positionCost", () => {
  it("computes management + expenses with no carry", () => {
    const cost = positionCost({
      schedule: noCarry,
      invested: "1000000",
      grossReturn: "0.08",
    });
    expect(cost.managementCost.toString()).toBe("1000"); // 0.1%
    expect(cost.fundExpenseCost.toString()).toBe("500"); // 0.05%
    expect(cost.performanceCost.toString()).toBe("0");
    expect(cost.totalCost.toString()).toBe("1500");
    // effective rate = 1500 / 1,000,000 = 0.0015
    expect(cost.effectiveRate.toString()).toBe("0.0015");
  });

  it("computes a full 2-and-20 position with carry over the hurdle", () => {
    const cost = positionCost({
      schedule: twoAndTwenty,
      invested: "1800000",
      grossReturn: "0.18",
    });
    // mgmt: 1,800,000 * 0.02 = 36,000
    expect(cost.managementCost.toString()).toBe("36000");
    // expenses: 1,800,000 * 0.005 = 9,000
    expect(cost.fundExpenseCost.toString()).toBe("9000");
    // carry: gain 324,000; hurdle 144,000; excess 180,000; 20% = 36,000
    expect(cost.performanceCost.toString()).toBe("36000");
    expect(cost.totalCost.toString()).toBe("81000");
    // effective: 81,000 / 1,800,000 = 0.045
    expect(cost.effectiveRate.toString()).toBe("0.045");
  });

  it("treats a zero invested position as zero cost and zero rate", () => {
    const cost = positionCost({
      schedule: twoAndTwenty,
      invested: "0",
      grossReturn: "0.5",
    });
    expect(cost.totalCost.toString()).toBe("0");
    expect(cost.effectiveRate.toString()).toBe("0");
  });

  it("does not lose precision (exact decimal arithmetic)", () => {
    const cost = positionCost({
      schedule: {
        id: "p",
        name: "p",
        category: "c",
        managementFee: "0.0033",
        fundExpenses: "0",
        carry: "0",
      },
      invested: "1000000.10",
      grossReturn: "0",
    });
    // 1,000,000.10 * 0.0033 = 3300.00033 exactly
    expect(cost.managementCost.toString()).toBe("3300.00033");
  });

  it.each([
    ["negative invested", { invested: "-1" }],
    ["negative management fee", { schedule: { ...noCarry, managementFee: "-0.01" } }],
    ["negative carry", { schedule: { ...noCarry, carry: "-0.1" } }],
    ["non-finite invested", { invested: "Infinity" }],
  ])("throws FeeError on %s", (_label, override) => {
    const base: Position = {
      schedule: noCarry,
      invested: "1000",
      grossReturn: "0.1",
    };
    expect(() => positionCost({ ...base, ...override } as Position)).toThrow(
      FeeError,
    );
  });
});

describe("portfolioCost", () => {
  const positions: Position[] = [
    { schedule: noCarry, invested: "1000000", grossReturn: "0.08" },
    { schedule: twoAndTwenty, invested: "1800000", grossReturn: "0.18" },
  ];

  it("aggregates totals across the book", () => {
    const cost = portfolioCost(positions);
    expect(cost.totalInvested.toString()).toBe("2800000");
    // mgmt 1000 + 36000 = 37000
    expect(cost.totalManagement.toString()).toBe("37000");
    // expenses 500 + 9000 = 9500
    expect(cost.totalFundExpenses.toString()).toBe("9500");
    // perf 0 + 36000 = 36000
    expect(cost.totalPerformance.toString()).toBe("36000");
    // total 1500 + 81000 = 82500
    expect(cost.totalCost.toString()).toBe("82500");
  });

  it("blended rate equals total cost over total invested", () => {
    const cost = portfolioCost(positions);
    // 82500 / 2800000 = 0.029464285714...
    expect(cost.blendedRate.toNumber()).toBeCloseTo(82500 / 2800000, 12);
  });

  it("blended rate is the sum of component rates weighted by capital", () => {
    const cost = portfolioCost(positions);
    const recomputed = cost.totalCost.div(cost.totalInvested);
    expect(cost.blendedRate.equals(recomputed)).toBe(true);
  });

  it("handles an empty book without dividing by zero", () => {
    const cost = portfolioCost([]);
    expect(cost.totalInvested.toString()).toBe("0");
    expect(cost.totalCost.toString()).toBe("0");
    expect(cost.blendedRate.toString()).toBe("0");
  });

  it("totals are the exact sum of the per-position breakdown", () => {
    const cost = portfolioCost(positions);
    const sumMgmt = cost.positions.reduce(
      (a, p) => a.plus(p.managementCost),
      new Decimal(0),
    );
    expect(cost.totalManagement.equals(sumMgmt)).toBe(true);
  });
});

describe("projectFeeDrag", () => {
  it("produces years+1 points starting at the initial capital", () => {
    const drag = projectFeeDrag("1000000", "0.08", "0.01", 20);
    expect(drag.points).toHaveLength(21);
    expect(drag.points[0].year).toBe(0);
    expect(drag.points[0].gross.toString()).toBe("1000000");
    expect(drag.points[0].net.toString()).toBe("1000000");
    expect(drag.points[0].drag.toString()).toBe("0");
  });

  it("net compounds at (1+gross)(1-fee) and gross ignores the fee", () => {
    const drag = projectFeeDrag("1000", "0.10", "0.02", 1);
    // gross year1 = 1100; net = 1100 * 0.98 = 1078
    expect(drag.points[1].gross.toString()).toBe("1100");
    expect(drag.points[1].net.toString()).toBe("1078");
    expect(drag.points[1].drag.toString()).toBe("22");
  });

  it("with a zero fee the net and gross paths coincide and drag is zero", () => {
    const drag = projectFeeDrag("1000", "0.10", "0", 10);
    expect(drag.totalDrag.toString()).toBe("0");
    expect(drag.dragShareOfProfit.toString()).toBe("0");
    for (const p of drag.points) {
      expect(p.gross.equals(p.net)).toBe(true);
    }
  });

  it("compounds drag over a long horizon (fees eat a growing share)", () => {
    const drag = projectFeeDrag("1000000", "0.08", "0.02", 30);
    // After 30y the drag should be large and positive; fees consume a big
    // share of the gross profit.
    expect(drag.terminalGross.greaterThan(drag.terminalNet)).toBe(true);
    expect(drag.totalDrag.greaterThan(0)).toBe(true);
    expect(drag.dragShareOfProfit.greaterThan("0.3")).toBe(true);
    expect(drag.dragShareOfProfit.lessThan("1")).toBe(true);
  });

  it("dragShareOfProfit is zero when there is no gross profit", () => {
    const flat = projectFeeDrag("1000000", "0", "0.01", 10);
    expect(flat.dragShareOfProfit.toString()).toBe("0");
    const loss = projectFeeDrag("1000000", "-0.05", "0.01", 10);
    expect(loss.dragShareOfProfit.toString()).toBe("0");
  });

  it.each([
    ["fee above 1", ["1000", "0.1", "1.5", 5]],
    ["negative fee", ["1000", "0.1", "-0.1", 5]],
    ["zero years", ["1000", "0.1", "0.01", 0]],
    ["fractional years", ["1000", "0.1", "0.01", 2.5]],
    ["negative initial", ["-1000", "0.1", "0.01", 5]],
  ])("throws FeeError on %s", (_label, args) => {
    const [i, g, f, y] = args as [string, string, string, number];
    expect(() => projectFeeDrag(i, g, f, y)).toThrow(FeeError);
  });
});
