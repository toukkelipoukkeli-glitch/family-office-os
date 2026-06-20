import { describe, expect, it } from "vitest";

import { Money } from "@/lib/money";

import {
  analyzeGivingPlan,
  compareInKindVsCash,
  formatPct,
  giftBenefit,
  givingEfficiency,
  GivingError,
  type Gift,
  type GivingPlan,
  type TaxProfile,
} from "./giving";
import { seededGivingPlan, seededTaxProfile } from "./fixtures";

const USD = "USD";
const m = (v: string): Money => Money.of(v, USD);
const num = (x: Money): number => x.amount.toNumber();

describe("giftBenefit", () => {
  it("computes capital-gains avoided and FMV deduction for appreciated stock", () => {
    // FMV 1,200,000, basis 200,000 → gain 1,000,000.
    // CG avoided = 1,000,000 * 0.238 = 238,000.
    const gift: Gift = {
      id: "g1",
      label: "ACME",
      kind: "appreciated",
      recipient: "daf",
      fairMarketValue: m("1200000"),
      costBasis: m("200000"),
    };
    const b = giftBenefit(gift, seededTaxProfile);
    expect(num(b.embeddedGain)).toBe(1_000_000);
    expect(num(b.capitalGainsAvoided)).toBe(238_000);
    expect(num(b.deductibleAmount)).toBe(1_200_000);
  });

  it("treats cash gifts as zero gain / zero CG avoided", () => {
    const gift: Gift = {
      id: "g2",
      label: "cash",
      kind: "cash",
      recipient: "public-charity",
      fairMarketValue: m("50000"),
    };
    const b = giftBenefit(gift, seededTaxProfile);
    expect(num(b.embeddedGain)).toBe(0);
    expect(num(b.capitalGainsAvoided)).toBe(0);
    expect(num(b.deductibleAmount)).toBe(50_000);
  });

  it("floors embedded gain at zero for a depreciated asset", () => {
    const gift: Gift = {
      id: "g3",
      label: "underwater",
      kind: "appreciated",
      recipient: "public-charity",
      fairMarketValue: m("100000"),
      costBasis: m("150000"),
    };
    const b = giftBenefit(gift, seededTaxProfile);
    expect(num(b.embeddedGain)).toBe(0);
    expect(num(b.capitalGainsAvoided)).toBe(0);
  });

  it("defaults missing basis to zero (fully appreciated)", () => {
    const gift: Gift = {
      id: "g4",
      label: "founder shares",
      kind: "appreciated",
      recipient: "public-charity",
      fairMarketValue: m("500000"),
    };
    const b = giftBenefit(gift, seededTaxProfile);
    expect(num(b.embeddedGain)).toBe(500_000);
    expect(num(b.capitalGainsAvoided)).toBeCloseTo(119_000, 6); // 500k*0.238
  });

  it("rejects negative FMV and currency mismatch", () => {
    expect(() =>
      giftBenefit(
        {
          id: "x",
          label: "bad",
          kind: "cash",
          recipient: "public-charity",
          fairMarketValue: m("-1"),
        },
        seededTaxProfile,
      ),
    ).toThrow(GivingError);
    expect(() =>
      giftBenefit(
        {
          id: "x",
          label: "bad",
          kind: "cash",
          recipient: "public-charity",
          fairMarketValue: Money.of("1", "EUR"),
        },
        seededTaxProfile,
      ),
    ).toThrow(GivingError);
  });
});

describe("compareInKindVsCash (oracle: hand-calc)", () => {
  it("quantifies the advantage of gifting stock vs selling then donating", () => {
    // FMV 1,000,000, basis 100,000 → gain 900,000.
    // CG if sold = 900,000 * 0.238 = 214,200.
    // cash-route deduction = 1,000,000 - 214,200 = 785,800.
    // in-kind deduction = 1,000,000.
    // extra deduction = 214,200; extra income tax saved = 214,200 * 0.37 = 79,254.
    // in-kind advantage = 214,200 + 79,254 = 293,454.
    const gift: Gift = {
      id: "g",
      label: "stock",
      kind: "appreciated",
      recipient: "public-charity",
      fairMarketValue: m("1000000"),
      costBasis: m("100000"),
    };
    const c = compareInKindVsCash(gift, seededTaxProfile);
    expect(num(c.capitalGainsIfSold)).toBe(214_200);
    expect(num(c.cashRouteDeduction)).toBe(785_800);
    expect(num(c.inKindDeduction)).toBe(1_000_000);
    expect(num(c.extraIncomeTaxSaved)).toBeCloseTo(79_254, 6);
    expect(num(c.inKindAdvantage)).toBeCloseTo(293_454, 6);
  });

  it("rejects a non-appreciated gift", () => {
    expect(() =>
      compareInKindVsCash(
        {
          id: "g",
          label: "cash",
          kind: "cash",
          recipient: "daf",
          fairMarketValue: m("1000"),
        },
        seededTaxProfile,
      ),
    ).toThrow(GivingError);
  });
});

