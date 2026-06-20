import * as React from "react";

import {
  ReportingCurrencyContext,
  type ReportingCurrencyContextValue,
} from "./reporting-context";
import {
  normalizeReportingCurrency,
  reportingCurrencyMeta,
  REPORTING_CURRENCIES,
} from "./reporting-currency";
import {
  readStoredReportingCurrency,
  writeStoredReportingCurrency,
} from "./storage";

/**
 * Provider for the global reporting-currency switcher.
 *
 * Mounted once at the app root, it owns the chosen reporting-currency code:
 * seeded from `localStorage` (normalized to a supported code), and persisted on
 * change. Consumers read it via the hooks in `./reporting-context`. READ-ONLY
 * product: switching the reporting base only changes the display unit.
 */

export interface ReportingCurrencyProviderProps {
  children: React.ReactNode;
  /** Override the initial currency (mainly for tests / stories). */
  initialCurrency?: string;
}

export function ReportingCurrencyProvider({
  children,
  initialCurrency,
}: ReportingCurrencyProviderProps) {
  const [currency, setCurrencyState] = React.useState<string>(() =>
    normalizeReportingCurrency(
      initialCurrency ?? readStoredReportingCurrency(),
    ),
  );

  // Persist on every change. Only ever holds a supported code.
  React.useEffect(() => {
    writeStoredReportingCurrency(currency);
  }, [currency]);

  const setCurrency = React.useCallback((code: string) => {
    setCurrencyState((prev) => {
      const next = normalizeReportingCurrency(code);
      return next === prev ? prev : next;
    });
  }, []);

  const value = React.useMemo<ReportingCurrencyContextValue>(
    () => ({
      currency,
      meta: reportingCurrencyMeta(currency),
      options: REPORTING_CURRENCIES,
      setCurrency,
    }),
    [currency, setCurrency],
  );

  return (
    <ReportingCurrencyContext.Provider value={value}>
      {children}
    </ReportingCurrencyContext.Provider>
  );
}

export default ReportingCurrencyProvider;
