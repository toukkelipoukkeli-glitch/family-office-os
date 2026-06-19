import { describe, expect, it } from "vitest";

import { Money } from "@/lib/money";

import { formatNav, formatPct, kindColor } from "./org-format";
import { ENTITY_KINDS } from "@/lib/org";

/**
 * Tester coverage for the org display formatters. Pins the Decimal-based NAV
 * compaction (no float distortion of currency) and the trimmed percentage
 * formatting.
 */

const usd = (amount: string) =>
  Money.of(amount, "USD") && { amount, currency: "USD" as const };

describe("formatPct", () => {
  it("renders whole percentages without decimals", () => {
    expect(formatPct(0.6)).toBe("60%");
    expect(formatPct(1)).toBe("100%");
  });

  it("trims trailing zeros but keeps significant decimals", () => {
    expect(formatPct(0.375)).toBe("37.5%");
    expect(formatPct(0.125)).toBe("12.5%");
  });
});

describe("formatNav", () => {
  it("returns null for undefined or zero NAV", () => {
    expect(formatNav(undefined)).toBeNull();
    expect(formatNav(usd("0"))).toBeNull();
  });

  it("compacts thousands, millions and billions", () => {
    expect(formatNav(usd("2300000"))).toBe("$2.3M");
    expect(formatNav(usd("9100000"))).toBe("$9.1M");
    expect(formatNav(usd("4200"))).toBe("$4K");
    expect(formatNav(usd("1500000000"))).toBe("$1.5B");
  });

  it("strips a trailing .0 from round millions/billions", () => {
    expect(formatNav(usd("5000000"))).toBe("$5M");
    expect(formatNav(usd("2000000000"))).toBe("$2B");
  });

  it("formats a non-USD currency with its code prefix", () => {
    expect(formatNav({ amount: "3400000", currency: "EUR" })).toBe("EUR 3.4M");
  });

  it("keeps precision on large exact amounts (no float distortion)", () => {
    // 9,007,199,254,740,993 = Number.MAX_SAFE_INTEGER + 2; a float round-trip
    // would lose the low digits, but Decimal division must still bucket it as
    // ~9.0M-billions correctly.
    const big = "9007199254740993";
    const out = formatNav({ amount: big, currency: "USD" });
    expect(out).toBe("$9007199.3B");
  });
});

describe("kindColor", () => {
  it("returns a CSS var for every entity kind", () => {
    for (const kind of ENTITY_KINDS) {
      expect(kindColor(kind)).toMatch(/^var\(--/);
    }
  });
});
