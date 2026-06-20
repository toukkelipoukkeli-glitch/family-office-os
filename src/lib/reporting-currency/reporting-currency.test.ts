import { describe, expect, it } from "vitest";
import { Decimal } from "decimal.js";

import type { FxRateTable } from "@/lib/allocation";
import { Money } from "@/lib/money";
import { buildNetWorthDashboard, networthRateTable } from "@/lib/networth";
import { seededPortfolio } from "@/fixtures";

import {
  DEFAULT_REPORTING_CURRENCY,
  isReportingCurrency,
  normalizeReportingCurrency,
  REPORTING_CURRENCIES,
  ReportingConverter,
  reportingCurrencyMeta,
  reexpressNetWorth,
} from "./reporting-currency";

/** The USD-anchored table the seeded dashboard is built with. */
const USD_TABLE: FxRateTable = networthRateTable;

describe("REPORTING_CURRENCIES catalog", () => {
  it("starts with USD as the canonical default", () => {
    expect(DEFAULT_REPORTING_CURRENCY).toBe("USD");
    expect(REPORTING_CURRENCIES[0].code).toBe("USD");
  });

  it("only lists currencies the canonical FX table can convert", () => {
    for (const c of REPORTING_CURRENCIES) {
      if (c.code === USD_TABLE.base) continue;
      expect(
        Object.prototype.hasOwnProperty.call(USD_TABLE.rates, c.code),
      ).toBe(true);
    }
  });

  it("every entry has a code, label and symbol", () => {
    for (const c of REPORTING_CURRENCIES) {
      expect(c.code).toMatch(/^[A-Z]{3}$/);
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.symbol.length).toBeGreaterThan(0);
    }
  });
});

describe("normalizeReportingCurrency / isReportingCurrency", () => {
  it("accepts supported codes (case-insensitive)", () => {
    expect(normalizeReportingCurrency("eur")).toBe("EUR");
    expect(normalizeReportingCurrency(" gbp ")).toBe("GBP");
    expect(isReportingCurrency("chf")).toBe(true);
  });

  it("falls back to the default for unknown / malformed input", () => {
    expect(normalizeReportingCurrency("JPY")).toBe(DEFAULT_REPORTING_CURRENCY);
    expect(normalizeReportingCurrency("")).toBe(DEFAULT_REPORTING_CURRENCY);
    expect(normalizeReportingCurrency(null)).toBe(DEFAULT_REPORTING_CURRENCY);
    expect(normalizeReportingCurrency(42)).toBe(DEFAULT_REPORTING_CURRENCY);
    expect(isReportingCurrency("JPY")).toBe(false);
    expect(isReportingCurrency(undefined)).toBe(false);
  });
});

describe("reportingCurrencyMeta", () => {
  it("resolves the descriptor for a supported code", () => {
    expect(reportingCurrencyMeta("EUR").label).toBe("Euro");
    expect(reportingCurrencyMeta("eur").symbol).toBe("€");
  });

  it("falls back to the first (default) entry for unknown codes", () => {
    expect(reportingCurrencyMeta("JPY").code).toBe("USD");
  });
});

