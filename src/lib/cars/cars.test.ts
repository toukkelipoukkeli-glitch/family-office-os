import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import { jaguarEType, mercedes280SL, porsche911RS, sampleCars } from "./fixtures";
import {
  adjustedBaseline,
  CONDITION_MULTIPLIER,
  mileageFactor,
  trimmedMean,
  valueClassicCar,
} from "./valuation";
import { ClassicCar, ComparableSale } from "./vehicle";

describe("ClassicCar schema", () => {
  const valid = {
    id: "c1",
    make: "Ferrari",
    model: "Dino 246 GT",
    year: 1972,
    currency: "usd",
    baselineValue: "350000",
    conditionGrade: "good",
  };

  it("applies defaults and normalizes currency", () => {
    const car = ClassicCar.parse(valid);
    expect(car.currency).toBe("USD");
    expect(car.baselineMileage).toBe(0);
    expect(car.mileage).toBe(0);
    expect(car.provenanceFactor).toBe("1");
    expect(car.rarityFactor).toBe("1");
    expect(car.comps).toEqual([]);
  });

  it("rejects unknown keys (strict)", () => {
    expect(ClassicCar.safeParse({ ...valid, color: "red" }).success).toBe(false);
  });

  it("rejects empty make/model and out-of-range year", () => {
    expect(ClassicCar.safeParse({ ...valid, make: "  " }).success).toBe(false);
    expect(ClassicCar.safeParse({ ...valid, model: "" }).success).toBe(false);
    expect(ClassicCar.safeParse({ ...valid, year: 1800 }).success).toBe(false);
    expect(ClassicCar.safeParse({ ...valid, year: 2200 }).success).toBe(false);
  });

  it("rejects a non-positive factor and a negative baseline", () => {
    expect(
      ClassicCar.safeParse({ ...valid, provenanceFactor: "0" }).success,
    ).toBe(false);
    expect(
      ClassicCar.safeParse({ ...valid, rarityFactor: "-1" }).success,
    ).toBe(false);
    expect(
      ClassicCar.safeParse({ ...valid, baselineValue: "-5" }).success,
    ).toBe(false);
  });

  it("rejects an invalid condition grade and a bad sale date", () => {
    expect(
      ClassicCar.safeParse({ ...valid, conditionGrade: "mint" }).success,
    ).toBe(false);
    expect(
      ComparableSale.safeParse({
        id: "x",
        price: "1",
        currency: "USD",
        soldOn: "2025/01/01",
        conditionGrade: "good",
      }).success,
    ).toBe(false);
  });
});

describe("mileageFactor", () => {
  it("is neutral at or below baseline mileage", () => {
    expect(mileageFactor(0, 0).toString()).toBe("1");
    expect(mileageFactor(10000, 50000).toString()).toBe("1");
  });

  it("reduces value linearly above baseline", () => {
    // 50k excess * 0.0000008 = 0.04 penalty
    expect(mileageFactor(50000, 0).toString()).toBe("0.96");
  });

  it("clamps the penalty at 40%", () => {
    expect(mileageFactor(10_000_000, 0).toString()).toBe("0.6");
  });
});

describe("trimmedMean", () => {
  it("is the plain mean for fewer than 4 values", () => {
    const v = [new Decimal(10), new Decimal(20), new Decimal(30)];
    expect(trimmedMean(v).toString()).toBe("20");
  });

  it("drops the single lowest and highest for >= 4 values", () => {
    // drop 1 and 100; mean of [10, 20] = 15
    const v = [1, 10, 20, 100].map((n) => new Decimal(n));
    expect(trimmedMean(v).toString()).toBe("15");
  });

  it("throws on an empty list", () => {
    expect(() => trimmedMean([])).toThrow();
  });
});

describe("CONDITION_MULTIPLIER", () => {
  it("is monotonically decreasing from concours to fair", () => {
    const order = ["concours", "excellent", "good", "fair"] as const;
    for (let i = 1; i < order.length; i++) {
      expect(
        new Decimal(CONDITION_MULTIPLIER[order[i]]).lessThan(
          CONDITION_MULTIPLIER[order[i - 1]],
        ),
      ).toBe(true);
    }
    expect(CONDITION_MULTIPLIER.good).toBe("1.0");
  });
});

describe("adjustedBaseline", () => {
  it("multiplies baseline by condition, mileage, provenance and rarity", () => {
    // Jaguar: 120000 * 0.6 (fair) * 0.9296 (88k miles) * 1 * 1
    const expected = new Decimal("120000")
      .times("0.6")
      .times(mileageFactor(88000, 0));
    expect(adjustedBaseline(jaguarEType).equals(expected)).toBe(true);
    expect(adjustedBaseline(jaguarEType).toFixed(2)).toBe("66931.20");
  });
});

