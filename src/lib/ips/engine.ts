import { Decimal } from "decimal.js";

import {
  allocationByAssetClass,
  allocationByCurrency,
  holdingContributions,
  portfolioTotal,
  FxConverter,
  type FxRateTable,
} from "../allocation";
import {
  assetClassLabel,
  isLiquidAssetClass,
  type AssetClass,
} from "../model/asset-class";
import type { Portfolio } from "../model/portfolio";
import { Money } from "../money";
import {
  toWeight,
  validatePolicy,
  type BreachSeverity,
  type ConstraintKind,
  type InvestmentPolicy,
  type IpsConstraint,
} from "./policy";

/**
 * The IPS compliance engine: evaluate an {@link InvestmentPolicy} against a
 * portfolio's allocation breakdowns and report every constraint check, flagging
 * the breaches.
 *
 * The engine reuses the m1 allocation roll-ups (by asset class and by currency)
 * and the per-holding contributions, so it sees exactly the same base-currency
 * values the rest of the app reports. Everything is exact-decimal and
 * deterministic; an explicit FX table keeps it offline.
 *
 * READ-ONLY product: the engine *reports* compliance. A breach is a governance
 * signal for a human to review; the engine never trims a position or moves money.
 */

/** Which side of a band/cap/floor a check measures. */
export type CheckBound = "min" | "max";

/**
 * A single evaluated check (one constraint may produce several — e.g. a band
 * yields a min check and a max check, a position cap yields one per holding).
 */
export interface ConstraintCheck {
  /** The constraint that produced this check. */
  constraint: IpsConstraint;
  /** Constraint kind (copied for convenience). */
  kind: ConstraintKind;
  /** Which bound this check measures. */
  bound: CheckBound;
  /** Label of the group / position / pool measured, e.g. "Equities", "USD Cash". */
  subject: string;
  /** The measured current weight in `[0, 1]`. */
  weight: Decimal;
  /** The limit weight this check compares against, in `[0, 1]`. */
  limit: Decimal;
  /**
   * Signed distance past the limit as a weight; positive only when breached:
   * `weight - limit` for a `max` check, `limit - weight` for a `min` check.
   */
  exceedance: Decimal;
  /** True when this check is breached. */
  breached: boolean;
  /** Severity (the constraint's nominal severity). */
  severity: BreachSeverity;
  /** Base-currency value of the measured subject. */
  value: Money;
  /**
   * Base-currency amount over a `max` limit / short of a `min` limit. Zero when
   * the check is within tolerance.
   */
  exceedanceAmount: Money;
}

/** A breach: a {@link ConstraintCheck} with `breached === true`. */
export type ConstraintBreach = ConstraintCheck;

/** Full compliance report. */
export interface ComplianceReport {
  /** The policy that was evaluated. */
  policy: InvestmentPolicy;
  /** Every check, sorted: breaches first (severity then exceedance), then the rest. */
  checks: ConstraintCheck[];
  /** Just the breached checks, in the same order. */
  breaches: ConstraintBreach[];
  /** Count of breaches by severity. */
  counts: Record<BreachSeverity, number>;
  /** True when nothing is breached (the book is compliant). */
  compliant: boolean;
  /** Portfolio total the weights are measured against. */
  total: Money;
  /** Base currency. */
  baseCurrency: string;
}

const SEVERITY_RANK: Record<BreachSeverity, number> = {
  critical: 0,
  warning: 1,
};

/** A measured subject: label, weight and base-currency value. */
interface Subject {
  label: string;
  weight: Decimal;
  value: Money;
}

/**
 * Evaluate one bound (`min` floor or `max` ceiling) of a constraint against a
 * measured subject. A `max` check breaches when `weight > limit`; a `min` check
 * breaches when `weight < limit`. Exact-equality is never a breach (the limit
 * itself is allowed).
 */
function evaluateBound(
  constraint: IpsConstraint,
  subject: Subject,
  bound: CheckBound,
  limit: Decimal,
  total: Money,
): ConstraintCheck {
  const { weight, value } = subject;
  const breached =
    bound === "max" ? weight.greaterThan(limit) : weight.lessThan(limit);
  const exceedance =
    bound === "max" ? weight.minus(limit) : limit.minus(weight);

  const limitValue = total.amount.times(limit);
  let exceedanceAmount: Money;
  if (!breached) {
    exceedanceAmount = Money.zero(total.currency);
  } else if (bound === "max") {
    exceedanceAmount = Money.of(value.amount.minus(limitValue), total.currency);
  } else {
    exceedanceAmount = Money.of(limitValue.minus(value.amount), total.currency);
  }

  return {
    constraint,
    kind: constraint.kind,
    bound,
    subject: subject.label,
    weight,
    limit,
    exceedance,
    breached,
    severity: constraint.severity ?? "warning",
    value,
    exceedanceAmount,
  };
}

