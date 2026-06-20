import { Coins } from "lucide-react";

import {
  useOptionalReportingCurrencyContext,
} from "@/lib/reporting-currency";
import { cn } from "@/lib/utils";

export interface ReportingCurrencySwitcherProps {
  className?: string;
  /** `data-testid` for the `<select>` (defaults to `reporting-currency`). */
  testId?: string;
}

/**
 * Global reporting-currency switcher surfaced in the app chrome.
 *
 * A compact native `<select>` lets the user choose the base currency every
 * portfolio value across the app is re-expressed in. The choice is held in the
 * shared {@link useReportingCurrency} state (persisted to `localStorage`), so it
 * applies on every page and survives reloads. Hidden from print so the control
 * never bleeds into reports.
 *
 * Renders nothing when there is no `ReportingCurrencyProvider` above (e.g. an
 * isolated unit render of a shell page), degrading gracefully like the other
 * chrome controls.
 */
export function ReportingCurrencySwitcher({
  className,
  testId = "reporting-currency",
}: ReportingCurrencySwitcherProps) {
  const ctx = useOptionalReportingCurrencyContext();
  if (!ctx) return null;

  const { currency, options, setCurrency } = ctx;

  return (
    <label
      className={cn(
        "relative inline-flex items-center print:hidden",
        className,
      )}
    >
      <span className="sr-only">Reporting currency</span>
      <Coins
        className="pointer-events-none absolute left-2.5 h-4 w-4 text-muted-foreground"
        aria-hidden="true"
      />
      <select
        data-testid={testId}
        value={currency}
        onChange={(e) => setCurrency(e.target.value)}
        title={`Reporting currency: ${currency}`}
        aria-label="Reporting currency"
        className={cn(
          "h-9 cursor-pointer appearance-none rounded-md border border-border bg-background",
          "pl-8 pr-7 text-sm font-medium tabular-nums text-foreground transition-colors",
          "hover:bg-accent hover:text-accent-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        {options.map((opt) => (
          <option key={opt.code} value={opt.code}>
            {opt.code} · {opt.label}
          </option>
        ))}
      </select>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-2.5 text-xs text-muted-foreground"
      >
        ▾
      </span>
    </label>
  );
}

export default ReportingCurrencySwitcher;
