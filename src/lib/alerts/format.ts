import { Decimal } from "decimal.js";

import type { AlertDirection, AlertScope, AlertSeverity } from "./rule";

/**
 * Presentation helpers for the alert engine: turn exact-decimal weights into
 * human-readable strings and map enums to display labels. Kept separate from the
 * engine so the math stays pure and the formatting is unit-testable on its own.
 */

/** Format a `[0, 1]` weight as a percent string, e.g. `0.8683` → `"86.8%"`. */
export function formatWeight(weight: Decimal, fractionDigits = 1): string {
  return `${weight.times(100).toFixed(fractionDigits)}%`;
}

/** Human label for a scope. */
export const SCOPE_LABEL: Record<AlertScope, string> = {
  assetClass: "Asset class",
  position: "Position",
  currency: "Currency",
};

/** Human label for a severity. */
export const SEVERITY_LABEL: Record<AlertSeverity, string> = {
  critical: "Critical",
  warning: "Warning",
};

/**
 * A one-line description of a limit, e.g. `"max 20%"` or `"min 15%"`. Used in
 * the UI to show what the rule requires.
 */
export function formatLimit(direction: AlertDirection, threshold: Decimal): string {
  return `${direction} ${formatWeight(threshold)}`;
}
