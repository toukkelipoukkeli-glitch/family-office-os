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

describe("formatMoneyCompact", () => {
  it("formats USD millions compactly with one fraction digit", () => {
    expect(formatMoneyCompact(12_500_000, "USD")).toBe("$12.5M");
  });

  it("formats thousands as K", () => {
    expect(formatMoneyCompact(840_000, "USD")).toBe("$840K");
  });

  it("respects the value's own currency symbol", () => {
    expect(formatMoneyCompact(6_500_000, "EUR")).toBe("€6.5M");
  });

  it("accepts a wider fraction digit count", () => {
    expect(formatMoneyCompact(1_850_000_000, "USD", { maximumFractionDigits: 2 })).toBe(
      "$1.85B",
    );
  });

  it("accepts a Decimal-like value", () => {
    expect(formatMoneyCompact(new Decimal("12500000"), "USD")).toBe("$12.5M");
  });

  it("accepts a numeric string", () => {
    expect(formatMoneyCompact("12500000", "USD")).toBe("$12.5M");
  });

  it("reproduces the raw Intl baseline exactly", () => {
    const baseline = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(9_190_000);
    expect(formatMoneyCompact(9_190_000, "USD")).toBe(baseline);
  });
});

describe("formatMoneyWhole", () => {
  it("formats whole dollars with thousands separators and no cents", () => {
    expect(formatMoneyWhole(1_250_000, "USD")).toBe("$1,250,000");
  });

  it("uses the given currency", () => {
    expect(formatMoneyWhole(6_500_000, "EUR")).toBe("€6,500,000");
  });

  it("reproduces the raw Intl baseline exactly", () => {
    const baseline = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(4_000_000);
    expect(formatMoneyWhole(4_000_000, "USD")).toBe(baseline);
  });
});

describe("formatMoney (compact toggle)", () => {
  it("is compact by default", () => {
    expect(formatMoney(12_500_000, "USD")).toBe("$12.5M");
  });

  it("falls back to whole when compact is false", () => {
    expect(formatMoney(1_250_000, "USD", { compact: false })).toBe("$1,250,000");
  });

  it("matches the legacy money(currency, value, compactN) helper for both modes", () => {
    const legacy = (currency: string, value: number, compactN = true) =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        notation: compactN ? "compact" : "standard",
        maximumFractionDigits: compactN ? 1 : 0,
      }).format(value);
    for (const v of [0, 1234, 1_250_000, 12_500_000, -3_200_000]) {
      expect(formatMoney(v, "USD", { compact: true })).toBe(legacy("USD", v, true));
      expect(formatMoney(v, "USD", { compact: false })).toBe(legacy("USD", v, false));
    }
  });
});

describe("formatMoneyValue / formatMoneyValueWhole (Money-shaped)", () => {
  it("reads currency off a Money value (compact)", () => {
    expect(formatMoneyValue(Money.of("12500000", "USD"))).toBe("$12.5M");
  });

  it("reads currency off a Money value (whole)", () => {
    expect(formatMoneyValueWhole(Money.of("1250000", "EUR"))).toBe("€1,250,000");
  });
});

describe("formatMoneySignedCompact", () => {
  it("prefixes a plus for non-negative values", () => {
    expect(formatMoneySignedCompact(4_000_000, "USD")).toBe("+$4M");
  });

  it("prefixes a minus and formats the magnitude for negatives", () => {
    expect(formatMoneySignedCompact(-1_300_000, "USD")).toBe("-$1.3M");
  });

  it("renders +$0 for zero", () => {
    expect(formatMoneySignedCompact(0, "USD")).toBe("+$0");
  });

  it("matches the legacy signedCompact helper", () => {
    const compact = (value: number) =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(value);
    const legacy = (value: number) =>
      `${value < 0 ? "-" : "+"}${compact(Math.abs(value))}`;
    for (const v of [0, 1_300_000, -1_300_000, 4_000_000, -42]) {
      expect(formatMoneySignedCompact(v, "USD")).toBe(legacy(v));
    }
  });
});

describe("formatPercent", () => {
  it("converts a fraction to a percent with one digit by default", () => {
    expect(formatPercent(0.123)).toBe("12.3%");
  });

  it("respects a custom digit count", () => {
    expect(formatPercent(0.0045, { digits: 2 })).toBe("0.45%");
  });

  it("signs non-negative values when asked", () => {
    expect(formatPercent(0.5, { signed: true })).toBe("+50.0%");
    expect(formatPercent(-0.013, { signed: true })).toBe("-1.3%");
  });

  it("matches the legacy string-based percent helper", () => {
    const legacy = (value: number, digits = 1) => `${(value * 100).toFixed(digits)}%`;
    for (const v of [0, 0.123, 0.0045, -0.013, 1]) {
      expect(formatPercent(v)).toBe(legacy(v));
      expect(formatPercent(v, { digits: 2 })).toBe(legacy(v, 2));
    }
  });
});

describe("formatPercentSigned", () => {
  it("always shows a leading sign", () => {
    expect(formatPercentSigned(0.184)).toBe("+18.4%");
    expect(formatPercentSigned(-0.032)).toBe("-3.2%");
  });
});

describe("formatPercentIntl", () => {
  it("formats a fraction with the locale percent style", () => {
    expect(formatPercentIntl(0.5, { signed: true })).toBe("+50.0%");
    expect(formatPercentIntl(-0.013, { signed: true })).toBe("-1.3%");
  });

  it("matches the legacy pct helper", () => {
    const legacy = (fraction: number, signed = false) =>
      new Intl.NumberFormat("en-US", {
        style: "percent",
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
        signDisplay: signed ? "exceptZero" : "auto",
      }).format(fraction);
    for (const v of [0, 0.5, -0.013, 0.001]) {
      expect(formatPercentIntl(v)).toBe(legacy(v));
      expect(formatPercentIntl(v, { signed: true })).toBe(legacy(v, true));
    }
  });
});

describe("formatCompact (plain number)", () => {
  it("compacts a plain number without a currency", () => {
    expect(formatCompact(12_500)).toBe("12.5K");
    expect(formatCompact(1_850_000_000, { maximumFractionDigits: 2 })).toBe("1.85B");
  });
});

describe("formatMultiple", () => {
  it("suffixes with x by default", () => {
    expect(formatMultiple(1.72)).toBe("1.72x");
  });

  it("uses the multiplication sign when asked", () => {
    expect(formatMultiple(2.02, { suffix: "×" })).toBe("2.02×");
  });
});

describe("formatBps", () => {
  it("renders signed basis points", () => {
    expect(formatBps(0.0123)).toBe("+123 bps");
    expect(formatBps(-0.0045)).toBe("-45 bps");
    expect(formatBps(0)).toBe("+0 bps");
  });
});
