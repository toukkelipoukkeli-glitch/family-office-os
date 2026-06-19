import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import { Money } from "../money";
import { Valuation } from "../model/valuation";
import { Comparable } from "./comparable";
import {
  completenessFactor,
  conditionMultiplier,
  CONDITION_MULTIPLIERS,
  SET_CONDITIONS,
} from "./condition";
import {
  FIXTURE_AS_OF,
  falconComps,
  millenniumFalcon,
  tajComps,
  tajMahal,
} from "./fixtures";
import {
  appreciationOverRetail,
  estimateSetValue,
} from "./price-guide";
import { LegoSet } from "./set";
import {
  hampelKeep,
  median,
  medianAbsoluteDeviation,
  weightedMedian,
} from "./stats";

const D = (s: string | number) => new Decimal(s);

describe("LegoSet schema", () => {
  it("parses a valid set and defaults tags to []", () => {
    const s = LegoSet.parse({
      id: "lego-x",
      setNumber: "10256",
      name: "Taj Mahal",
      theme: "Creator Expert",
      year: 2017,
      retailPrice: "369.99",
      currency: "usd",
    });
    expect(s.currency).toBe("USD");
    expect(s.tags).toEqual([]);
  });

  it("accepts set numbers with a variant suffix", () => {
    expect(
      LegoSet.safeParse({
        id: "i",
        setNumber: "75192-1",
        name: "n",
        theme: "t",
        year: 2017,
        retailPrice: "1",
        currency: "USD",
      }).success,
    ).toBe(true);
  });

  it("rejects bad set numbers, years, and negative retail prices", () => {
    const base = {
      id: "i",
      setNumber: "10256",
      name: "n",
      theme: "t",
      year: 2017,
      retailPrice: "1",
      currency: "USD",
    };
    expect(LegoSet.safeParse({ ...base, setNumber: "AB" }).success).toBe(false);
    expect(LegoSet.safeParse({ ...base, year: 1900 }).success).toBe(false);
    expect(LegoSet.safeParse({ ...base, retailPrice: "-1" }).success).toBe(
      false,
    );
  });

  it("rejects unknown keys (strict)", () => {
    expect(
      LegoSet.safeParse({
        id: "i",
        setNumber: "10256",
        name: "n",
        theme: "t",
        year: 2017,
        retailPrice: "1",
        currency: "USD",
        bogus: true,
      }).success,
    ).toBe(false);
  });
});

describe("Comparable schema", () => {
  it("defaults completeness to 1 and uppercases currency", () => {
    const c = Comparable.parse({
      id: "c",
      price: "100",
      currency: "usd",
      condition: "sealed",
      soldOn: "2024-01-01",
      source: "auction",
    });
    expect(c.completeness).toBe("1");
    expect(c.currency).toBe("USD");
  });

  it("rejects completeness outside [0, 1] and invalid dates", () => {
    const base = {
      id: "c",
      price: "1",
      currency: "USD",
      condition: "used",
      soldOn: "2024-01-01",
      source: "private",
    };
    expect(
      Comparable.safeParse({ ...base, completeness: "1.5" }).success,
    ).toBe(false);
    expect(
      Comparable.safeParse({ ...base, soldOn: "2024-02-30" }).success,
    ).toBe(false);
  });
});

describe("condition multipliers and completeness factor", () => {
  it("sealed is the 1.0 reference and grades decrease monotonically", () => {
    expect(conditionMultiplier("sealed").toNumber()).toBe(1);
    expect(
      conditionMultiplier("complete").greaterThan(conditionMultiplier("used")),
    ).toBe(true);
    expect(
      conditionMultiplier("used").greaterThan(conditionMultiplier("incomplete")),
    ).toBe(true);
    // every condition has a documented multiplier
    for (const c of SET_CONDITIONS) {
      expect(CONDITION_MULTIPLIERS[c]).toBeInstanceOf(Decimal);
    }
  });

  it("completeness factor is exact at the endpoints and convex in between", () => {
    expect(completenessFactor(D(1)).toNumber()).toBe(1);
    expect(completenessFactor(D(0)).toNumber()).toBe(0);
    // 0.5 ** 1.5 ~= 0.3535, strictly below the linear 0.5
    const half = completenessFactor(D("0.5"));
    expect(half.lessThan(D("0.5"))).toBe(true);
    expect(half.toNumber()).toBeCloseTo(0.35355, 4);
  });

  it("throws on out-of-range completeness", () => {
    expect(() => completenessFactor(D("1.1"))).toThrow();
    expect(() => completenessFactor(D("-0.1"))).toThrow();
  });
});