describe("valueClassicCar — no comps (Jaguar)", () => {
  const v = valueClassicCar(jaguarEType);

  it("uses the adjusted baseline as the point estimate", () => {
    expect(v.compCount).toBe(0);
    expect(v.compEstimate).toBeUndefined();
    expect(v.value.amount.toFixed()).toBe("66931");
    expect(v.adjustedBaseline.amount.toFixed()).toBe("66931");
  });

  it("widens the band for a fair-condition car (0.18 + 0.04*3 = 0.30)", () => {
    expect(v.bandFraction.toString()).toBe("0.3");
    // band is taken off the unrounded point (66931.20): *0.7 and *1.3
    expect(v.low.amount.toFixed()).toBe("46852");
    expect(v.high.amount.toFixed()).toBe("87011");
    expect(v.confidence).toBe("low");
  });

  it("keeps low <= value <= high", () => {
    expect(v.low.lessThan(v.value) || v.low.equals(v.value)).toBe(true);
    expect(v.value.lessThan(v.high) || v.value.equals(v.high)).toBe(true);
  });
});

describe("valueClassicCar — many comps (Porsche)", () => {
  const v = valueClassicCar(porsche911RS);

  it("blends comp estimate with baseline and reports both", () => {
    expect(v.compCount).toBe(4);
    expect(v.compEstimate).toBeDefined();
    // comp estimate sits between the cheapest and dearest normalized comps
    expect(v.compEstimate!.amount.greaterThan(0)).toBe(true);
  });

  it("produces a tight band and high confidence with 4 clustered comps", () => {
    expect(v.bandFraction.lessThanOrEqualTo("0.12")).toBe(true);
    expect(v.confidence).toBe("high");
  });

  it("keeps the band ordered and non-negative", () => {
    expect(v.low.amount.greaterThan(0)).toBe(true);
    expect(v.low.lessThan(v.value)).toBe(true);
    expect(v.high.greaterThan(v.value)).toBe(true);
  });
});

describe("valueClassicCar — few comps (Mercedes)", () => {
  const v = valueClassicCar(mercedes280SL);

  it("yields a medium-confidence, wider band than the Porsche", () => {
    expect(v.compCount).toBe(2);
    // 2-comp floor is 0.1; CV here exceeds it, so band > floor
    expect(v.bandFraction.greaterThanOrEqualTo("0.1")).toBe(true);
    expect(["medium", "low"]).toContain(v.confidence);
  });
});

describe("valueClassicCar — comp condition normalization", () => {
  it("normalizes a higher-grade comp down when valuing a lower-grade subject", () => {
    const base = {
      id: "c",
      make: "Aston Martin",
      model: "DB5",
      year: 1964,
      currency: "USD",
      baselineValue: "1000000",
      conditionGrade: "good" as const,
    };
    // One concours comp at 1.6M; normalized to good = 1.6M / 1.6 * 1.0 = 1.0M.
    const car = ClassicCar.parse({
      ...base,
      comps: [
        {
          id: "k",
          price: "1600000",
          currency: "USD",
          soldOn: "2025-01-01",
          conditionGrade: "concours",
        },
      ],
    });
    const v = valueClassicCar(car);
    expect(v.compEstimate!.amount.toFixed()).toBe("1000000");
  });

  it("is deterministic — same input, same output", () => {
    const a = valueClassicCar(porsche911RS);
    const b = valueClassicCar(porsche911RS);
    expect(a.value.equals(b.value)).toBe(true);
    expect(a.low.equals(b.low)).toBe(true);
    expect(a.high.equals(b.high)).toBe(true);
    expect(a.bandFraction.equals(b.bandFraction)).toBe(true);
  });
});

describe("valueClassicCar — guards", () => {
  it("rejects a comp whose currency differs from the vehicle", () => {
    const car = ClassicCar.parse({
      id: "c",
      make: "Lancia",
      model: "Stratos",
      year: 1974,
      currency: "USD",
      baselineValue: "500000",
      conditionGrade: "good",
      comps: [
        {
          id: "k",
          price: "450000",
          currency: "EUR",
          soldOn: "2025-01-01",
          conditionGrade: "good",
        },
      ],
    });
    expect(() => valueClassicCar(car)).toThrow(/currency/);
  });

  it("validates raw (unparsed) input through the schema", () => {
    expect(() => valueClassicCar({ id: "x" })).toThrow();
  });

  it("better condition always values at least as high as worse condition", () => {
    const mk = (grade: "concours" | "excellent" | "good" | "fair") =>
      valueClassicCar(
        ClassicCar.parse({
          id: "c",
          make: "BMW",
          model: "507",
          year: 1957,
          currency: "USD",
          baselineValue: "2000000",
          conditionGrade: grade,
        }),
      ).value.amount;
    expect(mk("concours").greaterThan(mk("excellent"))).toBe(true);
    expect(mk("excellent").greaterThan(mk("good"))).toBe(true);
    expect(mk("good").greaterThan(mk("fair"))).toBe(true);
  });
});