describe("ReportingConverter", () => {
  it("is the identity when reporting === base", () => {
    const conv = ReportingConverter.from(USD_TABLE, "USD");
    expect(conv.rateToBase.equals(1)).toBe(true);
    const usd = Money.of("1000", "USD");
    expect(conv.convert(usd)).toBe(usd);
  });

  it("divides base amounts by the units-of-base-per-target rate", () => {
    // 1 EUR = 1.08 USD, so $1080 -> €1000 exactly.
    const conv = ReportingConverter.from(USD_TABLE, "EUR");
    expect(conv.rateToBase.equals("1.08")).toBe(true);
    const out = conv.convert(Money.of("1080", "USD"));
    expect(out.currency).toBe("EUR");
    expect(out.amount.equals("1000")).toBe(true);
  });

  it("converts GBP and CHF exactly", () => {
    // 1 GBP = 1.27 USD => $1270 -> £1000.
    const gbp = ReportingConverter.from(USD_TABLE, "GBP").convert(
      Money.of("1270", "USD"),
    );
    expect(gbp.amount.equals("1000")).toBe(true);
    // 1 CHF = 1.12 USD => $1120 -> CHF 1000.
    const chf = ReportingConverter.from(USD_TABLE, "CHF").convert(
      Money.of("1120", "USD"),
    );
    expect(chf.amount.equals("1000")).toBe(true);
  });

  it("keeps full precision (no float rounding)", () => {
    const conv = ReportingConverter.from(USD_TABLE, "EUR");
    // $100 / 1.08 = 92.592592... — exact Decimal, not a binary-float approximation.
    const out = conv.convert(Money.of("100", "USD"));
    expect(out.amount.toFixed(10)).toBe(
      new Decimal("100").div("1.08").toFixed(10),
    );
  });

  it("re-expressing then back to base is round-trip exact", () => {
    const toEur = ReportingConverter.from(USD_TABLE, "EUR");
    const eur = toEur.convert(Money.of("1080", "USD"));
    // €1000 * 1.08 = $1080.
    const backToUsd = eur.amount.times("1.08");
    expect(backToUsd.equals("1080")).toBe(true);
  });

  it("a zero amount stays zero in the target currency", () => {
    const conv = ReportingConverter.from(USD_TABLE, "GBP");
    const out = conv.convert(Money.zero("USD"));
    expect(out.currency).toBe("GBP");
    expect(out.amount.isZero()).toBe(true);
  });

  it("throws on a non-base input currency (programming error)", () => {
    const conv = ReportingConverter.from(USD_TABLE, "EUR");
    expect(() => conv.convert(Money.of("1", "GBP"))).toThrow(/expects base USD/);
  });

  it("throws when the reporting currency has no rate", () => {
    expect(() => ReportingConverter.from(USD_TABLE, "JPY")).toThrow(
      /No FX rate/,
    );
  });
});

