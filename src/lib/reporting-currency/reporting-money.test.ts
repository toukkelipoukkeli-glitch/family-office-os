import { describe, expect, it } from "vitest";
import { Decimal } from "decimal.js";

import type { FxRateTable } from "@/lib/allocation";
import { Money } from "@/lib/money";
import { networthRateTable } from "@/lib/networth";

import {
  convertFromBase,
  convertMoneyFromBase,
  REPORTING_BASE_CURRENCY,
  reportingRate,
} from "./reporting-money";

/** The USD-anchored table the seeded pages are built with. */
const USD_TABLE: FxRateTable = networthRateTable;

describe("REPORTING_BASE_CURRENCY", () => {
  it("is the base of the canonical FX table (USD)", () => {
    expect(REPORTING_BASE_CURRENCY).toBe("USD");
    expect(REPORTING_BASE_CURRENCY).toBe(USD_TABLE.base);
  });
});

describe("reportingRate", () => {
  it("is exactly 1 for the base currency (no-op path)", () => {
    expect(reportingRate("USD").equals(1)).toBe(true);
  });

  it("returns units of base per 1 reporting unit for non-base codes", () => {
    // EUR: 1 EUR = 1.08 USD.
    expect(reportingRate("EUR").equals(new Decimal("1.08"))).toBe(true);
    expect(reportingRate("GBP").equals(new Decimal("1.27"))).toBe(true);
    expect(reportingRate("CHF").equals(new Decimal("1.12"))).toBe(true);
  });

  it("normalizes unsupported / malformed codes to the base (no-op)", () => {
    expect(reportingRate("jpy").equals(1)).toBe(true);
    expect(reportingRate("").equals(1)).toBe(true);
  });
});

describe("convertFromBase", () => {
  it("is an identity for the base currency", () => {
    expect(convertFromBase(1_000_000, "USD")).toBe(1_000_000);
    expect(convertFromBase(-42.5, "USD")).toBe(-42.5);
  });

  it("re-expresses a base-USD number into the reporting currency", () => {
    // $1,000,000 ÷ 1.08 = €925,925.925...
    expect(convertFromBase(1_000_000, "EUR")).toBeCloseTo(925_925.9259, 3);
    // $1,270,000 ÷ 1.27 = £1,000,000 exactly.
    expect(convertFromBase(1_270_000, "GBP")).toBe(1_000_000);
  });

  it("converts a smaller reporting unit to a larger figure (USD→EUR grows)", () => {
    // EUR is worth more than USD, so the same value is FEWER EUR than USD.
    expect(convertFromBase(1_000_000, "EUR")).toBeLessThan(1_000_000);
  });

  it("uses exact Decimal division (no floating-point drift)", () => {
    // 0.1 + 0.2 style drift would surface here if we divided in float space.
    const got = convertFromBase(3.3, "EUR");
    const exact = new Decimal("3.3").div("1.08").toNumber();
    expect(got).toBe(exact);
  });
});

describe("convertMoneyFromBase", () => {
  it("returns an exact Money in the reporting currency", () => {
    const out = convertMoneyFromBase(Money.of(1_270_000, "USD"), "GBP");
    expect(out.currency).toBe("GBP");
    expect(out.amount.equals(new Decimal(1_000_000))).toBe(true);
  });

  it("is identity for the base currency", () => {
    const out = convertMoneyFromBase(Money.of(500_000, "USD"), "USD");
    expect(out.currency).toBe("USD");
    expect(out.amount.equals(new Decimal(500_000))).toBe(true);
  });
});

describe("conversion paths agree (adversarial)", () => {
  // The Money path (convertMoneyFromBase → exact Decimal then reduce) and the
  // number path (convertFromBase) are used interchangeably across pages —
  // ConsolidationView uses Money, GivingPage uses numbers. They must produce the
  // same magnitude for the same base figure, or the same KPI would read
  // differently on two pages.
  for (const code of ["EUR", "GBP", "CHF", "USD"]) {
    it(`number and Money paths match for ${code}`, () => {
      const base = 1_234_567.89;
      const viaNumber = convertFromBase(base, code);
      const viaMoney = convertMoneyFromBase(
        Money.of(base, "USD"),
        code,
      ).amount.toNumber();
      expect(viaNumber).toBe(viaMoney);
    });
  }

  it("a normalized-away code (jpy) is a true no-op on both paths", () => {
    expect(convertFromBase(777.7, "jpy")).toBe(777.7);
    expect(
      convertMoneyFromBase(Money.of(777.7, "USD"), "jpy").amount.toNumber(),
    ).toBe(777.7);
  });

  it("preserves sign through conversion (negative deductions stay negative)", () => {
    // Consolidation eliminations / minority interest are shown as negatives;
    // re-expression must not flip the sign.
    expect(convertFromBase(-2_160_000, "EUR")).toBe(-2_000_000);
  });
});