describe("valueClassicCar — adversarial edge cases", () => {
  const base = {
    id: "c",
    make: "X",
    model: "Y",
    year: 1970,
    currency: "USD",
    conditionGrade: "good" as const,
  };

  it("handles a zero baseline with no comps without crashing", () => {
    const v = valueClassicCar(
      ClassicCar.parse({ ...base, baselineValue: "0" }),
    );
    expect(v.value.amount.isZero()).toBe(true);
    expect(v.low.amount.isZero()).toBe(true);
    expect(v.high.amount.isZero()).toBe(true);
    // band still computed (condition-widened), point is just zero
    expect(v.bandFraction.greaterThan(0)).toBe(true);
    expect(v.confidence).toBe("low");
  });

  it("guards against a zero comp mean (no NaN/Infinity band)", () => {
    const v = valueClassicCar(
      ClassicCar.parse({
        ...base,
        baselineValue: "100000",
        comps: [
          { id: "a", price: "0", currency: "USD", soldOn: "2025-01-01", conditionGrade: "good" },
          { id: "b", price: "0", currency: "USD", soldOn: "2025-01-01", conditionGrade: "good" },
        ],
      }),
    );
    expect(v.compEstimate!.amount.isZero()).toBe(true);
    expect(v.bandFraction.isFinite()).toBe(true);
    // CV is undefined-by-zero, so the floor (2 comps => 0.1) takes over
    expect(v.bandFraction.toString()).toBe("0.1");
    // blend: compMean 0 weighted 2/3, baseline 100000 weighted 1/3 => 33333
    expect(v.value.amount.toFixed()).toBe("33333");
  });

  it("clamps a wildly dispersed band at 0.95 and keeps the low bound positive", () => {
    const v = valueClassicCar(
      ClassicCar.parse({
        ...base,
        baselineValue: "100000",
        comps: [
          { id: "a", price: "1", currency: "USD", soldOn: "2025-01-01", conditionGrade: "good" },
          { id: "b", price: "10000000", currency: "USD", soldOn: "2025-01-01", conditionGrade: "good" },
        ],
      }),
    );
    expect(v.bandFraction.toString()).toBe("0.95");
    expect(v.low.amount.greaterThan(0)).toBe(true);
    expect(v.high.amount.greaterThan(v.value.amount)).toBe(true);
    // wide band => never high confidence regardless of comp count
    expect(v.confidence).not.toBe("high");
  });

  it("normalizes a lower-grade comp UP when valuing a higher-grade subject", () => {
    const v = valueClassicCar(
      ClassicCar.parse({
        ...base,
        conditionGrade: "concours",
        baselineValue: "1000000",
        comps: [
          // one fair comp at 600k => normalized to concours = 600k / 0.6 * 1.6 = 1.6M
          { id: "k", price: "600000", currency: "USD", soldOn: "2025-01-01", conditionGrade: "fair" },
        ],
      }),
    );
    expect(v.compEstimate!.amount.toFixed()).toBe("1600000");
  });

  it("mileage penalty clamp does not drive the adjusted baseline negative", () => {
    const v = valueClassicCar(
      ClassicCar.parse({
        ...base,
        baselineValue: "100000",
        mileage: 100_000_000,
      }),
    );
    // 40% max mileage penalty => baseline * 0.6 = 60000, still positive
    expect(v.adjustedBaseline.amount.toFixed()).toBe("60000");
    expect(v.value.amount.greaterThan(0)).toBe(true);
  });

  it("rejects a duplicate/extra unknown key on a comp (strict comps)", () => {
    expect(
      ClassicCar.safeParse({
        ...base,
        baselineValue: "100000",
        comps: [
          {
            id: "k",
            price: "1",
            currency: "USD",
            soldOn: "2025-01-01",
            conditionGrade: "good",
            bogus: true,
          },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("fixtures", () => {
  it("every sample car valuations cleanly", () => {
    for (const car of sampleCars) {
      const v = valueClassicCar(car);
      expect(v.value.amount.greaterThan(0)).toBe(true);
      expect(v.low.amount.greaterThanOrEqualTo(0)).toBe(true);
      expect(v.high.greaterThan(v.low)).toBe(true);
      expect(v.value.currency).toBe(car.currency);
    }
  });
});