describe("analyzeGivingPlan — seeded plan (oracle: full hand-calc)", () => {
  const a = analyzeGivingPlan(seededGivingPlan);
  const byYear = (y: number) => a.yearResults.find((r) => r.year === y)!;

  it("rolls up year 2026 (DAF bunching + cash)", () => {
    const y = byYear(2026);
    expect(num(y.gifted)).toBe(1_250_000);
    expect(num(y.capitalGainsAvoided)).toBe(238_000); // 1M gain * 0.238
    expect(num(y.deductionUsed)).toBe(1_250_000); // under 0.6*4M=2.4M ceiling
    expect(num(y.carriedForward)).toBe(0);
    expect(num(y.incomeTaxSaved)).toBe(462_500); // 1.25M * 0.37
    expect(num(y.totalBenefit)).toBe(700_500);
  });

  it("rolls up year 2027 (appreciated index funds)", () => {
    const y = byYear(2027);
    expect(num(y.capitalGainsAvoided)).toBeCloseTo(42_840, 6); // 180k*0.238
    expect(num(y.deductionUsed)).toBe(300_000);
    expect(num(y.incomeTaxSaved)).toBe(111_000); // 300k*0.37
    expect(num(y.totalBenefit)).toBeCloseTo(153_840, 6);
  });

  it("rolls up year 2028 (cash)", () => {
    const y = byYear(2028);
    expect(num(y.capitalGainsAvoided)).toBe(0);
    expect(num(y.incomeTaxSaved)).toBe(55_500); // 150k*0.37
  });

  it("rolls up year 2029 (private foundation, 20% ceiling)", () => {
    const y = byYear(2029);
    expect(num(y.capitalGainsAvoided)).toBe(35_700); // 150k*0.238
    // ceiling 0.20*4M = 800k; full 400k usable.
    expect(num(y.deductionUsed)).toBe(400_000);
    expect(num(y.incomeTaxSaved)).toBe(148_000); // 400k*0.37
  });

  it("computes plan totals and net cost", () => {
    expect(num(a.totalGifted)).toBe(2_100_000);
    expect(num(a.totalCapitalGainsAvoided)).toBeCloseTo(316_540, 6);
    expect(num(a.totalIncomeTaxSaved)).toBe(777_000);
    expect(num(a.totalBenefit)).toBeCloseTo(1_093_540, 6);
    expect(num(a.netCost)).toBeCloseTo(1_006_460, 6);
    expect(num(a.unusedDeduction)).toBe(0);
  });

  it("efficiency = benefit / gifted", () => {
    // 1,093,540 / 2,100,000 ≈ 0.5207
    expect(givingEfficiency(a).toNumber()).toBeCloseTo(0.520733, 5);
    expect(formatPct(givingEfficiency(a))).toBe("52%");
  });
});

