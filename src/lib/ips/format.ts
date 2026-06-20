import { Decimal } from "decimal.js";

import type { CheckBound } from "./engine";
import type { ConstraintKind, BreachSeverity } from "./policy";

/**
 * Presentation helpers for the IPS engine: turn exact-decimal weights into
 * human-readable strings and map enums to display labels. Kept separate from the
 * engine so the math stays pure and the formatting is unit-testable on its own.
 */

/** Format a `[0, 1]` weight as a percent string, e.g. `0.8683` → `"86.8%"`. */
export function formatWeight(weight: Decimal, fractionDigits = 1): string {
  return `${weight.times(100).toFixed(fractionDigits)}%`;
}

/** Human label for a constraint kind. */
export const KIND_LABEL: Record<ConstraintKind, string> = {
  assetClassBand: "Allocation band",
  positionCap: "Position cap",
  liquidityFloor: "Liquidity floor",
  currencyCap: "Currency cap",
};

/** Human label for a severity. */
export const SEVERITY_LABEL: Record<BreachSeverity, string> = {
  critical: "Critical",
  warning: "Warning",
};

/**
 * A one-line description of a limit, e.g. `"max 20.0%"` or `"min 15.0%"`. Used
 * in the UI to show what the check requires.
 */
export function formatLimit(bound: CheckBound, limit: Decimal): string {
  return `${bound} ${formatWeight(limit)}`;
}
