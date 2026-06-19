import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import { Money, minorUnitsFor, sumMoney } from "./money";

describe("Money.of / construction", () => {
  it("creates from a string amount preserving precision", () => {
    const m = Money.of("10.99", "USD");
    expect(m.currency).toBe("USD");
    expect(m.amount.toFixed()).toBe("10.99");
  });

  it("creates from a number", () => {
    expect(Money.of(5, "EUR").amount.toFixed()).toBe("5");
  });

  it("creates from a Decimal", () => {
    expect(Money.of(new Decimal("3.14"), "GBP").amount.toFixed()).toBe("3.14");
  });

  it("preserves precision beyond float safety", () => {
    const m = Money.of("0.1", "USD").plus(Money.of("0.2", "USD"));
    expect(m.amount.toFixed()).toBe("0.3");
    // sanity: native float would not be exactly 0.3
    expect(0.1 + 0.2).not.toBe(0.3);
  });

  it("normalizes currency code casing and whitespace", () => {
    expect(Money.of(1, " usd ").currency).toBe("USD");
  });

  it("rejects invalid currency codes", () => {
    expect(() => Money.of(1, "US")).toThrow(/Invalid currency/);
    expect(() => Money.of(1, "DOLLAR")).toThrow(/Invalid currency/);
    expect(() => Money.of(1, "12$")).toThrow(/Invalid currency/);
  });

  it("rejects non-finite amounts", () => {
    expect(() => Money.of(Infinity, "USD")).toThrow(/finite/);
    expect(() => Money.of(NaN, "USD")).toThrow(/finite/);
    expect(() => Money.of(new Decimal(Infinity), "USD")).toThrow(/finite/);
  });

  it("rejects unparseable strings", () => {
    expect(() => Money.of("abc", "USD")).toThrow(/Invalid money amount/);
  });

  it("is immutable / frozen", () => {
    const m = Money.of(1, "USD");
    expect(Object.isFrozen(m)).toBe(true);
  });
});

describe("Money.zero", () => {
  it("is zero in the given currency", () => {
    const z = Money.zero("JPY");
    expect(z.isZero()).toBe(true);
    expect(z.currency).toBe("JPY");
  });
});

describe("Money.fromMinorUnits / toMinorUnits", () => {
  it("round-trips USD cents", () => {
    const m = Money.fromMinorUnits(1099, "USD");
    expect(m.amount.toFixed()).toBe("10.99");
    expect(m.toMinorUnits()).toBe(1099);
  });

  it("handles zero-decimal currencies (JPY)", () => {
    const m = Money.fromMinorUnits(500, "JPY");
    expect(m.amount.toFixed()).toBe("500");
    expect(m.toMinorUnits()).toBe(500);
  });

  it("handles three-decimal currencies (BHD)", () => {
    const m = Money.fromMinorUnits(1234, "BHD");
    expect(m.amount.toFixed()).toBe("1.234");
    expect(m.toMinorUnits()).toBe(1234);
  });

  it("accepts bigint and string input", () => {
    expect(Money.fromMinorUnits(100n, "USD").amount.toFixed()).toBe("1");
    expect(Money.fromMinorUnits("250", "USD").amount.toFixed()).toBe("2.5");
  });

  it("rejects non-integer minor units", () => {
    expect(() => Money.fromMinorUnits(10.5, "USD")).toThrow(/integer/);
  });
});

describe("plus / minus with same-currency guard", () => {
  it("adds same currency", () => {
    expect(Money.of("1.50", "USD").plus(Money.of("2.25", "USD")).amount.toFixed()).toBe(
      "3.75",
    );
  });

  it("subtracts same currency", () => {
    expect(Money.of("5", "USD").minus(Money.of("1.5", "USD")).amount.toFixed()).toBe(
      "3.5",
    );
  });

  it("subtraction can go negative", () => {
    expect(Money.of("1", "USD").minus(Money.of("3", "USD")).amount.toFixed()).toBe("-2");
  });

  it("throws on currency mismatch for plus", () => {
    expect(() => Money.of(1, "USD").plus(Money.of(1, "EUR"))).toThrow(
      /Currency mismatch: USD vs EUR/,
    );
  });

  it("throws on currency mismatch for minus", () => {
    expect(() => Money.of(1, "USD").minus(Money.of(1, "EUR"))).toThrow(
      /Currency mismatch/,
    );
  });

  it("does not mutate operands", () => {
    const a = Money.of("1", "USD");
    const b = Money.of("2", "USD");
    a.plus(b);
    expect(a.amount.toFixed()).toBe("1");
    expect(b.amount.toFixed()).toBe("2");
  });
});

