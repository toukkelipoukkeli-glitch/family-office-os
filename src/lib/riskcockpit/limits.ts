import type { AssetClass } from "../lookthrough/exposure";

/**
 * Risk-limits cockpit (unit m9-risk-limits) — the limit model.
 *
 * The cockpit takes the *look-through* exposure of the family book (the true
 * underlying concentration once every ownership stake is seen through, from the
 * m8 look-through engine) and measures it against a small set of governed risk
 * limits:
 *
 *  - `concentration` — a single asset class's look-through weight must stay at
 *    or below a ceiling (the true cross-asset concentration cap). This is the
 *    headline oracle: aggregated look-through concentration vs limit.
 *  - `liquidityFloor` — at least `min` of the book must sit in the liquid
 *    liquidity tier (assets that could be realised quickly).
 *  - `illiquidCap` — no more than `max` of the book may sit in the illiquid
 *    liquidity tier (assets that take quarters/years to exit).
 *
 * READ-ONLY product: a limit describes the mandate and the engine reports
 * whether the consolidated book complies. A breach is a governance signal for a
 * human (rebalance, waive, or amend the policy) — never an instruction that
 * moves money or places a trade. All weights are fractions in `[0, 1]`.
 */

/** Severity assigned to a breach, used to sort and colour findings. */
export type LimitSeverity = "warning" | "critical";

/**
 * Liquidity tier of an asset class: how quickly the family could realise it.
 *
 *  - `liquid` — public-market instruments and cash (equity, fixed income,
 *    cash, commodities, crypto): sellable in days.
 *  - `semi_liquid` — real estate and "other": realisable in months, at a cost.
 *  - `illiquid` — private equity: locked up for years.
 */
export type LiquidityTier = "liquid" | "semi_liquid" | "illiquid";

/** The fixed liquidity tier each look-through asset class maps to. */
export const LIQUIDITY_TIER_BY_CLASS: Record<AssetClass, LiquidityTier> = {
  equity: "liquid",
  fixed_income: "liquid",
  cash: "liquid",
  commodities: "liquid",
  crypto: "liquid",
  real_estate: "semi_liquid",
  other: "semi_liquid",
  private_equity: "illiquid",
};

/** Human-readable label for a liquidity tier. */
export function liquidityTierLabel(tier: LiquidityTier): string {
  switch (tier) {
    case "liquid":
      return "Liquid";
    case "semi_liquid":
      return "Semi-liquid";
    case "illiquid":
      return "Illiquid";
  }
}

/** Base fields shared by every limit. */
interface BaseLimit {
  /** Stable id, unique within a limit set. */
  id: string;
  /** Human-readable label, e.g. "Real-estate concentration cap". */
  label: string;
  /** Severity to assign when this limit is breached. Defaults to `warning`. */
  severity?: LimitSeverity;
  /** Optional free-text rationale, surfaced in the cockpit. */
  note?: string;
}

/** A single asset-class look-through concentration ceiling. */
export interface ConcentrationLimit extends BaseLimit {
  kind: "concentration";
  /** The look-through asset class this cap governs. */
  assetClass: AssetClass;
  /** Ceiling weight in `[0, 1]`; a weight strictly above it breaches. */
  max: number;
}

/** A liquidity floor: a minimum fraction of the book in the liquid tier. */
export interface LiquidityFloorLimit extends BaseLimit {
  kind: "liquidityFloor";
  /** Floor weight in `[0, 1]`; liquid share strictly below it breaches. */
  min: number;
}

/** An illiquid cap: a maximum fraction of the book in the illiquid tier. */
export interface IlliquidCapLimit extends BaseLimit {
  kind: "illiquidCap";
  /** Ceiling weight in `[0, 1]`; illiquid share strictly above it breaches. */
  max: number;
}

/** Any risk limit the cockpit can evaluate. */
export type RiskLimit =
  | ConcentrationLimit
  | LiquidityFloorLimit
  | IlliquidCapLimit;

/** A named set of risk limits — the family's cross-asset risk mandate. */
export interface RiskLimitSet {
  /** Stable id for the limit set. */
  id: string;
  /** Human-readable name, e.g. "Ursin Family Office risk limits 2026". */
  name: string;
  /** The governed limits. */
  limits: RiskLimit[];
}

function assertWeight(value: number, what: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${what} must be a finite number in [0, 1]: ${String(value)}`);
  }
  return value;
}

/**
 * Validate a single limit's shape. Returns the limit for chaining; throws on an
 * invalid limit so a malformed set fails loudly at load time instead of
 * silently never firing (or firing wrongly).
 */
export function validateLimit(limit: RiskLimit): RiskLimit {
  switch (limit.kind) {
    case "concentration":
      assertWeight(limit.max, `limit ${limit.id} max`);
      return limit;
    case "liquidityFloor":
      assertWeight(limit.min, `limit ${limit.id} min`);
      return limit;
    case "illiquidCap":
      assertWeight(limit.max, `limit ${limit.id} max`);
      return limit;
    default: {
      const unknown = limit as { kind?: string; id?: string };
      throw new Error(
        `limit ${unknown.id ?? "?"}: unknown kind ${String(unknown.kind)}`,
      );
    }
  }
}

/**
 * Validate a whole limit set: unique ids and every limit well-formed. Returns
 * the set for chaining.
 */
export function validateLimitSet(set: RiskLimitSet): RiskLimitSet {
  const seen = new Set<string>();
  for (const l of set.limits) {
    if (seen.has(l.id)) {
      throw new Error(`limit set ${set.id}: duplicate limit id ${l.id}`);
    }
    seen.add(l.id);
    validateLimit(l);
  }
  return set;
}