describe("robust statistics", () => {
  it("median handles odd and even counts exactly", () => {
    expect(median([D(3), D(1), D(2)]).toNumber()).toBe(2);
    expect(median([D(1), D(2), D(3), D(4)]).toNumber()).toBe(2.5);
  });

  it("median does not mutate its input", () => {
    const xs = [D(3), D(1), D(2)];
    median(xs);
    expect(xs.map((x) => x.toNumber())).toEqual([3, 1, 2]);
  });

  it("MAD is zero when all values are equal", () => {
    expect(medianAbsoluteDeviation([D(5), D(5), D(5)]).toNumber()).toBe(0);
  });

  it("hampel filter drops a clear outlier but keeps the cluster", () => {
    const xs = [D(10), D(11), D(9), D(10), D(1000)];
    const { values } = hampelKeep(xs);
    expect(values.map((v) => v.toNumber())).not.toContain(1000);
    expect(values.length).toBe(4);
  });

  it("hampel keeps everything when MAD is zero", () => {
    const xs = [D(7), D(7), D(7)];
    expect(hampelKeep(xs).values.length).toBe(3);
  });

  it("weighted median respects weights", () => {
    // value 100 carries almost all the weight -> it is the weighted median
    const v = weightedMedian([D(1), D(100)], [D("0.01"), D(99)]);
    expect(v.toNumber()).toBe(100);
  });

  it("weighted median validates inputs", () => {
    expect(() => weightedMedian([D(1)], [D(1), D(2)])).toThrow();
    expect(() => weightedMedian([D(1)], [D(0)])).toThrow();
    expect(() => weightedMedian([], [])).toThrow();
  });
});

