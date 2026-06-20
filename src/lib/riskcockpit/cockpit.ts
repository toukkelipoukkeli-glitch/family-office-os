import { Decimal } from "decimal.js";

import type { Entity } from "../org/entity";
import {
  consolidateLookThrough,
  type EntityHoldings,
  type LookThroughReport,
} from "../lookthrough";
import { assetClassLabel, type AssetClass } from "../lookthrough/exposure";
import { Money } from "../money";
import {
  maxDrawdown,
  sharpeRatio,
  volatility,
  type MaxDrawdown,
} from "../risk";

import {
  LIQUIDITY_TIER_BY_CLASS,
  liquidityTierLabel,
  validateLimitSet,
  type LiquidityTier,
  type RiskLimit,
  type RiskLimitSet,
} from "./limits";

/**
 * Risk-limits cockpit engine (unit m9-risk-limits).
 *
 * Composes four read-only views of the family book into one cross-asset risk
 * picture:
 *
 *  1. **Look-through concentration** — the true underlying weight of each asset
 *     class once every ownership stake is seen through (reusing the m8
 *     look-through consolidation).
 *  2. **Risk limits** — each {@link RiskLimit} evaluated against that
 *     consolidated weight, flagging the breaches. The headline oracle is the
 *     `concentration` check: aggregated look-through weight vs the cap.
 *  3. **Liquidity tiers** — the book split into liquid / semi-liquid / illiquid
 *     tiers, with a liquidity-floor and illiquid-cap check.
 *  4. **Risk metrics** — annualized volatility, max drawdown and Sharpe from a
 *     supplied periodic return series.
 *
 * Everything is exact-decimal (weights via {@link Decimal}, money via
 * {@link Money}) and deterministic; the return-series statistics are the only
 * floating-point figures and are descriptive only. Pure and React-free so the
 * whole cockpit can be asserted in a unit test (the oracle).
 *
 * READ-ONLY product: the engine *reports* concentration and breaches for a
 * human to act on; it never trims a position or moves money.
 */

/** One evaluated limit check. */
export interface LimitCheck {
  /** The limit that produced this check. */
  limit: RiskLimit;
  /** Limit kind (copied for convenience). */
  kind: RiskLimit["kind"];
  /** Which bound this check measures. */
  bound: "min" | "max";
  /** Label of the subject measured, e.g. "Real estate", "Liquid assets". */
  subject: string;
  /** The measured current weight in `[0, 1]`. */
  weight: number;
  /** The limit weight this check compares against, in `[0, 1]`. */
  threshold: number;
  /**
   * Signed distance past the limit as a weight; positive only when breached:
   * `weight - threshold` for a `max` check, `threshold - weight` for a `min`.
   */
  exceedance: number;
  /** True when this check is breached. */
  breached: boolean;
  /** Severity (the limit's nominal severity). */
  severity: "warning" | "critical";
  /** Look-through value of the measured subject. */
  value: Money;
}

/** A look-through concentration line measured against any matching limits. */
export interface ConcentrationLine {
  assetClass: AssetClass;
  label: string;
  liquidityTier: LiquidityTier;
  /** Look-through value the family owns in this class. */
  value: Money;
  /** Share of total look-through exposure (0..1). */
  weight: number;
  /** The concentration cap that applies to this class, if any. */
  limit: number | null;
  /** True when a concentration cap applies and is breached. */
  breached: boolean;
}

/** One liquidity tier rolled up from the look-through lines. */
export interface LiquidityTierLine {
  tier: LiquidityTier;
  label: string;
  value: Money;
  weight: number;
}

/** Annualized risk metrics from the supplied return series. */
export interface RiskMetrics {
  /** Number of periodic returns the metrics were computed from. */
  periods: number;
  /** Periods per year used to annualize (252 daily, 12 monthly, …). */
  periodsPerYear: number;
  /** Annualized volatility (standard deviation of returns). */
  volatility: number;
  /** Max peak-to-trough drawdown of the compounded equity curve, in `[0, 1]`. */
  maxDrawdown: MaxDrawdown;
  /** Annualized Sharpe ratio at the supplied risk-free rate. */
  sharpe: number;
  /** Annual risk-free rate used for the Sharpe ratio. */
  riskFreeRate: number;
}

