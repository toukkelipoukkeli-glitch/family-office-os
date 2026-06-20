import { Decimal } from "decimal.js";

import type { AssetClass } from "../model/asset-class";

/**
 * Investment Policy Statement (IPS) — a governed mandate model.
 *
 * Where the m7 alerts module models ad-hoc concentration *rules*, an IPS is the
 * family office's formal, named policy: the strategic asset-allocation bands the
 * book must stay inside, the single-position concentration cap, a liquidity
 * floor (a minimum fraction held in liquid, public-market assets), and the
 * policy benchmark the book is measured against. A real family office signs off
 * on one IPS document; this module turns that document into machine-checkable
 * {@link IpsConstraint}s.
 *
 * The engine ({@link ./engine}) evaluates a {@link InvestmentPolicy} against a
 * portfolio and reports every {@link import("./engine").ConstraintBreach}; the
 * history helper ({@link ./history}) tracks how compliance evolves across
 * successive valuations.
 *
 * READ-ONLY product: an IPS describes the mandate and the engine reports whether
 * the book complies. A breach is a governance signal for a human (rebalance,
 * waive, or amend the IPS) — never an instruction that moves money or trades.
 */

/** Severity assigned to a breach, used to sort and colour findings. */
export type BreachSeverity = "warning" | "critical";

/** Threshold value accepted as an exact decimal weight in `[0, 1]`. */
export type WeightInput = Decimal | string | number;

/**
 * The kind of constraint, which selects how the engine measures the book.
 *
 * - `assetClassBand` — the weight of one {@link AssetClass} must stay within an
 *   inclusive `[min, max]` band (either bound optional). Breaches below `min`
 *   (under-allocation) and above `max` (over-allocation).
 * - `positionCap` — **every** single holding's weight must stay at or below a
 *   ceiling (single-position concentration cap). The engine flags each holding
 *   that breaches.
 * - `liquidityFloor` — at least `min` of the book must be held in liquid,
 *   public-market asset classes (see {@link import("../model/asset-class").isLiquidAssetClass}).
 * - `currencyCap` — the weight denominated in one currency must stay at or below
 *   a ceiling (non-base-currency exposure limit).
 */
export type ConstraintKind =
  | "assetClassBand"
  | "positionCap"
  | "liquidityFloor"
  | "currencyCap";

/** Base fields shared by every constraint. */
interface BaseConstraint {
  /** Stable id, unique within a policy. */
  id: string;
  /** Human-readable label, e.g. "Equity allocation band". */
  label: string;
  /** Severity to assign when this constraint is breached. Defaults to `warning`. */
  severity?: BreachSeverity;
  /** Optional free-text rationale, surfaced in the UI / governance log. */
  note?: string;
}

/**
 * An asset-class min/max allocation band. At least one of `min` / `max` must be
 * present. `min` is a floor (under-allocation breaches), `max` is a ceiling
 * (over-allocation breaches). Both are weights in `[0, 1]`, and `min <= max`.
 */
export interface AssetClassBandConstraint extends BaseConstraint {
  kind: "assetClassBand";
  /** The asset class this band governs. */
  assetClass: AssetClass;
  /** Lower bound (floor), a weight in `[0, 1]`. Optional. */
  min?: WeightInput;
  /** Upper bound (ceiling), a weight in `[0, 1]`. Optional. */
  max?: WeightInput;
}

/** A single-position concentration cap applied to every holding. */
export interface PositionCapConstraint extends BaseConstraint {
  kind: "positionCap";
  /** Ceiling weight in `[0, 1]`; a holding strictly above it breaches. */
  max: WeightInput;
}

/** A liquidity floor: a minimum fraction of the book in liquid asset classes. */
export interface LiquidityFloorConstraint extends BaseConstraint {
  kind: "liquidityFloor";
  /** Floor weight in `[0, 1]`; liquid share strictly below it breaches. */
  min: WeightInput;
}

/** A per-currency exposure ceiling. */
export interface CurrencyCapConstraint extends BaseConstraint {
  kind: "currencyCap";
  /** Currency code this cap governs, e.g. "EUR". */
  currency: string;
  /** Ceiling weight in `[0, 1]`; exposure strictly above it breaches. */
  max: WeightInput;
}

/** Any IPS constraint. */
export type IpsConstraint =
  | AssetClassBandConstraint
  | PositionCapConstraint
  | LiquidityFloorConstraint
  | CurrencyCapConstraint;

/**
 * A reference to the policy benchmark the mandate measures the book against.
 * Purely descriptive metadata (the benchmark math lives in the m8 `benchmark`
 * module); recorded here so the IPS is self-describing.
 */
export interface PolicyBenchmarkRef {
  /** Stable id, e.g. "balanced-60-40". */
  id: string;
  /** Human-readable label, e.g. "Balanced 60/40 policy". */
  label: string;
}

/** A full Investment Policy Statement. */
export interface InvestmentPolicy {
  /** Stable id for the policy document. */
  id: string;
  /** Human-readable name, e.g. "Ursin Family Office IPS 2026". */
  name: string;
  /** The governed constraints. */
  constraints: IpsConstraint[];
  /** Optional reference to the policy benchmark. */
  benchmark?: PolicyBenchmarkRef;
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
 * Validate a single constraint's shape. Returns the constraint for chaining;
 * throws on an invalid constraint so a malformed policy fails loudly at load
 * time instead of silently never firing (or firing wrongly).
 */
export function validateConstraint(constraint: IpsConstraint): IpsConstraint {
  switch (constraint.kind) {
    case "assetClassBand": {
      if (constraint.min === undefined && constraint.max === undefined) {
        throw new Error(
          `constraint ${constraint.id}: assetClassBand requires at least one of min / max`,
        );
      }
      const min =
        constraint.min === undefined
          ? undefined
          : toWeight(constraint.min, `constraint ${constraint.id} min`);
      const max =
        constraint.max === undefined
          ? undefined
          : toWeight(constraint.max, `constraint ${constraint.id} max`);
      if (min && max && min.greaterThan(max)) {
        throw new Error(
          `constraint ${constraint.id}: min (${min.toString()}) must be <= max (${max.toString()})`,
        );
      }
      return constraint;
    }
    case "positionCap":
      toWeight(constraint.max, `constraint ${constraint.id} max`);
      return constraint;
    case "liquidityFloor":
      toWeight(constraint.min, `constraint ${constraint.id} min`);
      return constraint;
    case "currencyCap":
      toWeight(constraint.max, `constraint ${constraint.id} max`);
      if (!constraint.currency?.trim()) {
        // Empty / whitespace-only codes normalize to "" and would match nothing.
        throw new Error(
          `constraint ${constraint.id}: currencyCap requires a currency code`,
        );
      }
      return constraint;
    default: {
      // Exhaustiveness guard: a new kind without a case lands here at runtime.
      const unknown = constraint as { kind?: string; id?: string };
      throw new Error(
        `constraint ${unknown.id ?? "?"}: unknown kind ${String(unknown.kind)}`,
      );
    }
  }
}

/**
 * Validate a whole policy: unique constraint ids and every constraint
 * well-formed. Returns the policy for chaining.
 */
export function validatePolicy(policy: InvestmentPolicy): InvestmentPolicy {
  const seen = new Set<string>();
  for (const c of policy.constraints) {
    if (seen.has(c.id)) {
      throw new Error(`policy ${policy.id}: duplicate constraint id ${c.id}`);
    }
    seen.add(c.id);
    validateConstraint(c);
  }
  return policy;
}
