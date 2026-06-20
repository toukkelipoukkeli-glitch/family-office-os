/**
 * Adversarial / edge-case hardening for the m7-fees engine, added by the
 * independent tester. These probe boundaries the primary suite does not:
 * extreme fee rates, sub-(-100%) gross factors, exact carry precision, and
 * hurdle interactions. All deterministic and offline.
 */
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

const sched = (over: Partial<FeeSchedule> = {}): FeeSchedule => ({
  id: "x",
  name: "X",
  category: "c",
  managementFee: "0",
  fundExpenses: "0",
  carry: "0",
  ...over,
});

describe("performanceFee — boundaries", () => {
  it("charges carry on the full gain when the hurdle is exactly zero (explicit)", () => {
    const fee = performanceFee(
      new Decimal("1000000"),
      new Decimal("0.07"),
      new Decimal("0.10"),
      new Decimal("0"),
    );
    // gain 70,000 * 10% = 7,000
    expect(fee.toString()).toBe("7000");
  });

  it("is exact for a fractional excess (no float drift)", () => {
    // invested 333,333.33; gross 10%; hurdle 0 -> gain 33,333.333; carry 15%
    const fee = performanceFee(
      new Decimal("333333.33"),
      new Decimal("0.10"),
      new Decimal("0.15"),
      new Decimal("0"),
    );
    // 33,333.333 * 0.15 = 4999.99995 exactly
    expect(fee.toString()).toBe("4999.99995");
  });

  it("returns zero (not negative) when carry is zero even on a huge gain", () => {
    const fee = performanceFee(
      new Decimal("1000000"),
      new Decimal("1.0"),
      new Decimal("0"),
      new Decimal("0"),
    );
    expect(fee.toString()).toBe("0");
  });
});

describe("positionCost — extreme but valid inputs", () => {
  it("a 100%-carry, no-hurdle structure takes the entire gain as carry", () => {
    const cost = positionCost({
      schedule: sched({ carry: "1", hurdle: "0" }),
      invested: "1000000",
      grossReturn: "0.20",
    });
    expect(cost.performanceCost.toString()).toBe("200000");
    expect(cost.totalCost.toString()).toBe("200000");
    expect(cost.effectiveRate.toString()).toBe("0.2");
  });

  it("a position with a gross loss owes no carry but still owes mgmt/expenses", () => {
    const cost = positionCost({
      schedule: sched({ managementFee: "0.02", fundExpenses: "0.005", carry: "0.2", hurdle: "0.08" }),
      invested: "1000000",
      grossReturn: "-0.30",
    });
    expect(cost.performanceCost.toString()).toBe("0");
    expect(cost.managementCost.toString()).toBe("20000");
    expect(cost.fundExpenseCost.toString()).toBe("5000");
    expect(cost.totalCost.toString()).toBe("25000");
  });

  it("does not throw on a negative gross return (a loss is a valid input)", () => {
    expect(() =>
      positionCost({ schedule: sched(), invested: "1000", grossReturn: "-0.5" }),
    ).not.toThrow();
  });

  it("rejects a non-finite gross return", () => {
    expect(() =>
      positionCost({ schedule: sched(), invested: "1000", grossReturn: "NaN" }),
    ).toThrow(FeeError);
  });
});

describe("portfolioCost — single-position blended rate identity", () => {
  it("blended rate of one position equals that position's effective rate", () => {
    const p: Position = {
      schedule: sched({ managementFee: "0.01", fundExpenses: "0.002", carry: "0.2", hurdle: "0" }),
      invested: "2000000",
      grossReturn: "0.10",
    };
    const cost = portfolioCost([p]);
    expect(cost.blendedRate.equals(cost.positions[0].effectiveRate)).toBe(true);
  });
});

describe("projectFeeDrag — extreme rates", () => {
  it("feeRate of exactly 1 collapses net wealth to zero each year (no throw)", () => {
    const drag = projectFeeDrag("1000000", "0.10", "1", 5);
    // year 0 keeps the initial; every year after compounds netFactor=0 -> 0
    expect(drag.points[0].net.toString()).toBe("1000000");
    expect(drag.points[1].net.toString()).toBe("0");
    expect(drag.terminalNet.toString()).toBe("0");
    expect(drag.dragShareOfProfit.greaterThan(0)).toBe(true);
  });

  it("a gross factor below -100% (return < -1) is handled by integer pow", () => {
    // grossReturn -1.5 -> grossFactor -0.5; year 2 = initial * 0.25
    const drag = projectFeeDrag("1000000", "-1.5", "0", 2);
    expect(drag.points[2].gross.toString()).toBe("250000");
    // no gross profit (terminal < initial) -> share is zero, never negative
    expect(drag.dragShareOfProfit.toString()).toBe("0");
  });

  it("drag share never exceeds the fee-free profit and stays in [0,1) for positive returns", () => {
    const drag = projectFeeDrag("5000000", "0.07", "0.015", 25);
    expect(drag.dragShareOfProfit.greaterThanOrEqualTo(0)).toBe(true);
    expect(drag.dragShareOfProfit.lessThan(1)).toBe(true);
  });
});