/** The full risk-cockpit report. */
export interface RiskCockpitReport {
  /** The reporting root entity. */
  rootId: string;
  rootName: string;
  currency: string;
  /** Total look-through value across all asset classes. */
  total: Money;
  /** The underlying look-through report (for drill-down). */
  lookThrough: LookThroughReport;
  /** Per-asset-class concentration lines, sorted by weight desc. */
  concentration: ConcentrationLine[];
  /** Liquidity tiers, in liquid → semi-liquid → illiquid order. */
  liquidityTiers: LiquidityTierLine[];
  /** Every limit check, breaches first. */
  checks: LimitCheck[];
  /** Just the breached checks, in the same order. */
  breaches: LimitCheck[];
  /** Count of breaches by severity. */
  counts: Record<"warning" | "critical", number>;
  /** True when nothing is breached. */
  compliant: boolean;
  /** The look-through weight of the single most concentrated asset class. */
  topConcentration: ConcentrationLine | null;
  /** Annualized risk metrics from the return series. */
  metrics: RiskMetrics;
}

const SEVERITY_RANK: Record<"critical" | "warning", number> = {
  critical: 0,
  warning: 1,
};

/** Options controlling the cockpit evaluation. */
export interface CockpitOptions {
  /** Periods per year for the return series (252 daily, 12 monthly). Default 252. */
  periodsPerYear?: number;
  /** Annual risk-free rate for the Sharpe ratio. Default 0. */
  riskFreeRate?: number;
  /** Fallback currency when the book has no holdings. Default "USD". */
  currency?: string;
}

/** Round a weight to avoid presenting float dust as a breach. */
function weightOf(value: Decimal, total: Decimal): number {
  return total.isZero() ? 0 : value.div(total).toNumber();
}

/**
 * Evaluate a risk-limit set against a consolidated look-through book.
 *
 * @param entities the org hierarchy (validated for cycles by the look-through
 *   consolidation).
 * @param holdings per-entity direct holdings.
 * @param rootId the entity to report from (e.g. the family trust).
 * @param limitSet the governed risk limits; validated before use.
 * @param returns a periodic simple-return series for the metrics panel.
 * @param opts annualization + risk-free rate + fallback currency.
 */
