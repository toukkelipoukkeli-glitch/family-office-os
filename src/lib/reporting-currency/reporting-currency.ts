import { Decimal } from "decimal.js";

import {
  type AllocationBreakdown,
  type AllocationSlice,
  type FxRateTable,
  FxConverter,
} from "@/lib/allocation";
import { Money } from "@/lib/money";
import type {
  AssetClassDetail,
  NetWorthDashboardModel,
  NetWorthPoint,
  NetWorthSeries,
} from "@/lib/networth";
import { CurrencyCode } from "@/lib/model/primitives";

/**
 * m12-reporting-currency — global reporting-currency re-expression.
 *
 * The net-worth dashboard model is built once in the portfolio's *canonical*
 * base currency (USD) via {@link import("@/lib/networth").buildNetWorthDashboard}.
 * This module re-expresses an already-built model into a different *reporting*
 * currency chosen by the user, using the SAME deterministic FX table the rest of
 * the app normalizes with ({@link FxRateTable}, see `@/lib/allocation/fx`).
 *
 * Conversion is exact {@link Decimal} arithmetic — number only at the render
 * boundary. Currency-invariant fields (weights, returns, holding counts, dates)
 * pass through unchanged; only {@link Money} fields are converted, because a
 * ratio of two same-currency amounts is unaffected by the unit they are
 * expressed in.
 *
 * READ-ONLY product: this re-expresses *reported* values for display in a
 * chosen base; it never moves money, places an FX trade, or enters a contract.
 */

/** ISO-4217 reporting currency the dashboard can be expressed in. */
export interface ReportingCurrency {
  /** 3-letter ISO-4217 code. */
  readonly code: string;
  /** Human-readable label for the switcher. */
  readonly label: string;
  /** Currency symbol for compact display. */
  readonly symbol: string;
}

/**
 * The supported reporting currencies. The canonical/default is USD (the base the
 * seeded portfolio and {@link import("@/lib/networth").networthRateTable} are
 * anchored to). Every other code must have a rate in the canonical FX table.
 */
export const REPORTING_CURRENCIES: readonly ReportingCurrency[] = [
  { code: "USD", label: "US Dollar", symbol: "$" },
  { code: "EUR", label: "Euro", symbol: "€" },
  { code: "GBP", label: "British Pound", symbol: "£" },
  { code: "CHF", label: "Swiss Franc", symbol: "CHF" },
] as const;

/** The default reporting currency (the canonical portfolio base). */
export const DEFAULT_REPORTING_CURRENCY = "USD";

/** The set of supported reporting-currency codes, for validation. */
const SUPPORTED = new Set(REPORTING_CURRENCIES.map((c) => c.code));

/** Type guard: a value is one of the supported reporting-currency codes. */
export function isReportingCurrency(value: unknown): value is string {
  return typeof value === "string" && SUPPORTED.has(value.toUpperCase());
}

/** Normalize an arbitrary input to a supported code, or the default. */
export function normalizeReportingCurrency(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_REPORTING_CURRENCY;
  const code = value.trim().toUpperCase();
  return SUPPORTED.has(code) ? code : DEFAULT_REPORTING_CURRENCY;
}

/** Look up the descriptor for a (supported) reporting-currency code. */
export function reportingCurrencyMeta(code: string): ReportingCurrency {
  const norm = code.trim().toUpperCase();
  const found = REPORTING_CURRENCIES.find((c) => c.code === norm);
  return found ?? REPORTING_CURRENCIES[0];
}

/**
 * A converter that re-expresses {@link Money} from the canonical base currency
 * of an {@link FxRateTable} into a chosen reporting currency.
 *
 * `FxRateTable.rates[CCY]` is "units of base per 1 unit of CCY" (so EUR: 1.08
 * means 1 EUR = 1.08 USD). To take an amount already valued in the base and
 * express it in a target currency T we therefore *divide* by `rate[T]`
 * (base ÷ (base/T) = T). The base currency itself converts at exactly 1.
 */
export class ReportingConverter {
  /** The canonical base currency every input amount is assumed to be in. */
  readonly base: string;
  /** The reporting currency every output amount is expressed in. */
  readonly reporting: string;
  /** Units of base per 1 unit of the reporting currency (1 when reporting === base). */
  readonly rateToBase: Decimal;

