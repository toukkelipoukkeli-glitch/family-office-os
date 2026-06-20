import { describe, expect, it } from "vitest";

import { Money } from "@/lib/money";

import { formatMoneyCompact, formatPct, formatScore } from "./format";

describe("formatPct", () => {
  it("renders a 0..1 fraction as a percentage", () => {
    expect(formatPct(0.5)).toBe("50%");
    expect(formatPct(0.823, 1)).toBe("82.3%");
  });
});

describe("formatScore", () => {
  it("renders a 0..1 score as a /100 figure", () => {
    expect(formatScore(0.82)).toBe("82");
    expect(formatScore(1)).toBe("100");
    expect(formatScore(0)).toBe("0");
  });
});

describe("formatMoneyCompact", () => {
  it("compacts billions, millions and thousands", () => {
    expect(formatMoneyCompact(Money.of("5000000000", "USD"))).toBe("$5B");
    expect(formatMoneyCompact(Money.of("1230000", "USD"))).toBe("$1.23M");
    expect(formatMoneyCompact(Money.of("4500", "USD"))).toBe("$4.5K");
  });

  it("renders non-USD currencies with a spaced code prefix", () => {
    expect(formatMoneyCompact(Money.of("2000000", "EUR"))).toBe("EUR 2M");
  });

  it("renders small amounts without a magnitude suffix", () => {
    expect(formatMoneyCompact(Money.of("250", "USD"))).toBe("$250");
    expect(formatMoneyCompact(Money.of("0", "USD"))).toBe("$0");
  });

  it("places the negative sign before the currency symbol", () => {
    // Regression: must read "-$1.23B", never "$-1.23B".
    expect(formatMoneyCompact(Money.of("-1230000000", "USD"))).toBe("-$1.23B");
    expect(formatMoneyCompact(Money.of("-4500", "USD"))).toBe("-$4.5K");
    expect(formatMoneyCompact(Money.of("-250", "USD"))).toBe("-$250");
    expect(formatMoneyCompact(Money.of("-2000000", "EUR"))).toBe("-EUR 2M");
  });

  it("rolls a rounded mantissa up to the next magnitude tier", () => {
    // 999,999,000 rounds to 1000.00M at the millions tier, promoting to 1B.
    expect(formatMoneyCompact(Money.of("999999000", "USD"))).toBe("$1B");
    expect(formatMoneyCompact(Money.of("-999999000", "USD"))).toBe("-$1B");
  });
});
