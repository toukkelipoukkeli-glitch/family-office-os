import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import { Money } from "../money";
import {
  applyBrackets,
  estimateTax,
  TaxEstimateError,
  type RateSchedule,
} from "./taxestimate";

/**
 * Independent adversarial coverage for the m9 tax estimator. These tests probe
 * boundary conditions, exact cross-class netting edges, numeric-input forms and
 * reconciliation invariants that the primary suite does not pin down. They are
 * deterministic and offline (no fixtures hit live data).
 */

const USD = "USD";
const usd = (v: string) => Money.of(v, USD);

const schedule: RateSchedule = {
  ordinary: [
    { from: "0", rate: "0.10" },
    { from: "10000", rate: "0.20" },
    { from: "50000", rate: "0.30" },
  ],
  longTerm: [
    { from: "0", rate: "0.00" },
    { from: "40000", rate: "0.15" },
  ],
  capitalLossOrdinaryOffsetCap: "3000",
};

describe("applyBrackets — boundary & numeric-form adversarial", () => {
  it("accepts numeric (not just string) bracket bounds and rates", () => {
    const r = applyBrackets(usd("25000"), [
      { from: 0, rate: 0.1 },
      { from: 10000, rate: 0.2 },
    ]);
    // 10000@10% + 15000@20% = 1000 + 3000 = 4000.
    expect(r.tax.toString()).toBe("4000 USD");
  });

  it("reports the marginal rate of the bracket the base lands exactly on", () => {
    // Base ends exactly at the 10000 boundary -> still in the first bracket.
    const r = applyBrackets(usd("10000"), schedule.ordinary);
    expect(r.tax.toString()).toBe("1000 USD");
    expect(r.marginalRate.toString()).toBe("0.1");
    // One cent over the boundary tips marginal into the next bracket.
    const r2 = applyBrackets(usd("10000.01"), schedule.ordinary);
    expect(r2.marginalRate.toString()).toBe("0.2");
  });

  it("does not double-count when the base sits entirely inside one bracket far up", () => {
    // floor 50000 (top open bracket), base 5000 -> all @30%.
    const r = applyBrackets(usd("5000"), schedule.ordinary, {
      floor: usd("50000"),
    });
    expect(r.tax.toString()).toBe("1500 USD");
    expect(r.perBracket).toHaveLength(1);
    expect(r.perBracket[0].rate.toString()).toBe("0.3");
  });

  it("keeps decimal precision on fractional rates (no float drift)", () => {
    const r = applyBrackets(usd("33333.33"), [{ from: "0", rate: "0.37" }]);
    // 33333.33 * 0.37 = 12333.3321 exactly.
    expect(r.tax.amount.equals(new Decimal("12333.3321"))).toBe(true);
  });

  it("rejects a non-finite rate", () => {
    expect(() =>
      applyBrackets(usd("100"), [{ from: "0", rate: "Infinity" }]),
    ).toThrow(TaxEstimateError);
  });

  it("rejects a floor whose currency differs from the taxable base", () => {
    expect(() =>
      applyBrackets(usd("1000"), schedule.ordinary, {
        floor: Money.of("5000", "EUR"),
      }),
    ).toThrow(/floor currency/);
  });
});

describe("estimateTax — exact cross-class netting edges", () => {
  it("nets a short-term loss that exactly cancels the long-term gain to zero", () => {
    const est = estimateTax(
      {
        currency: USD,
        year: 2024,
        realized: { shortTermGain: usd("-15000"), longTermGain: usd("15000") },
      },
      schedule,
    );
    expect(est.netShortTerm.isZero()).toBe(true);
    expect(est.netLongTerm.isZero()).toBe(true);
    expect(est.netCapitalLoss.isZero()).toBe(true);
    expect(est.taxableShortTermGain.isZero()).toBe(true);
    expect(est.taxableLongTermGain.isZero()).toBe(true);
    expect(est.totalTax.isZero()).toBe(true);
  });

  it("leaves residual long-term gain when the short-term loss is smaller", () => {
    const est = estimateTax(
      {
        currency: USD,
        year: 2024,
        realized: { shortTermGain: usd("-5000"), longTermGain: usd("20000") },
      },
      schedule,
    );
    expect(est.netShortTerm.isZero()).toBe(true);
    expect(est.netLongTerm.toString()).toBe("15000 USD");
    expect(est.taxableLongTermGain.toString()).toBe("15000 USD");
    expect(est.netCapitalLoss.isZero()).toBe(true);
  });

  it("folds harvested losses into BOTH classes before cross-netting", () => {
    // ST 8000 - 3000 harvested = 5000 net ST.
    // LT 2000 - 9000 harvested = -7000 net LT loss.
    // Cross-net: 5000 of the LT loss kills the ST gain; 2000 LT loss residual.
    const est = estimateTax(
      {
        currency: USD,
        year: 2024,
        realized: { shortTermGain: usd("8000"), longTermGain: usd("2000") },
        harvestedShortTermLoss: usd("3000"),
        harvestedLongTermLoss: usd("9000"),
        ordinaryIncome: usd("40000"),
      },
      schedule,
    );
    expect(est.netShortTerm.isZero()).toBe(true);
    expect(est.netLongTerm.toString()).toBe("-2000 USD");
    expect(est.netCapitalLoss.toString()).toBe("2000 USD");
    // Under the 3000 cap -> all 2000 offsets ordinary, nothing carried.
    expect(est.capitalLossUsedAgainstOrdinary.toString()).toBe("2000 USD");
    expect(est.capitalLossCarryforward.isZero()).toBe(true);
    expect(est.taxableOrdinaryIncome.toString()).toBe("38000 USD");
  });
});