describe("times / dividedBy", () => {
  it("multiplies by a scalar", () => {
    expect(Money.of("10.00", "USD").times(3).amount.toFixed()).toBe("30");
  });

  it("multiplies by a fractional scalar without losing precision", () => {
    expect(Money.of("100", "USD").times("0.075").amount.toFixed()).toBe("7.5");
  });

  it("divides by a scalar", () => {
    expect(Money.of("10", "USD").dividedBy(4).amount.toFixed()).toBe("2.5");
  });

  it("throws on divide by zero", () => {
    expect(() => Money.of("10", "USD").dividedBy(0)).toThrow(/Division by zero/);
  });

  it("negated and abs", () => {
    expect(Money.of("5", "USD").negated().amount.toFixed()).toBe("-5");
    expect(Money.of("-5", "USD").abs().amount.toFixed()).toBe("5");
  });
});

describe("allocate (no lost minor units)", () => {
  it("splits evenly when divisible", () => {
    const parts = Money.of("10.00", "USD").allocate([1, 1]);
    expect(parts.map((p) => p.amount.toFixed())).toEqual(["5", "5"]);
  });

  it("distributes the leftover cent for the classic 0.05 / 3 case", () => {
    const parts = Money.of("0.05", "USD").allocate([1, 1, 1]);
    expect(parts.map((p) => p.toMinorUnits())).toEqual([2, 2, 1]);
    // sums back exactly to the original
    expect(sumMoney(parts).equals(Money.of("0.05", "USD"))).toBe(true);
  });

  it("respects weights with largest-remainder distribution", () => {
    const parts = Money.of("0.10", "USD").allocate([7, 3]);
    expect(parts.map((p) => p.toMinorUnits())).toEqual([7, 3]);
    expect(sumMoney(parts).toMinorUnits()).toBe(10);
  });

  it("never loses minor units across many shares", () => {
    const total = Money.of("100.00", "USD");
    const parts = total.allocate([1, 1, 1, 1, 1, 1, 1]);
    const recombined = sumMoney(parts);
    expect(recombined.equals(total)).toBe(true);
    // each part is within one cent of the fair share
    for (const p of parts) {
      expect(Math.abs(p.toMinorUnits() - 1429)).toBeLessThanOrEqual(1);
    }
  });

  it("allocates negative amounts and still sums exactly", () => {
    const total = Money.of("-0.05", "USD");
    const parts = total.allocate([1, 1, 1]);
    expect(sumMoney(parts).equals(total)).toBe(true);
    expect(parts.map((p) => p.toMinorUnits())).toEqual([-2, -2, -1]);
  });

  it("allocates JPY in whole units", () => {
    const parts = Money.of("100", "JPY").allocate([1, 1, 1]);
    expect(parts.map((p) => p.toMinorUnits())).toEqual([34, 33, 33]);
    expect(sumMoney(parts).toMinorUnits()).toBe(100);
  });

  it("supports zero weights", () => {
    const parts = Money.of("10.00", "USD").allocate([0, 1, 1]);
    expect(parts.map((p) => p.toMinorUnits())).toEqual([0, 500, 500]);
  });

  it("throws on empty weights", () => {
    expect(() => Money.of("1", "USD").allocate([])).toThrow(/at least one/);
  });

  it("throws when weights sum to zero", () => {
    expect(() => Money.of("1", "USD").allocate([0, 0])).toThrow(/positive/);
  });

  it("throws on negative or non-integer weights", () => {
    expect(() => Money.of("1", "USD").allocate([-1, 2])).toThrow(/non-negative integers/);
    expect(() => Money.of("1", "USD").allocate([1.5, 2])).toThrow(/non-negative integers/);
  });
});