describe("AGI ceilings + carryforward", () => {
  const profile: TaxProfile = {
    currency: USD,
    agi: m("1000000"),
    ordinaryRate: 0.37,
    capitalGainsRate: 0.2,
    standardDeduction: m("0"),
    appreciatedAgiLimit: 0.3,
    cashAgiLimit: 0.6,
  };

  it("caps the deduction at the AGI ceiling and carries the excess forward", () => {
    // Year 1: appreciated gift of 500k, ceiling 0.3*1M=300k.
    // used 300k, carry 200k. Year 2: no gift, ceiling 300k absorbs carry 200k.
    const plan: GivingPlan = {
      name: "carry",
      profile,
      carryforwardYears: 5,
      years: [
        {
          year: 1,
          gifts: [
            {
              id: "a",
              label: "stock",
              kind: "appreciated",
              recipient: "public-charity",
              fairMarketValue: m("500000"),
              costBasis: m("0"),
            },
          ],
        },
        { year: 2, gifts: [] },
      ],
    };
    const a = analyzeGivingPlan(plan);
    const y1 = a.yearResults[0];
    const y2 = a.yearResults[1];
    expect(num(y1.deductionUsed)).toBe(300_000);
    expect(num(y1.carriedForward)).toBe(200_000);
    expect(num(y2.deductionUsed)).toBe(200_000); // absorbed carry
    expect(num(a.unusedDeduction)).toBe(0);
  });

  it("expires carryforward past the window", () => {
    const plan: GivingPlan = {
      name: "expire",
      profile,
      carryforwardYears: 1, // only 1 year forward
      years: [
        {
          year: 1,
          gifts: [
            {
              id: "a",
              label: "stock",
              kind: "appreciated",
              recipient: "public-charity",
              fairMarketValue: m("500000"),
              costBasis: m("0"),
            },
          ],
        },
        { year: 2, gifts: [] },
        { year: 3, gifts: [] }, // year-1 carry expires before this year
      ],
    };
    const a = analyzeGivingPlan(plan);
    // Year 2 (within window) absorbs 200k; nothing left to expire.
    expect(num(a.yearResults[1].deductionUsed)).toBe(200_000);
    expect(num(a.unusedDeduction)).toBe(0);
  });

  it("leaves deduction unused when it cannot be absorbed before expiry", () => {
    const plan: GivingPlan = {
      name: "unused",
      profile,
      carryforwardYears: 1,
      years: [
        {
          year: 1,
          gifts: [
            {
              id: "a",
              label: "huge",
              kind: "appreciated",
              recipient: "public-charity",
              fairMarketValue: m("900000"), // ceiling 300k → 600k carry
              costBasis: m("0"),
            },
          ],
        },
        { year: 2, gifts: [] }, // absorbs 300k, 300k left
        { year: 3, gifts: [] }, // year-1 carry now expired → 300k unused
      ],
    };
    const a = analyzeGivingPlan(plan);
    expect(num(a.yearResults[0].deductionUsed)).toBe(300_000);
    expect(num(a.yearResults[1].deductionUsed)).toBe(300_000);
    expect(num(a.unusedDeduction)).toBe(300_000);
  });
});

describe("standard-deduction hurdle", () => {
  it("only counts the deduction above the standard deduction as a benefit", () => {
    const profile: TaxProfile = {
      currency: USD,
      agi: m("1000000"),
      ordinaryRate: 0.4,
      capitalGainsRate: 0.2,
      standardDeduction: m("30000"),
      otherItemized: m("0"),
    };
    // Gift 20k cash. Total itemized = 20k < 30k standard → no marginal benefit.
    const plan: GivingPlan = {
      name: "hurdle",
      profile,
      years: [
        {
          year: 1,
          gifts: [
            {
              id: "a",
              label: "small cash",
              kind: "cash",
              recipient: "public-charity",
              fairMarketValue: m("20000"),
            },
          ],
        },
      ],
    };
    const a = analyzeGivingPlan(plan);
    expect(num(a.yearResults[0].incomeTaxSaved)).toBe(0);
  });

  it("bunching clears the hurdle and unlocks the benefit", () => {
    const profile: TaxProfile = {
      currency: USD,
      agi: m("1000000"),
      ordinaryRate: 0.4,
      capitalGainsRate: 0.2,
      standardDeduction: m("30000"),
      otherItemized: m("0"),
    };
    // Bunch 60k cash in one year. above standard = 60k-30k = 30k → tax saved 12k.
    const plan: GivingPlan = {
      name: "bunch",
      profile,
      years: [
        {
          year: 1,
          gifts: [
            {
              id: "a",
              label: "bunched cash",
              kind: "cash",
              recipient: "public-charity",
              fairMarketValue: m("60000"),
            },
          ],
        },
      ],
    };
    const a = analyzeGivingPlan(plan);
    expect(num(a.yearResults[0].incomeTaxSaved)).toBe(12_000);
  });
});

