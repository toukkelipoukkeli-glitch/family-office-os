import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import { Money } from "../money";
import { realizeGains } from "../taxlots";
import { sampleLedger as taxlotsLedger } from "../taxlots/fixtures";
import {
  applyBrackets,
  estimateTax,
  TaxEstimateError,
  type RateSchedule,
  type TaxYearInputs,
} from "./taxestimate";
import {
  lossYearInputs,
  sampleInputs,
  sampleSchedule,
  usLongTermBrackets2024Single,
  usOrdinaryBrackets2024Single,
} from "./fixtures";

const USD = "USD";
const usd = (v: string) => Money.of(v, USD);

/** A small, easy-to-hand-check flat-ish schedule for unit-level bracket tests. */
const simpleSchedule: RateSchedule = {
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

describe("applyBrackets", () => {
  it("taxes a base across multiple brackets and reconciles per-bracket", () => {
    // 25000 over [0,10000)@10% + [10000,50000)@20% = 1000 + 3000 = 4000.
    const r = applyBrackets(usd("25000"), simpleSchedule.ordinary);
    expect(r.tax.toString()).toBe("4000 USD");
    expect(r.marginalRate.toString()).toBe("0.2");
    // Per-bracket slices sum exactly to the total tax and to the taxable base.
    const sliceTax = r.perBracket.reduce(
      (a, s) => a.plus(s.tax),
      Money.zero(USD),
    );
    const sliceBase = r.perBracket.reduce(
      (a, s) => a.plus(s.amountInBracket),
      Money.zero(USD),
    );
    expect(sliceTax.equals(r.tax)).toBe(true);
    expect(sliceBase.equals(usd("25000"))).toBe(true);
    expect(r.effectiveRate.toString()).toBe("0.16"); // 4000/25000
  });

  it("stacks a base on top of a floor so it fills the marginal brackets", () => {
    // 5000 stacked on a 12000 floor lands fully in the 20% bracket.
    const stacked = applyBrackets(usd("5000"), simpleSchedule.ordinary, {
      floor: usd("12000"),
    });
    expect(stacked.tax.toString()).toBe("1000 USD"); // 5000 * 20%
    expect(stacked.marginalRate.toString()).toBe("0.2");
    // The same 5000 taxed from zero would be cheaper (it fills the 10% band).
    const fromZero = applyBrackets(usd("5000"), simpleSchedule.ordinary);
    expect(fromZero.tax.toString()).toBe("500 USD"); // 5000 * 10%
    expect(stacked.tax.greaterThan(fromZero.tax)).toBe(true);
  });

  it("spans a bracket boundary when stacked", () => {
    // floor 8000, base 4000 -> [8000,12000): [8000,10000)@10%=200, [10000,12000)@20%=400.
    const r = applyBrackets(usd("4000"), simpleSchedule.ordinary, {
      floor: usd("8000"),
    });
    expect(r.tax.toString()).toBe("600 USD");
  });

  it("returns zero tax and a zero marginal rate for a zero base", () => {
    const r = applyBrackets(usd("0"), simpleSchedule.ordinary);
    expect(r.tax.isZero()).toBe(true);
    expect(r.effectiveRate.isZero()).toBe(true);
    expect(r.marginalRate.isZero()).toBe(true);
    expect(r.perBracket).toHaveLength(0);
  });

  it("treats a negative base as zero", () => {
    const r = applyBrackets(usd("-5000"), simpleSchedule.ordinary);
    expect(r.tax.isZero()).toBe(true);
    expect(r.taxable.isZero()).toBe(true);
  });

  it("uses the top bracket for income above the last bound", () => {
    // 60000: 10000@10% + 40000@20% + 10000@30% = 1000+8000+3000 = 12000.
    const r = applyBrackets(usd("60000"), simpleSchedule.ordinary);
    expect(r.tax.toString()).toBe("12000 USD");
    expect(r.marginalRate.toString()).toBe("0.3");
  });

  it("rejects brackets that do not start at zero", () => {
    expect(() =>
      applyBrackets(usd("100"), [{ from: "10", rate: "0.1" }]),
    ).toThrow(TaxEstimateError);
  });

  it("rejects non-increasing bracket bounds", () => {
    expect(() =>
      applyBrackets(usd("100"), [
        { from: "0", rate: "0.1" },
        { from: "0", rate: "0.2" },
      ]),
    ).toThrow(/strictly increase/);
  });

  it("rejects negative rates and an empty schedule", () => {
    expect(() =>
      applyBrackets(usd("100"), [{ from: "0", rate: "-0.1" }]),
    ).toThrow(TaxEstimateError);
    expect(() => applyBrackets(usd("100"), [])).toThrow(/at least one/);
  });
});

describe("estimateTax — consolidated estimate (sample fixture oracle)", () => {
  const est = estimateTax(sampleInputs, sampleSchedule);

  it("nets the harvested long-term loss against realized long-term gain", () => {
    // 90000 realized LT - 12000 harvested LT loss = 78000.
    expect(est.netShortTerm.toString()).toBe("40000 USD");
    expect(est.netLongTerm.toString()).toBe("78000 USD");
    expect(est.netCapitalLoss.isZero()).toBe(true);
    expect(est.capitalLossUsedAgainstOrdinary.isZero()).toBe(true);
    expect(est.capitalLossCarryforward.isZero()).toBe(true);
  });

  it("deducts fees from ordinary income", () => {
    // 180000 - 9000 fees = 171000 taxable ordinary.
    expect(est.taxableOrdinaryIncome.toString()).toBe("171000 USD");
  });

  it("computes the ordinary-income tax to the cent", () => {
    expect(est.ordinaryIncomeTax.tax.toString()).toBe("34082.5 USD");
  });

  it("taxes the short-term gain at ordinary rates stacked on income", () => {
    // 40000 ST stacked on 171000 -> 20950@24% + 19050@32% = 5028 + 6096.
    expect(est.shortTermTax.tax.toString()).toBe("11124 USD");
    expect(est.shortTermTax.marginalRate.toString()).toBe("0.32");
  });

  it("taxes the long-term gain at the preferential 15% band", () => {
    // 78000 LT, fully inside the 15% LT band -> 11700.
    expect(est.longTermTax.tax.toString()).toBe("11700 USD");
    expect(est.longTermTax.marginalRate.toString()).toBe("0.15");
  });

  it("sums to the total estimated tax and reconciles the pieces", () => {
    expect(est.totalTax.toString()).toBe("56906.5 USD");
    const recomputed = est.ordinaryIncomeTax.tax
      .plus(est.shortTermTax.tax)
      .plus(est.longTermTax.tax);
    expect(recomputed.equals(est.totalTax)).toBe(true);
  });

  it("reports an effective rate over total taxable income", () => {
    // total taxable = 171000 + 40000 + 78000 = 289000.
    const expected = new Decimal("56906.5").div("289000");
    expect(est.effectiveRate.equals(expected)).toBe(true);
  });
});

describe("estimateTax — capital-loss netting & carryforward", () => {
  const est = estimateTax(lossYearInputs, sampleSchedule);

  it("cross-nets a short-term loss against a long-term gain", () => {
    // ST -25000, LT +5000 -> LT absorbed, net ST loss -20000, net LT 0.
    expect(est.netShortTerm.toString()).toBe("-20000 USD");
    expect(est.netLongTerm.isZero()).toBe(true);
    expect(est.taxableShortTermGain.isZero()).toBe(true);
    expect(est.taxableLongTermGain.isZero()).toBe(true);
  });

  it("caps the ordinary offset at $3,000 and carries the rest forward", () => {
    expect(est.netCapitalLoss.toString()).toBe("20000 USD");
    expect(est.capitalLossUsedAgainstOrdinary.toString()).toBe("3000 USD");
    expect(est.capitalLossCarryforward.toString()).toBe("17000 USD");
    // used + carryforward must reconcile to the net capital loss.
    expect(
      est.capitalLossUsedAgainstOrdinary
        .plus(est.capitalLossCarryforward)
        .equals(est.netCapitalLoss),
    ).toBe(true);
  });

  it("reduces taxable ordinary income by the capital-loss offset", () => {
    // 80000 income - 3000 offset = 77000 taxable ordinary.
    expect(est.taxableOrdinaryIncome.toString()).toBe("77000 USD");
    expect(est.totalTax.toString()).toBe("11993 USD");
  });
});

describe("estimateTax — netting branches", () => {
  it("cross-nets a long-term loss against a short-term gain", () => {
    const est = estimateTax(
      {
        currency: USD,
        year: 2024,
        realized: { shortTermGain: usd("30000"), longTermGain: usd("-10000") },
      },
      simpleSchedule,
    );
    expect(est.netShortTerm.toString()).toBe("20000 USD");
    expect(est.netLongTerm.isZero()).toBe(true);
    expect(est.taxableShortTermGain.toString()).toBe("20000 USD");
  });

  it("keeps both classes when both are net losses", () => {
    const est = estimateTax(
      {
        currency: USD,
        year: 2024,
        realized: { shortTermGain: usd("-4000"), longTermGain: usd("-5000") },
        ordinaryIncome: usd("50000"),
      },
      simpleSchedule,
    );
    expect(est.netShortTerm.toString()).toBe("-4000 USD");
    expect(est.netLongTerm.toString()).toBe("-5000 USD");
    expect(est.netCapitalLoss.toString()).toBe("9000 USD");
    // Cap 3000 used; 6000 carried.
    expect(est.capitalLossUsedAgainstOrdinary.toString()).toBe("3000 USD");
    expect(est.capitalLossCarryforward.toString()).toBe("6000 USD");
  });

  it("folds a harvested short-term loss into the short-term class", () => {
    const est = estimateTax(
      {
        currency: USD,
        year: 2024,
        realized: { shortTermGain: usd("10000"), longTermGain: usd("0") },
        harvestedShortTermLoss: usd("4000"),
      },
      simpleSchedule,
    );
    expect(est.netShortTerm.toString()).toBe("6000 USD");
    expect(est.taxableShortTermGain.toString()).toBe("6000 USD");
  });
});

describe("estimateTax — edge cases & determinism", () => {
  it("returns an all-zero estimate for an empty year", () => {
    const est = estimateTax({ currency: USD, year: 2024 }, simpleSchedule);
    expect(est.totalTax.isZero()).toBe(true);
    expect(est.effectiveRate.isZero()).toBe(true);
    expect(est.taxableOrdinaryIncome.isZero()).toBe(true);
  });

  it("floors taxable ordinary income at zero when fees exceed income", () => {
    const est = estimateTax(
      {
        currency: USD,
        year: 2024,
        ordinaryIncome: usd("5000"),
        deductibleFees: usd("9000"),
      },
      simpleSchedule,
    );
    expect(est.taxableOrdinaryIncome.isZero()).toBe(true);
    expect(est.ordinaryIncomeTax.tax.isZero()).toBe(true);
  });

  it("is deterministic: same inputs -> identical JSON", () => {
    const a = estimateTax(sampleInputs, sampleSchedule);
    const b = estimateTax(sampleInputs, sampleSchedule);
    expect(JSON.stringify(a.totalTax.toJSON())).toBe(
      JSON.stringify(b.totalTax.toJSON()),
    );
    expect(a.effectiveRate.equals(b.effectiveRate)).toBe(true);
  });

  it("honours a configurable ordinary-offset cap", () => {
    const schedule: RateSchedule = {
      ...simpleSchedule,
      capitalLossOrdinaryOffsetCap: "10000",
    };
    const est = estimateTax(
      {
        currency: USD,
        year: 2024,
        realized: { shortTermGain: usd("-25000"), longTermGain: usd("0") },
        ordinaryIncome: usd("80000"),
      },
      schedule,
    );
    expect(est.capitalLossUsedAgainstOrdinary.toString()).toBe("10000 USD");
    expect(est.capitalLossCarryforward.toString()).toBe("15000 USD");
  });
});

describe("estimateTax — integration with the tax-lot engine", () => {
  it("consumes a RealizedSummary straight from realizeGains()", () => {
    const realized = realizeGains(taxlotsLedger, "fifo");
    const inputs: TaxYearInputs = {
      currency: realized.currency,
      year: 2024,
      realized,
      ordinaryIncome: usd("100000"),
    };
    const est = estimateTax(inputs, sampleSchedule);
    // The estimate's net gains must match the realized summary (no harvesting).
    expect(est.netShortTerm.equals(realized.shortTermGain)).toBe(true);
    expect(est.netLongTerm.equals(realized.longTermGain)).toBe(true);
    expect(est.totalTax.greaterThan(Money.zero(USD))).toBe(true);
  });
});

describe("estimateTax — validation", () => {
  it("rejects a currency mismatch in the inputs", () => {
    expect(() =>
      estimateTax(
        {
          currency: USD,
          year: 2024,
          ordinaryIncome: Money.of("100", "EUR"),
        },
        simpleSchedule,
      ),
    ).toThrow(TaxEstimateError);
  });

  it("rejects negative harvested-loss magnitudes", () => {
    expect(() =>
      estimateTax(
        {
          currency: USD,
          year: 2024,
          harvestedShortTermLoss: usd("-100"),
        },
        simpleSchedule,
      ),
    ).toThrow(/non-negative/);
  });

  it("ships valid US-2024-shaped fixture brackets", () => {
    expect(usOrdinaryBrackets2024Single[0].from).toBe("0");
    expect(usLongTermBrackets2024Single[0].rate).toBe("0.00");
  });
});
