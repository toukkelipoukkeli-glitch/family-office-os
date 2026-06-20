import { Decimal } from "decimal.js";

import {
  allocationByAssetClass,
  allocationByCurrency,
  holdingContributions,
  portfolioTotal,
  FxConverter,
  type FxRateTable,
} from "../allocation";
import { assetClassLabel } from "../model/asset-class";
import type { Portfolio } from "../model/portfolio";
import { Money } from "../money";
import {
  toWeight,
  validateRule,
  type AlertDirection,
  type AlertRule,
  type AlertScope,
  type AlertSeverity,
} from "./rule";

/**
 * The alert engine: evaluate a set of {@link AlertRule}s against a portfolio's
 * allocation breakdowns and report every breach.
 *
 * The engine reuses the m1 allocation roll-ups (by asset class and by currency)
 * and the per-holding contributions, so a "position" rule sees the same
 * base-currency values the rest of the app reports. All weights are exact
 * decimals in `[0, 1]`.
 *
 * READ-ONLY product: the engine *reports* breaches. A breach is a signal for a
 * human to review; the engine never trims a position or moves money.
 */

/** A single rule evaluated against the portfolio (breached or not). */
export interface AlertEvaluation {
  /** The rule that was evaluated. */
  rule: AlertRule;
  /** The rule's scope (copied for convenience). */
  scope: AlertScope;
  /** Direction of the limit. */
  direction: AlertDirection;
  /** Label of the group / position being measured. */
  subject: string;
  /** The measured current weight in `[0, 1]`. */
  weight: Decimal;
  /** The limit weight in `[0, 1]`. */
  threshold: Decimal;
  /**
   * Signed distance past the limit, as a weight. Positive only when breached:
   * `weight - threshold` for `max` rules, `threshold - weight` for `min` rules.
   * Non-positive (clamped to the actual difference) when within the limit.
   */
  exceedance: Decimal;
  /** True when the rule is breached. */
  breached: boolean;
  /** Severity if breached (otherwise the rule's nominal severity). */
  severity: AlertSeverity;
  /** Base-currency value of the measured subject. */
  value: Money;
  /**
   * Base-currency amount that is *over* a `max` limit (the slice of value above
   * the ceiling), or *short* of a `min` limit. Zero when within the limit.
   */
  exceedanceAmount: Money;
}

/** Full report: every evaluation plus the breached subset and a summary. */
export interface AlertReport {
  /** Every rule evaluated, sorted: breaches first (by severity then exceedance). */
  evaluations: AlertEvaluation[];
  /** Just the breached evaluations, in the same order. */
  breaches: AlertEvaluation[];
  /** Count of breaches by severity. */
  counts: Record<AlertSeverity, number>;
  /** Portfolio total the weights are measured against. */
  total: Money;
  /** Base currency. */
  baseCurrency: string;
}

const SEVERITY_RANK: Record<AlertSeverity, number> = {
  critical: 0,
  warning: 1,
};

/** A measured subject: its label, weight and base-currency value. */
interface Subject {
  label: string;
  weight: Decimal;
  value: Money;
}

/**
 * Evaluate a single rule against one measured {@link Subject}.
 *
 * `max` breaches when `weight > threshold`; `min` breaches when
 * `weight < threshold`. Exact-equality is never a breach (the limit itself is
 * allowed). The exceedance amount is the value slice past the limit.
 */
function evaluateSubject(
  rule: AlertRule,
  subject: Subject,
  threshold: Decimal,
  total: Money,
): AlertEvaluation {
  const { weight, value } = subject;
  const direction = rule.direction;
  const breached =
    direction === "max"
      ? weight.greaterThan(threshold)
      : weight.lessThan(threshold);

  const exceedance =
    direction === "max" ? weight.minus(threshold) : threshold.minus(weight);

  // Value over (max) / short of (min) the limit, expressed in base currency.
  const limitValue = total.amount.times(threshold);
  let exceedanceAmount: Money;
  if (!breached) {
    exceedanceAmount = Money.zero(total.currency);
  } else if (direction === "max") {
    exceedanceAmount = Money.of(value.amount.minus(limitValue), total.currency);
  } else {
    exceedanceAmount = Money.of(limitValue.minus(value.amount), total.currency);
  }

  return {
    rule,
    scope: rule.scope,
    direction,
    subject: subject.label,
    weight,
    threshold,
    exceedance,
    breached,
    severity: rule.severity ?? "warning",
    value,
    exceedanceAmount,
  };
}

