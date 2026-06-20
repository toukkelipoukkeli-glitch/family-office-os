import {
  DEFAULT_REPORTING_CURRENCY,
  normalizeReportingCurrency,
} from "./reporting-currency";

/**
 * Persistence for the global reporting-currency preference.
 *
 * The preference is a single supported currency code stored in `localStorage`,
 * so the chosen reporting base survives reloads and navigation. All access is
 * SSR-/test-safe: missing, malformed, or unsupported storage degrades to the
 * default currency rather than throwing. READ-ONLY product: nothing here moves
 * money.
 */

/** localStorage key the reporting-currency preference is persisted under. */
export const REPORTING_CURRENCY_STORAGE_KEY = "fo-os:reporting-currency";

/**
 * Resolve `window.localStorage` defensively. The property access itself can
 * throw synchronously in privacy-restricted contexts (e.g. blocked storage), so
 * it must be wrapped — not just the `getItem`/`setItem` calls.
 */
function getLocalStorageSafe(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Read the persisted reporting currency. Returns {@link DEFAULT_REPORTING_CURRENCY}
 * when unset, unsupported, or storage is unavailable.
 */
export function readStoredReportingCurrency(): string {
  const storage = getLocalStorageSafe();
  if (!storage) return DEFAULT_REPORTING_CURRENCY;
  try {
    const raw = storage.getItem(REPORTING_CURRENCY_STORAGE_KEY);
    return normalizeReportingCurrency(raw);
  } catch {
    return DEFAULT_REPORTING_CURRENCY;
  }
}

/**
 * Persist the reporting currency. Unsupported codes are normalized to the
 * default before storing. No-ops when storage is unavailable.
 */
export function writeStoredReportingCurrency(code: string): void {
  const storage = getLocalStorageSafe();
  if (!storage) return;
  try {
    storage.setItem(
      REPORTING_CURRENCY_STORAGE_KEY,
      normalizeReportingCurrency(code),
    );
  } catch {
    // Quota or privacy mode — the preference just won't persist.
  }
}
