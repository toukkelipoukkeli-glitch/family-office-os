import * as React from "react";
import { Decimal } from "decimal.js";

import type { FxRateTable } from "@/lib/allocation";
import { Money } from "@/lib/money";
import { networthRateTable } from "@/lib/networth";

import {
  normalizeReportingCurrency,
  ReportingConverter,
} from "./reporting-currency";
import { useOptionalReportingCurrency } from "./reporting-context";

/**
 * m13-currency-rollout — the shared *display boundary* every value-bearing page
 * converts through before formatting.
 *
 * Every page builds its model in the portfolio's canonical base currency (USD,
 * the base of {@link networthRateTable}). To honour the global reporting-currency
 * switcher, a page re-expresses each monetary figure into the chosen reporting
 * currency *at the render boundary* — right where the exact value becomes a
 * display string — using the SAME deterministic FX table the rest of the app
 * normalizes with ({@link ReportingConverter}, see `reporting-currency.ts`).
 *
 * This module packages that boundary as a tiny, reusable surface:
 *
 *  - {@link reportingRate} / {@link convertFromBase} — pure conversion helpers
 *    (exact {@link Decimal} math, number only where the caller already holds a
 *    number to format).
 *  - {@link useReportingMoney} — the React hook a page calls once to get its
 *    reporting `currency` and a `convert(number)` it applies to each base-USD
 *    figure before passing it to the `@/lib/format` helpers.
 *
 * READ-ONLY product: this re-expresses *reported* values for display in the
 * chosen base; it never moves money, places an FX trade, or enters a contract.
 */

/** The canonical base currency every page model is built in. */
export const REPORTING_BASE_CURRENCY = networthRateTable.base;

/**
 * Units of base currency per 1 unit of the chosen reporting currency, from the
 * given FX table. Returns `1` when reporting === base (the no-op USD path).
 *
 * The code is normalized first ({@link normalizeReportingCurrency}), so an
 * unsupported or malformed value resolves to the base currency (a `1`/no-op
 * rate) rather than throwing — callers need not pre-validate the code.
 */
export function reportingRate(
  reporting: string,
  table: FxRateTable = networthRateTable,
): Decimal {
  return ReportingConverter.from(table, normalizeReportingCurrency(reporting))
    .rateToBase;
}

/**
 * Re-express an exact base-currency {@link Money} into the chosen reporting
 * currency. The amount must already be in the table's base currency.
 */
export function convertMoneyFromBase(
  money: Money,
  reporting: string,
  table: FxRateTable = networthRateTable,
): Money {
  return ReportingConverter.from(
    table,
    normalizeReportingCurrency(reporting),
  ).convert(money);
}

/**
 * Re-express a base-currency *number* into the chosen reporting currency.
 *
 * Pages hold most figures as plain numbers (already reduced from `Decimal` in
 * their model layer). This converts such a number exactly — `value ÷ rate` in
 * {@link Decimal} space — then reduces back to a number at the boundary, so the
 * conversion itself never loses precision to floating-point division.
 */
export function convertFromBase(
  value: number,
  reporting: string,
  table: FxRateTable = networthRateTable,
): number {
  const rate = reportingRate(reporting, table);
  if (rate.equals(1)) return value;
  return new Decimal(value).div(rate).toNumber();
}

/** What {@link useReportingMoney} returns. */
export interface ReportingMoney {
  /** The active reporting-currency code (e.g. `"EUR"`). */
  readonly currency: string;
  /** True when the reporting currency differs from the canonical base. */
  readonly isConverted: boolean;
  /** Units of base per 1 reporting unit (`1` when reporting === base). */
  readonly rateToBase: Decimal;
  /** Re-express a base-currency number into the reporting currency. */
  convert(value: number): number;
  /** Re-express a base-currency {@link Money} into the reporting currency. */
  convertMoney(money: Money): Money;
}

/**
 * The page-side hook for the reporting-currency rollout.
 *
 * Call it once near the top of a value-bearing page, then pass each base-USD
 * figure through `convert(...)` and format with the returned `currency`:
 *
 * ```tsx
 * const { currency, convert } = useReportingMoney();
 * // ...
 * formatMoneyCompact(convert(model.totalValue), currency)
 * ```
 *
 * Degrades to the canonical base (a pure no-op) when rendered without a
 * {@link import("./reporting-provider").ReportingCurrencyProvider}, so isolated
 * unit renders of a page are unaffected.
 */
export function useReportingMoney(
  table: FxRateTable = networthRateTable,
): ReportingMoney {
  const currency = normalizeReportingCurrency(useOptionalReportingCurrency());
  return React.useMemo<ReportingMoney>(() => {
    const conv = ReportingConverter.from(table, currency);
    const { rateToBase } = conv;
    const noop = rateToBase.equals(1);
    return {
      currency,
      isConverted: !noop,
      rateToBase,
      convert: (value: number) =>
        noop ? value : new Decimal(value).div(rateToBase).toNumber(),
      convertMoney: (money: Money) => conv.convert(money),
    };
  }, [currency, table]);
}