describe("formatPct", () => {
  it("formats a ratio as a rounded percent", () => {
    expect(formatPct(0.5207)).toBe("52%");
    expect(formatPct(1)).toBe("100%");
    expect(formatPct(0)).toBe("0%");
  });

  it("rounds half up and handles >100% efficiency", () => {
    expect(formatPct(0.005)).toBe("1%"); // half-up
    expect(formatPct(0.004)).toBe("0%");
    expect(formatPct(1.235)).toBe("124%"); // >100% allowed
  });
});

describe("adversarial edge cases", () => {
  const profile: TaxProfile = {
    currency: USD,
    agi: m("1000000"),
    ordinaryRate: 0.37,
    capitalGainsRate: 0.2,
    standardDeduction: m("0"),
    appreciatedAgiLimit: 0.3,
    cashAgiLimit: 0.6,
  };

  it("handles an empty plan (no years) with all-zero totals", () => {
    const a = analyzeGivingPlan({ name: "empty", profile, years: [] });
    expect(a.yearResults).toHaveLength(0);
    expect(num(a.totalGifted)).toBe(0);
    expect(num(a.totalBenefit)).toBe(0);
    expect(num(a.netCost)).toBe(0);
    expect(num(a.unusedDeduction)).toBe(0);
    // efficiency must not divide by zero.
    expect(givingEfficiency(a).toNumber()).toBe(0);
    expect(formatPct(givingEfficiency(a))).toBe("0%");
  });

  it("handles a year with no gifts and no carry (zero everything)", () => {
    const a = analyzeGivingPlan({
      name: "blank-year",
      profile,
      years: [{ year: 2030, gifts: [] }],
    });
    const y = a.yearResults[0];
    expect(num(y.gifted)).toBe(0);
    expect(num(y.deductionUsed)).toBe(0);
    expect(num(y.carriedForward)).toBe(0);
    expect(num(y.incomeTaxSaved)).toBe(0);
    expect(num(y.totalBenefit)).toBe(0);
  });

  it("sorts out-of-order years before applying carryforward", () => {
    // Years supplied 2->1; engine must process 1 then 2 so carry flows forward.
    const plan: GivingPlan = {
      name: "unsorted",
      profile,
      carryforwardYears: 5,
      years: [
        { year: 2, gifts: [] },
        {
          year: 1,
          gifts: [
            {
              id: "a",
              label: "stock",
              kind: "appreciated",
              recipient: "public-charity",
              fairMarketValue: m("500000"),
              costBasis: m("0"),
            },
          ],
        },
      ],
    };
    const a = analyzeGivingPlan(plan);
    expect(a.yearResults[0].year).toBe(1);
    expect(a.yearResults[1].year).toBe(2);
    expect(num(a.yearResults[0].deductionUsed)).toBe(300_000); // 0.3*1M
    expect(num(a.yearResults[1].deductionUsed)).toBe(200_000); // absorbed carry
    expect(num(a.unusedDeduction)).toBe(0);
  });

  it("treats a zero-AGI year as zero ceiling (whole gift carries forward)", () => {
    const plan: GivingPlan = {
      name: "broke-year",
      profile,
      carryforwardYears: 5,
      years: [
        {
          year: 1,
          agi: m("0"),
          gifts: [
            {
              id: "a",
              label: "cash",
              kind: "cash",
              recipient: "public-charity",
              fairMarketValue: m("100000"),
            },
          ],
        },
        { year: 2, gifts: [] }, // AGI back to 1M default → absorbs the carry
      ],
    };
    const a = analyzeGivingPlan(plan);
    expect(num(a.yearResults[0].deductionUsed)).toBe(0);
    expect(num(a.yearResults[0].carriedForward)).toBe(100_000);
    expect(num(a.yearResults[1].deductionUsed)).toBe(100_000);
    expect(num(a.unusedDeduction)).toBe(0);
  });

  it("carryforwardYears=0 expires any over-ceiling deduction immediately", () => {
    const plan: GivingPlan = {
      name: "no-carry",
      profile,
      carryforwardYears: 0,
      years: [
        {
          year: 1,
          gifts: [
            {
              id: "a",
              label: "stock",
              kind: "appreciated",
              recipient: "public-charity",
              fairMarketValue: m("500000"), // ceiling 300k → 200k over
              costBasis: m("0"),
            },
          ],
        },
        { year: 2, gifts: [] }, // year-1 carry expired (diff 1 > 0)
      ],
    };
    const a = analyzeGivingPlan(plan);
    expect(num(a.yearResults[0].deductionUsed)).toBe(300_000);
    expect(num(a.yearResults[1].deductionUsed)).toBe(0);
    expect(num(a.unusedDeduction)).toBe(200_000);
  });

  it("net cost equals gifted minus benefit and stays self-consistent", () => {
    const a = analyzeGivingPlan(seededGivingPlan);
    const recomputed = a.totalGifted.minus(a.totalBenefit);
    expect(num(a.netCost)).toBe(num(recomputed));
    // benefit = income tax saved + capital gains avoided.
    expect(num(a.totalBenefit)).toBe(
      num(a.totalIncomeTaxSaved.plus(a.totalCapitalGainsAvoided)),
    );
  });

  it("documents the conservative ceiling: live cash carry raises room for current appreciated gift", () => {
    // This locks in the deliberate simplification documented in giving.ts:
    // the highest applicable AGI fraction across a year's gifts + live carry is
    // used as the single ceiling for that year. A live 0.6 cash carry therefore
    // lets a current-year 0.3 appreciated gift deduct under the 0.6 ceiling.
    const plan: GivingPlan = {
      name: "ceiling-doc",
      profile,
      carryforwardYears: 5,
      years: [
        {
          year: 1,
          gifts: [
            {
              id: "c",
              label: "cash",
              kind: "cash",
              recipient: "public-charity",
              fairMarketValue: m("800000"), // 0.6*1M=600k used, 200k carry
            },
          ],
        },
        {
          year: 2,
          gifts: [
            {
              id: "s",
              label: "stock",
              kind: "appreciated",
              recipient: "public-charity",
              fairMarketValue: m("500000"),
              costBasis: m("0"),
            },
          ],
        },
      ],
    };
    const a = analyzeGivingPlan(plan);
    expect(num(a.yearResults[0].deductionUsed)).toBe(600_000);
    expect(num(a.yearResults[0].carriedForward)).toBe(200_000);
    // ceiling raised to 0.6 by the live carry → 600k room; 200k carry absorbed
    // first, then 400k of the appreciated gift; 100k carries forward.
    expect(num(a.yearResults[1].deductionUsed)).toBe(600_000);
    expect(num(a.yearResults[1].carriedForward)).toBe(100_000);
  });

  it("rejects a per-year AGI currency mismatch", () => {
    const plan: GivingPlan = {
      name: "bad-agi-ccy",
      profile,
      years: [{ year: 1, agi: Money.of("1", "EUR"), gifts: [] }],
    };
    expect(() => analyzeGivingPlan(plan)).toThrow(GivingError);
  });

  it("rejects a standardDeduction currency mismatch", () => {
    expect(() =>
      analyzeGivingPlan({
        name: "bad-std",
        profile: { ...profile, standardDeduction: Money.of("0", "EUR") },
        years: [],
      }),
    ).toThrow(GivingError);
  });

  it("rejects a non-integer carryforward window", () => {
    expect(() =>
      analyzeGivingPlan({ ...seededGivingPlan, carryforwardYears: 2.5 }),
    ).toThrow(GivingError);
  });

  it("rejects a capital-gains rate above 1", () => {
    expect(() =>
      giftBenefit(
        {
          id: "x",
          label: "stock",
          kind: "appreciated",
          recipient: "daf",
          fairMarketValue: m("100000"),
          costBasis: m("0"),
        },
        { ...seededTaxProfile, capitalGainsRate: 1.5 },
      ),
    ).toThrow(GivingError);
  });

  it("rejects an appreciated-gift basis currency mismatch", () => {
    expect(() =>
      giftBenefit(
        {
          id: "x",
          label: "stock",
          kind: "appreciated",
          recipient: "daf",
          fairMarketValue: m("100000"),
          costBasis: Money.of("0", "EUR"),
        },
        seededTaxProfile,
      ),
    ).toThrow(GivingError);
  });
});

describe("input validation", () => {
  it("rejects an out-of-range carryforward window", () => {
    expect(() =>
      analyzeGivingPlan({ ...seededGivingPlan, carryforwardYears: -1 }),
    ).toThrow(GivingError);
  });

  it("rejects a rate outside [0,1]", () => {
    expect(() =>
      analyzeGivingPlan({
        ...seededGivingPlan,
        profile: { ...seededTaxProfile, ordinaryRate: 1.5 },
      }),
    ).toThrow(GivingError);
  });
});