describe("compare / equals / ordering", () => {
  it("compare returns -1, 0, 1", () => {
    expect(Money.of("1", "USD").compare(Money.of("2", "USD"))).toBe(-1);
    expect(Money.of("2", "USD").compare(Money.of("2", "USD"))).toBe(0);
    expect(Money.of("3", "USD").compare(Money.of("2", "USD"))).toBe(1);
  });

  it("equals requires same currency and amount", () => {
    expect(Money.of("2.0", "USD").equals(Money.of("2", "USD"))).toBe(true);
    expect(Money.of("2", "USD").equals(Money.of("2", "EUR"))).toBe(false);
    expect(Money.of("2", "USD").equals(Money.of("3", "USD"))).toBe(false);
  });

  it("lessThan / greaterThan", () => {
    expect(Money.of("1", "USD").lessThan(Money.of("2", "USD"))).toBe(true);
    expect(Money.of("3", "USD").greaterThan(Money.of("2", "USD"))).toBe(true);
  });

  it("compare throws on currency mismatch", () => {
    expect(() => Money.of("1", "USD").compare(Money.of("1", "EUR"))).toThrow(
      /Currency mismatch/,
    );
  });

  it("sign predicates", () => {
    expect(Money.of("0", "USD").isZero()).toBe(true);
    expect(Money.of("-1", "USD").isNegative()).toBe(true);
    expect(Money.of("1", "USD").isPositive()).toBe(true);
    expect(Money.of("0", "USD").isNegative()).toBe(false);
    expect(Money.of("0", "USD").isPositive()).toBe(false);
  });
});

describe("round", () => {
  it("rounds to currency minor units with banker's rounding by default", () => {
    expect(Money.of("2.005", "USD").round().amount.toFixed()).toBe("2");
    expect(Money.of("2.015", "USD").round().amount.toFixed()).toBe("2.02");
  });

  it("supports half-up", () => {
    expect(Money.of("2.005", "USD").round(2, "half-up").amount.toFixed()).toBe("2.01");
  });

  it("supports floor and ceil", () => {
    expect(Money.of("2.019", "USD").round(2, "floor").amount.toFixed()).toBe("2.01");
    expect(Money.of("2.011", "USD").round(2, "ceil").amount.toFixed()).toBe("2.02");
  });

  it("respects explicit fraction digits", () => {
    expect(Money.of("2.12345", "USD").round(4, "half-up").amount.toFixed()).toBe("2.1235");
  });
});

describe("format", () => {
  it("formats USD in en-US", () => {
    expect(Money.of("1234.5", "USD").format()).toBe("$1,234.50");
  });

  it("rounds before formatting", () => {
    expect(Money.of("1.005", "USD").format({ mode: "half-up" })).toBe("$1.01");
  });

  it("formats zero-decimal currencies without fraction digits", () => {
    expect(Money.of("1500", "JPY").format({ locale: "en-US" })).toBe("¥1,500");
  });

  it("formats EUR in de-DE locale", () => {
    // de-DE uses a comma decimal separator and trailing currency symbol
    const out = Money.of("1234.5", "EUR").format({ locale: "de-DE" });
    expect(out).toContain("1.234,50");
    expect(out).toContain("€");
  });
});

describe("toString / toJSON", () => {
  it("toString is exact", () => {
    expect(Money.of("10.99", "USD").toString()).toBe("10.99 USD");
  });

  it("toJSON is a plain exact representation", () => {
    expect(Money.of("10.99", "USD").toJSON()).toEqual({
      amount: "10.99",
      currency: "USD",
    });
    expect(JSON.stringify(Money.of("10.99", "USD"))).toBe(
      '{"amount":"10.99","currency":"USD"}',
    );
  });
});

describe("sumMoney", () => {
  it("sums a list", () => {
    const total = sumMoney([
      Money.of("1.10", "USD"),
      Money.of("2.20", "USD"),
      Money.of("3.30", "USD"),
    ]);
    expect(total.amount.toFixed()).toBe("6.6");
  });

  it("returns zero for an empty list when currency given", () => {
    expect(sumMoney([], "USD").isZero()).toBe(true);
  });

  it("throws for an empty list without currency", () => {
    expect(() => sumMoney([])).toThrow(/requires a currency/);
  });

  it("throws on currency mismatch in the list", () => {
    expect(() =>
      sumMoney([Money.of("1", "USD"), Money.of("1", "EUR")]),
    ).toThrow(/Currency mismatch/);
  });
});

describe("minorUnitsFor", () => {
  it("defaults unknown currencies to 2", () => {
    expect(minorUnitsFor("USD")).toBe(2);
    expect(minorUnitsFor("XYZ")).toBe(2);
    expect(minorUnitsFor("JPY")).toBe(0);
    expect(minorUnitsFor("BHD")).toBe(3);
  });
});