export function evaluateRiskCockpit(
  entities: readonly Entity[],
  holdings: readonly EntityHoldings[],
  rootId: string,
  limitSet: RiskLimitSet,
  returns: readonly number[],
  opts: CockpitOptions = {},
): RiskCockpitReport {
  validateLimitSet(limitSet);

  const periodsPerYear = opts.periodsPerYear ?? 252;
  const riskFreeRate = opts.riskFreeRate ?? 0;

  const lookThrough = consolidateLookThrough(entities, holdings, rootId, {
    currency: opts.currency ?? "USD",
  });
  const currency = lookThrough.currency;
  const total = lookThrough.total.amount;

  // Index the look-through value of every asset class for O(1) lookup.
  const valueByClass = new Map<AssetClass, Decimal>();
  for (const line of lookThrough.lines) {
    valueByClass.set(line.assetClass, line.value.amount);
  }

  // Concentration lines: one per look-through asset class, tagged with its
  // liquidity tier and the concentration cap (if any) that applies to it.
  const capByClass = new Map<AssetClass, RiskLimit & { kind: "concentration" }>();
  for (const limit of limitSet.limits) {
    if (limit.kind === "concentration") capByClass.set(limit.assetClass, limit);
  }

  const concentration: ConcentrationLine[] = lookThrough.lines.map((line) => {
    const weight = line.weight;
    const cap = capByClass.get(line.assetClass);
    const limit = cap ? cap.max : null;
    return {
      assetClass: line.assetClass,
      label: assetClassLabel(line.assetClass),
      liquidityTier: LIQUIDITY_TIER_BY_CLASS[line.assetClass],
      value: line.value,
      weight,
      limit,
      breached: limit !== null && weight > limit,
    };
  });
  // Already sorted by value desc from the look-through report; keep that order.

  // Liquidity tiers: roll up look-through value into the three tiers.
  const tierTotals = new Map<LiquidityTier, Decimal>([
    ["liquid", new Decimal(0)],
    ["semi_liquid", new Decimal(0)],
    ["illiquid", new Decimal(0)],
  ]);
  for (const line of lookThrough.lines) {
    const tier = LIQUIDITY_TIER_BY_CLASS[line.assetClass];
    tierTotals.set(tier, tierTotals.get(tier)!.plus(line.value.amount));
  }
  const TIER_ORDER: LiquidityTier[] = ["liquid", "semi_liquid", "illiquid"];
  const liquidityTiers: LiquidityTierLine[] = TIER_ORDER.map((tier) => {
    const v = tierTotals.get(tier)!;
    return {
      tier,
      label: liquidityTierLabel(tier),
      value: Money.of(v, currency),
      weight: weightOf(v, total),
    };
  });
  const liquidWeight = weightOf(tierTotals.get("liquid")!, total);
  const liquidValue = Money.of(tierTotals.get("liquid")!, currency);
  const illiquidWeight = weightOf(tierTotals.get("illiquid")!, total);
  const illiquidValue = Money.of(tierTotals.get("illiquid")!, currency);

  // Evaluate every limit into a check.
  const checks: LimitCheck[] = [];
  for (const limit of limitSet.limits) {
    if (limit.kind === "concentration") {
      const value = valueByClass.get(limit.assetClass) ?? new Decimal(0);
      const weight = weightOf(value, total);
      const breached = weight > limit.max;
      checks.push({
        limit,
        kind: limit.kind,
        bound: "max",
        subject: assetClassLabel(limit.assetClass),
        weight,
        threshold: limit.max,
        exceedance: weight - limit.max,
        breached,
        severity: limit.severity ?? "warning",
        value: Money.of(value, currency),
      });
    } else if (limit.kind === "liquidityFloor") {
      const breached = liquidWeight < limit.min;
      checks.push({
        limit,
        kind: limit.kind,
        bound: "min",
        subject: "Liquid assets",
        weight: liquidWeight,
        threshold: limit.min,
        exceedance: limit.min - liquidWeight,
        breached,
        severity: limit.severity ?? "warning",
        value: liquidValue,
      });
    } else {
      // illiquidCap
      const breached = illiquidWeight > limit.max;
      checks.push({
        limit,
        kind: limit.kind,
        bound: "max",
        subject: "Illiquid assets",
        weight: illiquidWeight,
        threshold: limit.max,
        exceedance: illiquidWeight - limit.max,
        breached,
        severity: limit.severity ?? "warning",
        value: illiquidValue,
      });
    }
  }

  // Sort: breaches first; among breaches by severity then descending exceedance;
  // non-breaches after, by descending weight; ties broken by limit id + subject.
  checks.sort((a, b) => {
    if (a.breached !== b.breached) return a.breached ? -1 : 1;
    if (a.breached) {
      const sev = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      if (sev !== 0) return sev;
      if (a.exceedance !== b.exceedance) return b.exceedance - a.exceedance;
    } else if (a.weight !== b.weight) {
      return b.weight - a.weight;
    }
    if (a.limit.id !== b.limit.id) return a.limit.id < b.limit.id ? -1 : 1;
    return a.subject < b.subject ? -1 : a.subject > b.subject ? 1 : 0;
  });

  const breaches = checks.filter((c) => c.breached);
  const counts: Record<"warning" | "critical", number> = {
    warning: 0,
    critical: 0,
  };
  for (const b of breaches) counts[b.severity]++;

  // Risk metrics from the return series. Guard the degenerate empty/short case
  // so a missing series degrades to zeros rather than throwing.
  let metrics: RiskMetrics;
  if (returns.length >= 2) {
    metrics = {
      periods: returns.length,
      periodsPerYear,
      volatility: volatility(returns, { periodsPerYear }),
      maxDrawdown: maxDrawdown(returns),
      sharpe: sharpeRatio(returns, { periodsPerYear, riskFreeRate }),
      riskFreeRate,
    };
  } else {
    metrics = {
      periods: returns.length,
      periodsPerYear,
      volatility: 0,
      maxDrawdown: { maxDrawdown: 0, peakIndex: -1, troughIndex: -1 },
      sharpe: 0,
      riskFreeRate,
    };
  }

  return {
    rootId: lookThrough.rootId,
    rootName: lookThrough.rootName,
    currency,
    total: lookThrough.total,
    lookThrough,
    concentration,
    liquidityTiers,
    checks,
    breaches,
    counts,
    compliant: breaches.length === 0,
    topConcentration: concentration.length > 0 ? concentration[0] : null,
    metrics,
  };
}
