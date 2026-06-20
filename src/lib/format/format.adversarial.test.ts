import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import { Money } from "@/lib/money";
import {
  formatBps,
  formatCompact,
  formatMoney,
  formatMoneyCompact,
  formatMoneySignedCompact,
  formatMoneyValue,
  formatMoneyValueWhole,
  formatMoneyWhole,
  formatMultiple,
  formatPercent,
  formatPercentIntl,
  formatPercentSigned,
} from "./index";

/**
 * Adversarial coverage for the shared render-boundary formatters. These probe
 * the failure modes that exact-baseline tests miss: negative zero, very large /
 * tiny magnitudes, non-USD/non-EUR currencies, Decimal precision at the
 * boundary, and the sign-derivation branches.
 */

describe("negative-zero never leaks a bare '-0'", () => {
  it("signed compact money treats -0 as +", () => {
    expect(formatMoneySignedCompact(-0, "USD")).toBe("+$0");
    // A tiny negative that compacts to zero magnitude must not show '-$0'.
    expect(formatMoneySignedCompact(-0.0001, "USD")).toBe("-$0");
  });

  it("bps that rounds to negative zero renders +0 bps, never -0 bps", () => {
    const out = formatBps(-0.00001); // *10000 = -0.1 -> Math.round -> -0
    expect(out).toBe("+0 bps");
    expect(out).not.toContain("-0");
  });

  it("signed percent of -0 renders +0.0%, not -0.0%", () => {
    expect(formatPercent(-0, { signed: true })).toBe("+0.0%");
    expect(formatPercentSigned(-0)).toBe("+0.0%");
  });
});

describe("magnitude extremes stay finite and bounded", () => {
  it("compacts billions and trillions", () => {
    expect(formatMoneyCompact(1_850_000_000, "USD", { maximumFractionDigits: 2 })).toBe(
      "$1.85B",
    );
    expect(formatMoneyCompact(2_500_000_000_000, "USD")).toBe("$2.5T");
  });

  it("whole money groups millions correctly with no cents", () => {
    expect(formatMoneyWhole(1_234_567_890, "USD")).toBe("$1,234,567,890");
  });

  it("plain compact handles sub-thousand without a suffix", () => {
    expect(formatCompact(842)).toBe("842");
  });
});

describe("currencies beyond USD/EUR", () => {
  it("formats JPY (zero-decimal) and GBP", () => {
    expect(formatMoneyWhole(1_250_000, "GBP")).toBe("£1,250,000");
    // JPY compact: the symbol is ¥; magnitude compacts the same way.
    expect(formatMoneyCompact(1_250_000, "JPY")).toMatch(/^[¥￥]1\.3M$/);
  });

  it("reads an exotic currency off a Money value", () => {
    expect(formatMoneyValueWhole(Money.of("1000000", "CHF"))).toMatch(
      /CHF.?1,000,000|1,000,000.?CHF/,
    );
  });
});

describe("Decimal precision survives the boundary", () => {
  it("a Decimal with many places compacts identically to its number", () => {
    const d = new Decimal("12500000.000000001");
    expect(formatMoneyCompact(d, "USD")).toBe("$12.5M");
  });

  it("Money-shaped compact reads currency and amount off the value", () => {
    expect(formatMoneyValue(Money.of("840000", "EUR"))).toBe("€840K");
  });

  it("string numeric input matches numeric input", () => {
    expect(formatMoneyCompact("9190000", "USD")).toBe(formatMoneyCompact(9_190_000, "USD"));
  });
});

describe("formatMoney compact toggle parity with whole/compact", () => {
  it("compact:true === formatMoneyCompact, compact:false === formatMoneyWhole", () => {
    for (const v of [0, -0, 1234.56, -3_200_000, 1_250_000]) {
      expect(formatMoney(v, "USD", { compact: true })).toBe(formatMoneyCompact(v, "USD"));
      expect(formatMoney(v, "USD", { compact: false })).toBe(formatMoneyWhole(v, "USD"));
    }
  });
});

describe("percent rounding at the half boundary is deterministic", () => {
  it("toFixed rounds half-to-even-ish consistently with the legacy helper", () => {
    const legacy = (f: number, d = 1) => `${(f * 100).toFixed(d)}%`;
    for (const v of [0.12345, 0.12355, -0.0005, 0.99995, 1.5]) {
      expect(formatPercent(v)).toBe(legacy(v));
      expect(formatPercent(v, { digits: 2 })).toBe(legacy(v, 2));
    }
  });

  it("Intl percent groups thousands (default 1 fraction digit)", () => {
    expect(formatPercentIntl(1234)).toBe("123,400.0%");
  });
});

describe("formatMultiple suffix + sign handling", () => {
  it("formats negative multiples and custom digits", () => {
    expect(formatMultiple(-1.5)).toBe("-1.50x");
    expect(formatMultiple(2, { digits: 0, suffix: "×" })).toBe("2×");
  });
});

describe("formatBps sign branch", () => {
  it("positive gets +, negative gets -, exact zero gets +", () => {
    expect(formatBps(0.025)).toBe("+250 bps");
    expect(formatBps(-0.025)).toBe("-250 bps");
    expect(formatBps(0)).toBe("+0 bps");
  });
});
