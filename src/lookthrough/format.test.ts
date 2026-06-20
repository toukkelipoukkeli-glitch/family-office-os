import { describe, expect, it } from "vitest";

import { Money } from "@/lib/money";

import { formatMoneyCompact, formatPct } from "./format";

const usd = (amount: string) => Money.of(amount, "USD");

describe("formatMoneyCompact", () => {
  it("formats plain values under 1,000 with no unit suffix", () => {
    expect(formatMoneyCompact(usd("0"))).toBe("$0");
    expect(formatMoneyCompact(usd("999"))).toBe("$999");
  });

  it("uses K / M / B units", () => {
    expect(formatMoneyCompact(usd("2500000"))).toBe("$2.5M");
    expect(formatMoneyCompact(usd("150000"))).toBe("$150K");
    expect(formatMoneyCompact(usd("31792500"))).toBe("$31.79M");
    expect(formatMoneyCompact(usd("1500000000"))).toBe("$1.5B");
  });

  it("rolls up to the next unit instead of overflowing at a boundary", () => {
    // 999,950 would render "1000.0K"; it is promoted to "$1M" instead.
    expect(formatMoneyCompact(usd("999950"))).toBe("$1M");
    // 999,500 → mantissa 999.5K (rounds to 999.5, below the 1000 boundary).
    expect(formatMoneyCompact(usd("999500"))).toBe("$999.5K");
    // Just below the K-overflow boundary stays in K.
    expect(formatMoneyCompact(usd("994000"))).toBe("$994K");
  });

  it("never renders a value with a thousand of its own unit", () => {
    for (const v of [
      "999",
      "999000",
      "999499",
      "999500",
      "999950",
      "999999",
      "999000000",
      "999999999",
    ]) {
      const out = formatMoneyCompact(usd(v));
      expect(out).not.toMatch(/1000(\.\d+)?[KMB]/);
    }
  });

  it("labels non-USD currencies with a prefix", () => {
    expect(formatMoneyCompact(Money.of("2500000", "EUR"))).toBe("EUR 2.5M");
  });
});

describe("formatPct", () => {
  it("renders integers without decimals and trims trailing zeros", () => {
    expect(formatPct(0.5)).toBe("50%");
    expect(formatPct(0.3422)).toBe("34.22%");
    expect(formatPct(0.151)).toBe("15.1%");
    expect(formatPct(0)).toBe("0%");
    expect(formatPct(1)).toBe("100%");
  });
});