/**
 * Evaluate an Investment Policy Statement against a portfolio.
 *
 * @param portfolio the portfolio to check.
 * @param policy the IPS; validated before use.
 * @param fxTable explicit FX table (base must match the portfolio) so the math
 *   stays deterministic and offline.
 */
export function evaluatePolicy(
  portfolio: Portfolio,
  policy: InvestmentPolicy,
  fxTable: FxRateTable,
): ComplianceReport {
  validatePolicy(policy);

  const fx = FxConverter.fromTable(fxTable);
  // The contract above requires the FX base to match the portfolio's base
  // currency; otherwise weights and exceedance amounts would be reported in an
  // unintended base context. Fail loudly instead of producing a wrong report.
  if (fx.base !== portfolio.baseCurrency.trim().toUpperCase()) {
    throw new Error(
      `evaluatePolicy: fxTable base (${fx.base}) must match portfolio base currency (${portfolio.baseCurrency})`,
    );
  }
  const total = portfolioTotal(portfolio, fx);
  const totalAmount = total.amount;
  const zero = Money.zero(total.currency);

  // Pre-compute breakdowns once, indexed for O(1) lookup.
  const byClass = new Map(
    allocationByAssetClass(portfolio, fxTable).slices.map((s) => [s.key, s]),
  );
  const byCurrency = new Map(
    allocationByCurrency(portfolio, fxTable).slices.map((s) => [s.key, s]),
  );
  const contributions = holdingContributions(portfolio, fx);

  const weightOf = (value: Money): Decimal =>
    totalAmount.isZero() ? new Decimal(0) : value.amount.div(totalAmount);

  // Liquid pool: sum of every liquid-asset-class slice.
  let liquidValue = zero;
  for (const [ac, slice] of byClass) {
    if (isLiquidAssetClass(ac as AssetClass)) {
      liquidValue = liquidValue.plus(slice.value);
    }
  }

  const checks: ConstraintCheck[] = [];

  for (const constraint of policy.constraints) {
    switch (constraint.kind) {
      case "assetClassBand": {
        const slice = byClass.get(constraint.assetClass);
        const value = slice?.value ?? zero;
        const subject: Subject = {
          label: assetClassLabel(constraint.assetClass),
          weight: weightOf(value),
          value,
        };
        if (constraint.min !== undefined) {
          checks.push(
            evaluateBound(constraint, subject, "min", toWeight(constraint.min), total),
          );
        }
        if (constraint.max !== undefined) {
          checks.push(
            evaluateBound(constraint, subject, "max", toWeight(constraint.max), total),
          );
        }
        break;
      }
      case "positionCap": {
        const limit = toWeight(constraint.max);
        for (const { holding, value } of contributions) {
          if (!value) continue; // an unvalued holding contributes nothing.
          checks.push(
            evaluateBound(
              constraint,
              { label: holding.name, weight: weightOf(value), value },
              "max",
              limit,
              total,
            ),
          );
        }
        break;
      }
      case "liquidityFloor": {
        checks.push(
          evaluateBound(
            constraint,
            { label: "Liquid assets", weight: weightOf(liquidValue), value: liquidValue },
            "min",
            toWeight(constraint.min),
            total,
          ),
        );
        break;
      }
      case "currencyCap": {
        const code = constraint.currency.trim().toUpperCase();
        const slice = byCurrency.get(code);
        const value = slice?.value ?? zero;
        checks.push(
          evaluateBound(
            constraint,
            { label: code, weight: weightOf(value), value },
            "max",
            toWeight(constraint.max),
            total,
          ),
        );
        break;
      }
    }
  }

  // Sort: breaches first; among breaches by severity then descending exceedance;
  // non-breaches after, by descending weight; ties broken by constraint id +
  // bound + subject for stability.
  checks.sort((a, b) => {
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
    if (a.constraint.id !== b.constraint.id) {
      return a.constraint.id < b.constraint.id ? -1 : 1;
    }
    if (a.bound !== b.bound) return a.bound < b.bound ? -1 : 1;
    return a.subject < b.subject ? -1 : a.subject > b.subject ? 1 : 0;
  });

  const breaches = checks.filter((c) => c.breached);
  const counts: Record<BreachSeverity, number> = { critical: 0, warning: 0 };
  for (const b of breaches) counts[b.severity]++;

  return {
    policy,
    checks,
    breaches,
    counts,
    compliant: breaches.length === 0,
    total,
    baseCurrency: total.currency,
  };
}