/**
 * Run an alert rule set over a portfolio.
 *
 * @param portfolio the portfolio to check.
 * @param rules the limit rules; each is validated before use.
 * @param fxTable explicit FX table (base must match the portfolio) so the math
 *   stays deterministic and offline.
 */
export function evaluateAlerts(
  portfolio: Portfolio,
  rules: AlertRule[],
  fxTable: FxRateTable,
): AlertReport {
  const fx = FxConverter.fromTable(fxTable);
  const total = portfolioTotal(portfolio, fx);
  const totalAmount = total.amount;

  // Pre-compute breakdowns once and index them by key for O(1) lookup.
  const byClass = new Map(
    allocationByAssetClass(portfolio, fxTable).slices.map((s) => [
      s.key,
      s,
    ]),
  );
  const byCurrency = new Map(
    allocationByCurrency(portfolio, fxTable).slices.map((s) => [s.key, s]),
  );
  const contributions = holdingContributions(portfolio, fx);

  const zero = Money.zero(total.currency);
  const weightOf = (value: Money): Decimal =>
    totalAmount.isZero() ? new Decimal(0) : value.amount.div(totalAmount);

  const evaluations: AlertEvaluation[] = [];

  for (const raw of rules) {
    const rule = validateRule(raw);
    const threshold = toWeight(rule.threshold);

    if (rule.scope === "position") {
      // One evaluation per valued holding; a min/floor position rule on an empty
      // book has nothing to measure and is skipped.
      for (const { holding, value } of contributions) {
        if (!value) continue;
        evaluations.push(
          evaluateSubject(
            rule,
            { label: holding.name, weight: weightOf(value), value },
            threshold,
            total,
          ),
        );
      }
      continue;
    }

    if (rule.scope === "assetClass") {
      const ac = rule.target!.assetClass!;
      const slice = byClass.get(ac);
      const value = slice?.value ?? zero;
      evaluations.push(
        evaluateSubject(
          rule,
          { label: assetClassLabel(ac), weight: weightOf(value), value },
          threshold,
          total,
        ),
      );
      continue;
    }

    // currency scope
    const code = rule.target!.currency!.trim().toUpperCase();
    const slice = byCurrency.get(code);
    const value = slice?.value ?? zero;
    evaluations.push(
      evaluateSubject(
        rule,
        { label: code, weight: weightOf(value), value },
        threshold,
        total,
      ),
    );
  }

  // Sort: breaches first; among breaches by severity then descending exceedance;
  // non-breaches after, by descending weight; ties broken by rule id + subject
  // for stability.
  evaluations.sort((a, b) => {
    if (a.breached !== b.breached) return a.breached ? -1 : 1;
    if (a.breached) {
      const sev = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      if (sev !== 0) return sev;
      const exc = b.exceedance.comparedTo(a.exceedance);
      if (exc !== 0) return exc;
    } else {
      const w = b.weight.comparedTo(a.weight);
      if (w !== 0) return w;
    }
    if (a.rule.id !== b.rule.id) return a.rule.id < b.rule.id ? -1 : 1;
    return a.subject < b.subject ? -1 : a.subject > b.subject ? 1 : 0;
  });

  const breaches = evaluations.filter((e) => e.breached);
  const counts: Record<AlertSeverity, number> = { critical: 0, warning: 0 };
  for (const b of breaches) counts[b.severity]++;

  return {
    evaluations,
    breaches,
    counts,
    total,
    baseCurrency: total.currency,
  };
}