describe("estimateSetValue — core pipeline", () => {
  it("normalizes heterogeneous comps and drops the outlier", () => {
    const r = estimateSetValue(
      millenniumFalcon,
      falconComps,
      { condition: "sealed" },
      FIXTURE_AS_OF,
    );
    // 6 supplied, the 3200 private sale is an outlier -> 5 used
    expect(r.compCountSupplied).toBe(6);
    expect(r.compCountUsed).toBe(5);
    // sealed-equivalent median lands near the ~1100-1150 cluster
    expect(r.sealedValue.amount.toNumber()).toBeGreaterThan(1100);
    expect(r.sealedValue.amount.toNumber()).toBeLessThan(1180);
    // headline sealed valuation is in USD and non-negative
    expect(r.valuation.value.currency).toBe("USD");
    expect(Number(r.valuation.value.amount)).toBeGreaterThan(0);
  });

  it("produces a schema-valid Valuation with source 'model'", () => {
    const r = estimateSetValue(
      millenniumFalcon,
      falconComps,
      { condition: "sealed" },
      FIXTURE_AS_OF,
    );
    expect(() => Valuation.parse(r.valuation)).not.toThrow();
    expect(r.valuation.source).toBe("model");
    expect(r.valuation.asOf).toBe("2024-06-01T00:00:00Z");
  });

  it("re-applies the target condition multiplier", () => {
    const sealed = estimateSetValue(
      millenniumFalcon,
      falconComps,
      { condition: "sealed" },
      FIXTURE_AS_OF,
    );
    const used = estimateSetValue(
      millenniumFalcon,
      falconComps,
      { condition: "used" },
      FIXTURE_AS_OF,
    );
    // used ~= 0.55 * sealed
    const ratio = Number(used.valuation.value.amount) /
      Number(sealed.valuation.value.amount);
    expect(ratio).toBeCloseTo(0.55, 2);
    // sealed value is unchanged regardless of the target grade
    expect(used.sealedValue.equals(sealed.sealedValue)).toBe(true);
  });

  it("penalizes incompleteness super-linearly", () => {
    const full = estimateSetValue(
      millenniumFalcon,
      falconComps,
      { condition: "incomplete", completeness: "1" },
      FIXTURE_AS_OF,
    );
    const missing = estimateSetValue(
      millenniumFalcon,
      falconComps,
      { condition: "incomplete", completeness: "0.9" },
      FIXTURE_AS_OF,
    );
    const ratio = Number(missing.valuation.value.amount) /
      Number(full.valuation.value.amount);
    // 0.9 ** 1.5 ~= 0.854, strictly below 0.9
    expect(ratio).toBeCloseTo(0.8538, 3);
  });

  it("ignores supplied completeness for a sealed target (sealed is complete)", () => {
    const a = estimateSetValue(
      millenniumFalcon,
      falconComps,
      { condition: "sealed", completeness: "0.5" },
      FIXTURE_AS_OF,
    );
    const b = estimateSetValue(
      millenniumFalcon,
      falconComps,
      { condition: "sealed" },
      FIXTURE_AS_OF,
    );
    expect(a.valuation.value.amount).toBe(b.valuation.value.amount);
  });

  it("is deterministic across runs and comp ordering", () => {
    const a = estimateSetValue(
      millenniumFalcon,
      falconComps,
      { condition: "sealed" },
      FIXTURE_AS_OF,
    );
    const shuffled = [...falconComps].reverse();
    const b = estimateSetValue(
      millenniumFalcon,
      shuffled,
      { condition: "sealed" },
      FIXTURE_AS_OF,
    );
    expect(a.valuation.value.amount).toBe(b.valuation.value.amount);
    expect(a.sealedValue.equals(b.sealedValue)).toBe(true);
  });

  it("rounds the headline value to the currency minor unit", () => {
    const r = estimateSetValue(
      millenniumFalcon,
      falconComps,
      { condition: "used" },
      FIXTURE_AS_OF,
    );
    // USD -> exactly 2 decimal places
    expect(r.valuation.value.amount).toMatch(/^\d+\.\d{2}$/);
  });
});

describe("estimateSetValue — recency weighting", () => {
  it("weights a fresh comp more than a stale one of the same condition", () => {
    const set = LegoSet.parse({
      id: "s",
      setNumber: "12345",
      name: "n",
      theme: "t",
      year: 2015,
      retailPrice: "100",
      currency: "USD",
    });
    const comps = [
      Comparable.parse({
        id: "fresh",
        price: "200",
        currency: "USD",
        condition: "sealed",
        soldOn: "2024-05-25", // ~1 week old
        source: "auction",
      }),
      Comparable.parse({
        id: "stale",
        price: "100",
        currency: "USD",
        condition: "sealed",
        soldOn: "2020-06-01", // ~4 years old
        source: "auction",
      }),
    ];
    const r = estimateSetValue(set, comps, { condition: "sealed" }, "2024-06-01", {
      recencyHalfLifeDays: 180,
    });
    // The fresh 200 dominates the weighted median.
    expect(r.sealedValue.amount.toNumber()).toBe(200);
  });

  it("drops comps older than maxAgeDays", () => {
    const set = LegoSet.parse({
      id: "s",
      setNumber: "12345",
      name: "n",
      theme: "t",
      year: 2010,
      retailPrice: "100",
      currency: "USD",
    });
    const comps = [
      Comparable.parse({
        id: "ancient",
        price: "999",
        currency: "USD",
        condition: "sealed",
        soldOn: "2010-01-01",
        source: "auction",
      }),
      Comparable.parse({
        id: "recent",
        price: "150",
        currency: "USD",
        condition: "sealed",
        soldOn: "2024-05-01",
        source: "auction",
      }),
    ];
    const r = estimateSetValue(set, comps, { condition: "sealed" }, "2024-06-01");
    expect(r.compCountUsed).toBe(1);
    expect(r.sealedValue.amount.toNumber()).toBe(150);
  });
});