describe("estimateTax — reconciliation invariants", () => {
  const cases = [
    {
      currency: USD,
      year: 2024,
      realized: { shortTermGain: usd("40000"), longTermGain: usd("90000") },
      harvestedLongTermLoss: usd("12000"),
      ordinaryIncome: usd("180000"),
      deductibleFees: usd("9000"),
    },
    {
      currency: USD,
      year: 2024,
      realized: { shortTermGain: usd("-25000"), longTermGain: usd("5000") },
      ordinaryIncome: usd("80000"),
    },
  ] as const;

  it("totalTax always equals the sum of its three component taxes", () => {
    for (const inputs of cases) {
      const est = estimateTax(inputs, schedule);
      const recomputed = est.ordinaryIncomeTax.tax
        .plus(est.shortTermTax.tax)
        .plus(est.longTermTax.tax);
      expect(recomputed.equals(est.totalTax)).toBe(true);
    }
  });

  it("each BracketTax's slices reconcile to its taxable base and tax", () => {
    const est = estimateTax(cases[0], schedule);
    for (const bt of [est.ordinaryIncomeTax, est.shortTermTax, est.longTermTax]) {
      const sliceTax = bt.perBracket.reduce(
        (a, s) => a.plus(s.tax),
        Money.zero(USD),
      );
      const sliceBase = bt.perBracket.reduce(
        (a, s) => a.plus(s.amountInBracket),
        Money.zero(USD),
      );
      expect(sliceTax.equals(bt.tax)).toBe(true);
      expect(sliceBase.equals(bt.taxable)).toBe(true);
    }
  });

  it("carries forward capital loss that exceeds the ordinary income available to absorb it", () => {
    // Net loss 3000, cap 3000, but only 1000 of ordinary income exists.
    // Only 1000 can offset ordinary; the other 2000 must carry forward.
    const est = estimateTax(
      {
        currency: USD,
        year: 2024,
        realized: { shortTermGain: usd("-3000"), longTermGain: usd("0") },
        ordinaryIncome: usd("1000"),
      },
      schedule,
    );
    expect(est.capitalLossUsedAgainstOrdinary.toString()).toBe("1000 USD");
    expect(est.capitalLossCarryforward.toString()).toBe("2000 USD");
    expect(est.taxableOrdinaryIncome.isZero()).toBe(true);
    // Reconciliation must still hold.
    expect(
      est.capitalLossUsedAgainstOrdinary
        .plus(est.capitalLossCarryforward)
        .equals(est.netCapitalLoss),
    ).toBe(true);
  });

  it("carries forward the whole loss when there is no ordinary income at all", () => {
    const est = estimateTax(
      {
        currency: USD,
        year: 2024,
        realized: { shortTermGain: usd("-2500"), longTermGain: usd("0") },
      },
      schedule,
    );
    expect(est.capitalLossUsedAgainstOrdinary.isZero()).toBe(true);
    expect(est.capitalLossCarryforward.toString()).toBe("2500 USD");
  });

  it("offset is reduced by fees that shrink the available ordinary base", () => {
    // Income 4000 - fees 2500 = 1500 ordinary base; loss 5000, cap 3000.
    // Only 1500 can be absorbed; 3500 carries forward.
    const est = estimateTax(
      {
        currency: USD,
        year: 2024,
        realized: { shortTermGain: usd("-5000"), longTermGain: usd("0") },
        ordinaryIncome: usd("4000"),
        deductibleFees: usd("2500"),
      },
      schedule,
    );
    expect(est.capitalLossUsedAgainstOrdinary.toString()).toBe("1500 USD");
    expect(est.capitalLossCarryforward.toString()).toBe("3500 USD");
    expect(est.taxableOrdinaryIncome.isZero()).toBe(true);
  });

  it("net capital loss always reconciles to used-against-ordinary + carryforward", () => {
    for (const inputs of cases) {
      const est = estimateTax(inputs, schedule);
      expect(
        est.capitalLossUsedAgainstOrdinary
          .plus(est.capitalLossCarryforward)
          .equals(est.netCapitalLoss),
      ).toBe(true);
    }
  });
});

describe("estimateTax — additional validation", () => {
  it("treats a negative realized short-term value as a valid loss, not an error", () => {
    // A negative realized gain is a legitimate loss, not an error.
    expect(() =>
      estimateTax(
        {
          currency: USD,
          year: 2024,
          realized: { shortTermGain: usd("-1000"), longTermGain: usd("0") },
        },
        schedule,
      ),
    ).not.toThrow();
  });

  it("rejects negative ordinary income", () => {
    expect(() =>
      estimateTax(
        { currency: USD, year: 2024, ordinaryIncome: usd("-1") },
        schedule,
      ),
    ).toThrow(/ordinaryIncome must be non-negative/);
  });

  it("rejects negative deductible fees", () => {
    expect(() =>
      estimateTax(
        { currency: USD, year: 2024, deductibleFees: usd("-1") },
        schedule,
      ),
    ).toThrow(/deductibleFees must be non-negative/);
  });

  it("rejects a negative capital-loss offset cap", () => {
    expect(() =>
      estimateTax(
        { currency: USD, year: 2024 },
        { ...schedule, capitalLossOrdinaryOffsetCap: "-3000" },
      ),
    ).toThrow(TaxEstimateError);
  });

  it("rejects a currency mismatch on harvested losses", () => {
    expect(() =>
      estimateTax(
        {
          currency: USD,
          year: 2024,
          harvestedLongTermLoss: Money.of("100", "EUR"),
        },
        schedule,
      ),
    ).toThrow(/does not match/);
  });
});