  private constructor(base: string, reporting: string, rateToBase: Decimal) {
    this.base = base;
    this.reporting = reporting;
    this.rateToBase = rateToBase;
    Object.freeze(this);
  }

  /**
   * Build a converter from the canonical {@link FxRateTable} and the desired
   * reporting currency. Throws when the reporting currency is neither the base
   * nor present in the table — the caller should only ever pass a supported
   * code (validated upstream), so an unknown code is a programming error.
   */
  static from(table: FxRateTable, reporting: string): ReportingConverter {
    const base = CurrencyCode.parse(table.base);
    const target = CurrencyCode.parse(reporting);
    if (target === base) {
      return new ReportingConverter(base, target, new Decimal(1));
    }
    // Reuse the validated FX table (positivity / finiteness / number-rejection)
    // rather than re-implementing rate parsing.
    const converter = FxConverter.fromTable(table);
    if (!converter.canConvert(target)) {
      throw new Error(
        `No FX rate to re-express ${base} into reporting currency ${target}`,
      );
    }
    // `toBase` of one unit of the target yields units of base per 1 target.
    const rateToBase = converter.toBase(Money.of(1, target)).amount;
    if (!rateToBase.isFinite() || rateToBase.lessThanOrEqualTo(0)) {
      throw new Error(
        `Invalid FX rate to re-express ${base} into ${target}`,
      );
    }
    return new ReportingConverter(base, target, rateToBase);
  }

  /**
   * Re-express a base-currency amount into the reporting currency, exactly.
   * Throws when `money` is not in the converter's base currency (the whole
   * dashboard model is built in the base, so a mismatch is a programming error).
   */
  convert(money: Money): Money {
    if (money.currency === this.reporting) return money;
    if (money.currency !== this.base) {
      throw new Error(
        `ReportingConverter expects base ${this.base}, got ${money.currency}`,
      );
    }
    return Money.of(money.amount.div(this.rateToBase), this.reporting);
  }
}

function reexpressSeries(
  series: NetWorthSeries,
  conv: ReportingConverter,
): NetWorthSeries {
  const points: NetWorthPoint[] = series.points.map((p) => ({
    date: p.date,
    value: conv.convert(p.value),
  }));
  return { points, baseCurrency: conv.reporting };
}

function reexpressSlice<K extends string>(
  slice: AllocationSlice<K>,
  conv: ReportingConverter,
): AllocationSlice<K> {
  // Weight is a currency-invariant ratio — only the value changes unit.
  return { ...slice, value: conv.convert(slice.value) };
}

function reexpressBreakdown<K extends string>(
  breakdown: AllocationBreakdown<K>,
  conv: ReportingConverter,
): AllocationBreakdown<K> {
  return {
    slices: breakdown.slices.map((s) => reexpressSlice(s, conv)),
    total: conv.convert(breakdown.total),
    baseCurrency: conv.reporting,
  };
}

function reexpressDetail(
  detail: AssetClassDetail,
  conv: ReportingConverter,
): AssetClassDetail {
  return {
    ...detail,
    value: conv.convert(detail.value),
    series: reexpressSeries(detail.series, conv),
  };
}

/**
 * Re-express a whole {@link NetWorthDashboardModel} into a chosen reporting
 * currency. Returns the same model reference (no conversion) when the reporting
 * currency already equals the model's base, so the common USD path is a no-op.
 *
 * Every {@link Money} field is converted with exact {@link Decimal} arithmetic;
 * weights, returns, holding counts and dates are currency-invariant and pass
 * through unchanged.
 */
export function reexpressNetWorth(
  model: NetWorthDashboardModel,
  table: FxRateTable,
  reporting: string,
): NetWorthDashboardModel {
  const target = normalizeReportingCurrency(reporting);
  if (target === model.baseCurrency) return model;

  const conv = ReportingConverter.from(table, target);
  return {
    baseCurrency: conv.reporting,
    total: reexpressSeries(model.total, conv),
    current: conv.convert(model.current),
    opening: conv.convert(model.opening),
    totalReturn: model.totalReturn,
    byAssetClass: model.byAssetClass.map((d) => reexpressDetail(d, conv)),
    allocation: reexpressBreakdown(model.allocation, conv),
  };
}