describe("estimateSetValue — confidence", () => {
  it("is high for many fresh, tightly-agreeing comps", () => {
    const r = estimateSetValue(
      millenniumFalcon,
      falconComps,
      { condition: "sealed" },
      FIXTURE_AS_OF,
    );
    expect(r.valuation.confidence).toBe("high");
    expect(r.valuation.confidenceScore).toBeGreaterThan(0.66);
  });

  it("is lower when the only comp is stale", () => {
    const set = LegoSet.parse({
      id: "s",
      setNumber: "12345",
      name: "n",
      theme: "t",
      year: 2010,
      retailPrice: "100",
      currency: "USD",
    });
    const comps = [
      Comparable.parse({
        id: "lonely-stale",
        price: "150",
        currency: "USD",
        condition: "sealed",
        soldOn: "2022-06-01", // ~2 years old at as-of
        source: "private",
      }),
    ];
    const r = estimateSetValue(set, comps, { condition: "sealed" }, "2024-06-01");
    expect(r.compCountUsed).toBe(1);
    expect(["low", "medium"]).toContain(r.valuation.confidence);
    expect(r.valuation.confidenceScore).toBeLessThan(0.66);
  });
});

describe("estimateSetValue — errors", () => {
  it("throws on a currency mismatch between comp and set", () => {
    const badComp = Comparable.parse({
      id: "eur",
      price: "100",
      currency: "EUR",
      condition: "sealed",
      soldOn: "2024-05-01",
      source: "auction",
    });
    expect(() =>
      estimateSetValue(
        millenniumFalcon,
        [badComp],
        { condition: "sealed" },
        FIXTURE_AS_OF,
      ),
    ).toThrow(/currency/i);
  });

  it("throws when no usable comps remain", () => {
    expect(() =>
      estimateSetValue(
        millenniumFalcon,
        [],
        { condition: "sealed" },
        FIXTURE_AS_OF,
      ),
    ).toThrow(/no usable/i);
  });

  it("ignores incomplete comps that carry no price signal", () => {
    // completeness 0 -> sealed-equivalent 0 -> skipped, leaving one usable comp
    const comps = [
      Comparable.parse({
        id: "zero",
        price: "10",
        currency: "USD",
        condition: "incomplete",
        completeness: "0",
        soldOn: "2024-05-01",
        source: "private",
      }),
      Comparable.parse({
        id: "good",
        price: "1100",
        currency: "USD",
        condition: "sealed",
        soldOn: "2024-05-02",
        source: "auction",
      }),
    ];
    const r = estimateSetValue(
      millenniumFalcon,
      comps,
      { condition: "sealed" },
      FIXTURE_AS_OF,
    );
    expect(r.compCountUsed).toBe(1);
    expect(r.sealedValue.amount.toNumber()).toBe(1100);
  });
});

describe("appreciationOverRetail", () => {
  it("reports the premium of the sealed estimate over MSRP", () => {
    const r = estimateSetValue(
      millenniumFalcon,
      falconComps,
      { condition: "sealed" },
      FIXTURE_AS_OF,
    );
    const appr = appreciationOverRetail(millenniumFalcon, r.sealedValue);
    expect(appr).not.toBeNull();
    // sealed-equiv ~1139 vs retail 799.99 -> ~+42%
    expect(appr!.toNumber()).toBeCloseTo(0.4236, 3);
  });

  it("returns null when retail is zero/unknown", () => {
    const free = LegoSet.parse({
      id: "free",
      setNumber: "30000",
      name: "polybag",
      theme: "promo",
      year: 2020,
      retailPrice: "0",
      currency: "USD",
    });
    expect(appreciationOverRetail(free, Money.of("10", "USD"))).toBeNull();
  });

  it("throws on a currency mismatch", () => {
    expect(() =>
      appreciationOverRetail(millenniumFalcon, Money.of("10", "EUR")),
    ).toThrow(/currency/i);
  });
});

describe("Taj Mahal fixture", () => {
  it("values two clean sealed comps near their median", () => {
    const r = estimateSetValue(
      tajMahal,
      tajComps,
      { condition: "sealed" },
      FIXTURE_AS_OF,
    );
    expect(r.compCountUsed).toBe(2);
    // recency-weighted median of {520, 560}; the 520 is fresher
    expect(r.sealedValue.amount.toNumber()).toBe(520);
  });
});
