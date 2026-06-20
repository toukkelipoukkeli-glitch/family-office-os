import * as React from "react";

import {
  DEFAULT_REPORTING_CURRENCY,
  REPORTING_CURRENCIES,
  type ReportingCurrency,
} from "./reporting-currency";

/**
 * Shared state and hooks for the global reporting-currency switcher.
 *
 * The React context object and its consumer hooks live here (no components) so
 * the provider file stays component-only and Fast Refresh works. A single
 * {@link import("./reporting-provider").ReportingCurrencyProvider} mounted at the
 * app root owns the chosen reporting currency; pages re-express their values
 * through {@link useReportingCurrency}. READ-ONLY product: switching the
 * reporting base only changes the unit values are *shown* in, never the holdings.
 */

export interface ReportingCurrencyContextValue {
  /** The currently selected reporting-currency code (e.g. `"EUR"`). */
  readonly currency: string;
  /** The descriptor for {@link currency} (label + symbol). */
  readonly meta: ReportingCurrency;
  /** All supported reporting currencies, in display order. */
  readonly options: readonly ReportingCurrency[];
  /** Switch the reporting currency (unsupported codes are ignored). */
  setCurrency: (code: string) => void;
}

export const ReportingCurrencyContext =
  React.createContext<ReportingCurrencyContextValue | null>(null);

/**
 * Read the shared reporting-currency state. Throws when used outside a
 * `ReportingCurrencyProvider`, so a missing provider is caught immediately.
 */
export function useReportingCurrency(): ReportingCurrencyContextValue {
  const ctx = React.useContext(ReportingCurrencyContext);
  if (!ctx) {
    throw new Error(
      "useReportingCurrency must be used within a <ReportingCurrencyProvider>",
    );
  }
  return ctx;
}

/**
 * Read the reporting-currency code without requiring a provider. Returns the
 * default currency when there is no `ReportingCurrencyProvider` above (e.g. an
 * isolated render of a shell page in a unit test), so consumers degrade to the
 * canonical base instead of throwing.
 */
export function useOptionalReportingCurrency(): string {
  const ctx = React.useContext(ReportingCurrencyContext);
  return ctx?.currency ?? DEFAULT_REPORTING_CURRENCY;
}

/**
 * Read the full reporting-currency context without requiring a provider.
 * Returns `null` when there is no `ReportingCurrencyProvider` above, so the
 * switcher control can render nothing instead of throwing in isolated renders.
 */
export function useOptionalReportingCurrencyContext(): ReportingCurrencyContextValue | null {
  return React.useContext(ReportingCurrencyContext);
}

/** The default options list, re-exported for convenience. */
export const REPORTING_OPTIONS = REPORTING_CURRENCIES;
