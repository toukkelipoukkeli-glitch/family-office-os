import { Decimal } from "decimal.js";

import type { AssetClass } from "../model/asset-class";

/**
 * Concentration & limit-breach alert rules.
 *
 * A family office sets prudential limits: "no single position above 20% of the
 * book", "crypto must stay under 5%", "keep at least 3% in cash", "no more than
 * 60% of the book denominated in a non-base currency". This module models those
 * thresholds as declarative {@link AlertRule}s. The engine ({@link ./engine})
 * evaluates them against a portfolio's allocation breakdowns and surfaces any
 * breaches on the dashboard.
 *
 * READ-ONLY product: a rule describes a limit and the engine reports whether it
 * is breached. Nothing here moves money, trims a position, or places a trade —
 * a breach is a diagnostic for a human, never an instruction.
 */

/**
 * What a rule's threshold is measured against.
 *
 * - `assetClass` — the weight of one {@link AssetClass} in the whole portfolio.
 * - `position` — the weight of any single holding (the rule applies to *each*
 *   position; the engine flags the ones that breach).
 * - `currency` — the weight of holdings denominated in one currency.
 */
export type AlertScope = "assetClass" | "position" | "currency";

/**
 * The direction of a limit.
 *
 * - `max` — the measured weight must stay **at or below** `threshold`; a weight
 *   strictly greater than the threshold is a breach (over-concentration).
 * - `min` — the measured weight must stay **at or above** `threshold`; a weight
 *   strictly below the threshold is a breach (under-allocation, e.g. a cash
 *   floor).
 */
export type AlertDirection = "max" | "min";

/** Severity assigned to a breach, used to sort and colour alerts. */
export type AlertSeverity = "warning" | "critical";

/** A target a rule applies to. */
export interface AlertTarget {
  /** Asset class this rule limits (required when `scope` is `assetClass`). */
  assetClass?: AssetClass;
  /** Currency code this rule limits (required when `scope` is `currency`). */
  currency?: string;
}

/** Threshold value accepted as an exact decimal weight in `[0, 1]`. */
export type WeightInput = Decimal | string | number;

/**
 * A single concentration / limit rule.
 *
 * Thresholds are **weights** in the inclusive range `[0, 1]` (a fraction of the
 * portfolio's total base-currency value), kept as exact decimals so the math is
 * deterministic.
 */
export interface AlertRule {
  /** Stable id, unique within a rule set. */
  id: string;
  /** Human-readable label, e.g. "Crypto exposure". */
  label: string;
  /** What the threshold is measured against. */
  scope: AlertScope;
  /** Whether `threshold` is a ceiling (`max`) or a floor (`min`). */
  direction: AlertDirection;
  /** Limit as a weight in `[0, 1]`. */
  threshold: WeightInput;
  /** Severity to assign when this rule is breached. Defaults to `warning`. */
  severity?: AlertSeverity;
  /**
   * Which group this rule targets. Omitted for `position` rules (they apply to
   * every holding); required for `assetClass` and `currency` rules.
   */
  target?: AlertTarget;
}

/** Coerce a {@link WeightInput} into a `[0, 1]` Decimal, throwing on bad input. */
export function toWeight(value: WeightInput, what = "weight"): Decimal {
  const d = value instanceof Decimal ? value : new Decimal(value);
  if (!d.isFinite() || d.isNegative() || d.greaterThan(1)) {
    throw new Error(`${what} must be a finite number in [0, 1]: ${String(value)}`);
  }
  return d;
}

/**
 * Validate a rule's shape: a positive threshold weight and the target required
 * by its scope. Returns the rule for chaining; throws on an invalid rule so a
 * malformed rule set fails loudly instead of silently never firing.
 */
export function validateRule(rule: AlertRule): AlertRule {
  toWeight(rule.threshold, `rule ${rule.id} threshold`);
  if (rule.scope === "assetClass" && !rule.target?.assetClass) {
    throw new Error(`rule ${rule.id}: assetClass scope requires target.assetClass`);
  }
  if (rule.scope === "currency" && !rule.target?.currency) {
    throw new Error(`rule ${rule.id}: currency scope requires target.currency`);
  }
  return rule;
}
