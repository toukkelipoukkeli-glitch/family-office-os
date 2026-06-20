import { samplePortfolio } from "../model/fixtures";
import type { Portfolio } from "../model/portfolio";
import { usdRateTable } from "../allocation/fixtures";
import type { FxRateTable } from "../allocation/fx";
import type { AlertRule } from "./rule";

/**
 * Deterministic, offline fixtures for the alert engine — used by the engine
 * tests and by the dashboard UI.
 *
 * With {@link samplePortfolio} (base USD, EUR = 1.10) the base-currency mix is:
 *  - Cash (USD):   250,000  → 86.83%
 *  - Equity (USD):  30,000  → 10.42%
 *  - Wine (EUR):     7,920  →  2.75%
 *  - total:        287,920
 *
 * Currency exposure (by holding currency):
 *  - USD: 280,000  → 97.25%
 *  - EUR:   7,920  →  2.75%
 *
 * The default rule set below is chosen so the sample portfolio breaches some
 * rules and satisfies others, giving the UI a realistic mix:
 *  - "single position" 20% ceiling → BREACHED by USD Cash (86.83%).
 *  - "cash" 50% ceiling            → BREACHED by Cash (86.83%).
 *  - "crypto" 5% ceiling           → satisfied (no crypto, 0%).
 *  - "equity floor" 15% minimum    → BREACHED (equity only 10.42%).
 *  - "non-base FX" — EUR 25% ceiling → satisfied (EUR 2.75%).
 */

/** Re-export the shared sample portfolio for convenience. */
export const alertsPortfolio: Portfolio = samplePortfolio;

/** Re-export the shared USD rate table (base USD, EUR 1.10, GBP 1.25). */
export const alertsRateTable: FxRateTable = usdRateTable;

/** A realistic default rule set for a conservative family office. */
export const defaultAlertRules: AlertRule[] = [
  {
    id: "pos-single-20",
    label: "Single-position limit",
    scope: "position",
    direction: "max",
    threshold: "0.20",
    severity: "critical",
  },
  {
    id: "ac-cash-50",
    label: "Cash ceiling",
    scope: "assetClass",
    direction: "max",
    threshold: "0.50",
    severity: "warning",
    target: { assetClass: "cash" },
  },
  {
    id: "ac-crypto-5",
    label: "Crypto exposure",
    scope: "assetClass",
    direction: "max",
    threshold: "0.05",
    severity: "warning",
    target: { assetClass: "crypto" },
  },
  {
    id: "ac-equity-floor-15",
    label: "Equity floor",
    scope: "assetClass",
    direction: "min",
    threshold: "0.15",
    severity: "warning",
    target: { assetClass: "equity" },
  },
  {
    id: "ccy-eur-25",
    label: "EUR exposure",
    scope: "currency",
    direction: "max",
    threshold: "0.25",
    severity: "warning",
    target: { currency: "EUR" },
  },
];