describe("reexpressNetWorth", () => {
  const usdModel = buildNetWorthDashboard(seededPortfolio, networthRateTable);

  it("returns the same reference when reporting === base (no-op)", () => {
    expect(reexpressNetWorth(usdModel, USD_TABLE, "USD")).toBe(usdModel);
  });

  it("normalizes an unsupported code to a base no-op", () => {
    expect(reexpressNetWorth(usdModel, USD_TABLE, "JPY")).toBe(usdModel);
  });

  it("re-expresses the headline current value into EUR exactly", () => {
    const eur = reexpressNetWorth(usdModel, USD_TABLE, "EUR");
    expect(eur.baseCurrency).toBe("EUR");
    // current_EUR == current_USD / 1.08, exactly.
    const expected = usdModel.current.amount.div("1.08");
    expect(eur.current.amount.equals(expected)).toBe(true);
    expect(eur.current.currency).toBe("EUR");
  });

  it("converts every Money field consistently (total, opening, slices, series)", () => {
    const eur = reexpressNetWorth(usdModel, USD_TABLE, "EUR");
    const rate = new Decimal("1.08");

    expect(eur.opening.amount.equals(usdModel.opening.amount.div(rate))).toBe(
      true,
    );
    expect(
      eur.total.points.every(
        (p, i) =>
          p.value.currency === "EUR" &&
          p.value.amount.equals(usdModel.total.points[i].value.amount.div(rate)),
      ),
    ).toBe(true);

    expect(eur.allocation.baseCurrency).toBe("EUR");
    expect(
      eur.allocation.total.amount.equals(
        usdModel.allocation.total.amount.div(rate),
      ),
    ).toBe(true);
    eur.allocation.slices.forEach((s, i) => {
      expect(s.value.currency).toBe("EUR");
      expect(
        s.value.amount.equals(usdModel.allocation.slices[i].value.amount.div(rate)),
      ).toBe(true);
    });

    eur.byAssetClass.forEach((d, i) => {
      const src = usdModel.byAssetClass[i];
      expect(d.value.amount.equals(src.value.amount.div(rate))).toBe(true);
      expect(d.series.baseCurrency).toBe("EUR");
      d.series.points.forEach((p, j) => {
        expect(
          p.value.amount.equals(src.series.points[j].value.amount.div(rate)),
        ).toBe(true);
      });
    });
  });

  it("leaves currency-invariant fields unchanged (weights, returns, counts)", () => {
    const eur = reexpressNetWorth(usdModel, USD_TABLE, "EUR");
    expect(eur.totalReturn.equals(usdModel.totalReturn)).toBe(true);
    eur.byAssetClass.forEach((d, i) => {
      const src = usdModel.byAssetClass[i];
      expect(d.assetClass).toBe(src.assetClass);
      expect(d.weight.equals(src.weight)).toBe(true);
      expect(d.holdingCount).toBe(src.holdingCount);
    });
    eur.allocation.slices.forEach((s, i) => {
      expect(s.weight.equals(usdModel.allocation.slices[i].weight)).toBe(true);
    });
  });

  it("preserves the drill-down reconciliation: classes sum to the total", () => {
    const gbp = reexpressNetWorth(usdModel, USD_TABLE, "GBP");
    const sum = gbp.byAssetClass.reduce(
      (acc, d) => acc.plus(d.value.amount),
      new Decimal(0),
    );
    expect(sum.equals(gbp.current.amount)).toBe(true);
  });

  it("different reporting currencies preserve relative magnitudes", () => {
    const eur = reexpressNetWorth(usdModel, USD_TABLE, "EUR");
    const gbp = reexpressNetWorth(usdModel, USD_TABLE, "GBP");
    // GBP is stronger than EUR vs USD, so the same book is a smaller number in GBP.
    expect(gbp.current.amount.lessThan(eur.current.amount)).toBe(true);
  });

  // --- adversarial coverage (independent tester) ---

  it("re-expresses opening and current through the identical divisor (no per-field drift)", () => {
    // The "change over window" KPI is current - opening. Both must be divided by
    // the exact same rate so the converted pair stays internally consistent: each
    // field equals its USD source divided by the rate, with matching rounding.
    const rate = new Decimal("1.27");
    const gbp = reexpressNetWorth(usdModel, USD_TABLE, "GBP");
    expect(gbp.current.amount.equals(usdModel.current.amount.div(rate))).toBe(
      true,
    );
    expect(gbp.opening.amount.equals(usdModel.opening.amount.div(rate))).toBe(
      true,
    );
  });

  it("CHF drill-down reconciles to the total the same way the USD model does", () => {
    // The drill-down reconciliation is a property of the model build, preserved
    // by re-expression: classes sum to current in CHF iff they do in USD.
    const chf = reexpressNetWorth(usdModel, USD_TABLE, "CHF");
    const usdSum = usdModel.byAssetClass.reduce(
      (acc, d) => acc.plus(d.value.amount),
      new Decimal(0),
    );
    const chfSum = chf.byAssetClass.reduce(
      (acc, d) => acc.plus(d.value.amount),
      new Decimal(0),
    );
    // Whatever the USD residual is, CHF carries the same shape: sum-of-classes
    // equals current re-expressed by the same divisor as each class.
    expect(usdSum.equals(usdModel.current.amount)).toBe(true);
    expect(chf.current.amount.equals(usdModel.current.amount.div("1.12"))).toBe(
      true,
    );
    chf.byAssetClass.forEach((d, i) => {
      expect(
        d.value.amount.equals(usdModel.byAssetClass[i].value.amount.div("1.12")),
      ).toBe(true);
    });
    // And the CHF classes still sum within a sub-cent tolerance of the headline.
    expect(chfSum.minus(chf.current.amount).abs().lessThan("0.01")).toBe(true);
  });

  it("does not mutate the source USD model when re-expressing", () => {
    const beforeCurrent = usdModel.current.amount.toString();
    const beforeBase = usdModel.baseCurrency;
    const beforeFirstSlice = usdModel.allocation.slices[0].value.amount.toString();
    reexpressNetWorth(usdModel, USD_TABLE, "EUR");
    expect(usdModel.current.amount.toString()).toBe(beforeCurrent);
    expect(usdModel.baseCurrency).toBe(beforeBase);
    expect(usdModel.allocation.slices[0].value.amount.toString()).toBe(
      beforeFirstSlice,
    );
  });

  it("the reporting === model-base short-circuit returns the same reference for every supported code", () => {
    // Whatever the model's declared base, asking to re-express into that same
    // base is a no-op (same reference) — the default-view invariant the UI relies
    // on for byte-for-byte stability.
    for (const code of ["USD", "EUR", "GBP", "CHF"]) {
      const m: typeof usdModel = { ...usdModel, baseCurrency: code };
      expect(reexpressNetWorth(m, USD_TABLE, code)).toBe(m);
      expect(reexpressNetWorth(m, USD_TABLE, code.toLowerCase())).toBe(m);
    }
  });

  it("convert() guards against a Money already in a third currency", () => {
    // The converter only accepts amounts in its table base (USD). A stray Money
    // in some other currency must throw rather than be silently mis-scaled —
    // protecting the model-built-in-base invariant.
    const conv = ReportingConverter.from(USD_TABLE, "EUR");
    expect(() => conv.convert(Money.of("100", "CHF"))).toThrow(/expects base USD/);
  });
});
