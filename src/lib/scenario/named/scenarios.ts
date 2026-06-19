/**
 * Named scenario builder.
 *
 * A *named scenario* is a documented, reusable bundle of shocks — "what if rates
 * spike 200bps?", "what if the euro falls 15%?", "what if a drought wipes out a
 * third of the vineyard?", "what if equities correct 30%?" — that transforms a
 * base set of {@link SimAsset}s (and, optionally, their correlation matrix)
 * *before* it is handed to the Monte Carlo engine in `../montecarlo`.
 *
 * The split of responsibilities is deliberate:
 *
 *  - the MC engine ({@link simulateNetWorth}) knows how to roll a correlated
 *    lognormal walk forward and summarize the distribution, but knows nothing
 *    about *why* an asset's assumptions are what they are;
 *  - a {@link Scenario} encodes the *house view* of a named stress — which asset
 *    classes it hits, and how — as a list of {@link Shock}s with a written
 *    rationale, so the assumptions are auditable rather than magic numbers.
 *
 * Applying a scenario is a pure transform: `applyScenario(base, scenario)`
 * returns a *new* {@link SimulationInput} with shocked assets (and correlation),
 * leaving the base untouched. The result is an ordinary `SimulationInput`, so a
 * scenario composes naturally with the existing engine and stays deterministic.
 *
 * Three kinds of shock cover the named stresses:
 *
 *  - **reprice** — an instantaneous move in an asset's *current value* (a market
 *    correction marks equities down 30% on day zero; a drought writes down the
 *    vineyard). This shifts where the walk starts.
 *  - **drift** — an additive change to an asset's expected (annualized log)
 *    return (a rate shock lifts cash/bond carry, or depresses long-duration
 *    bond drift). This bends the centre of the future distribution.
 *  - **vol** — a multiplicative change to an asset's volatility (a stress widens
 *    the cone of outcomes). Multiplicative so "1.5× vol" is regime-agnostic.
 *
 * Every shock targets asset classes (matched against each asset's `assetClass`,
 * or its `key` when no class is given), so one scenario applies cleanly across
 * however many holdings a family actually owns.
 *
 * Pure, deterministic, offline. READ-ONLY product: scenarios project
 * hypothetical outcomes for planning and reporting; nothing here moves money or
 * places trades.
 */

import type { AssetClass } from "../../model/asset-class";
import type { SimAsset, SimulationInput } from "../montecarlo/montecarlo";

/** Thrown when a scenario or shock is structurally invalid. */
export class ScenarioError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScenarioError";
  }
}

/**
 * A {@link SimAsset} optionally tagged with the {@link AssetClass} it belongs
 * to. Scenarios target asset *classes*, so tagging an asset lets a single
 * scenario hit every equity holding, every bond, etc. When `assetClass` is
 * omitted, the asset's `key` is used as its class label for targeting.
 */
export interface ClassifiedAsset extends SimAsset {
  /** Asset class this holding belongs to; falls back to `key` when omitted. */
  readonly assetClass?: AssetClass;
}

/** The class label a shock matches an asset against. */
function classOf(asset: ClassifiedAsset): string {
  return asset.assetClass ?? asset.key;
}

/** The kind of transformation a {@link Shock} performs. */
export type ShockKind = "reprice" | "drift" | "vol";

/**
 * A single shock within a scenario: a typed adjustment applied to every asset
 * whose class is in `targets`.
 *
 *  - `kind: "reprice"` — multiply current value by `(1 + amount)`. `amount` is a
 *    fractional move, e.g. `-0.3` marks the asset down 30%. Must be `> -1`
 *    (you cannot lose more than the whole position).
 *  - `kind: "drift"`   — add `amount` to the expected (log) return. `amount` is
 *    in return units, e.g. `+0.02` adds 2%/yr of drift.
 *  - `kind: "vol"`     — multiply volatility by `amount`. `amount` must be
 *    `>= 0`, e.g. `1.5` widens vol by half.
 */
export interface Shock {
  readonly kind: ShockKind;
  /** Asset classes this shock applies to. Non-empty; duplicates are ignored. */
  readonly targets: readonly AssetClass[];
  /** Magnitude; interpretation depends on `kind` (see above). Finite. */
  readonly amount: number;
}

/** A named, documented bundle of shocks. */
export interface Scenario {
  /** Stable machine id (e.g. `"rate-shock"`). */
  readonly id: string;
  /** Human-readable name (e.g. `"Rate shock (+200bps)"`). */
  readonly name: string;
  /** One-line description of what the scenario represents. */
  readonly description: string;
  /** The shocks to apply, in order. May be empty (a no-op scenario). */
  readonly shocks: readonly Shock[];
  /**
   * Optional correlation override applied with the shocks. In a crisis,
   * cross-asset correlations rise toward 1 ("everything sells off together");
   * a scenario may supply a stressed correlation matrix to model that. When
   * omitted the base correlation is carried through unchanged.
   */
  readonly correlation?: readonly (readonly number[])[];
}

function assertFiniteAmount(shock: Shock): void {
  if (!Number.isFinite(shock.amount)) {
    throw new ScenarioError(
      `shock amount must be finite, got ${shock.amount} (${shock.kind})`,
    );
  }
}

function validateShock(shock: Shock): void {
  if (shock.targets.length === 0) {
    throw new ScenarioError(`${shock.kind} shock must target at least one asset class`);
  }
  assertFiniteAmount(shock);
  switch (shock.kind) {
    case "reprice":
      if (shock.amount <= -1) {
        throw new ScenarioError(
          `reprice shock amount must be > -1 (cannot lose more than 100%), got ${shock.amount}`,
        );
      }
      break;
    case "vol":
      if (shock.amount < 0) {
        throw new ScenarioError(
          `vol shock amount must be >= 0 (a multiplier), got ${shock.amount}`,
        );
      }
      break;
    case "drift":
      break;
    default: {
      const never: never = shock.kind;
      throw new ScenarioError(`unknown shock kind: ${String(never)}`);
    }
  }
}

/** Validate the structure of a scenario; throws {@link ScenarioError}. */
export function validateScenario(scenario: Scenario): void {
  if (!scenario.id) {
    throw new ScenarioError("scenario must have a non-empty id");
  }
  for (const shock of scenario.shocks) {
    validateShock(shock);
  }
}

/**
 * Apply a single shock to one asset, returning a new asset. The asset is
 * returned unchanged (same reference) when the shock does not target its class,
 * so callers can cheaply tell whether anything moved.
 */
function applyShockToAsset(
  asset: ClassifiedAsset,
  shock: Shock,
  targetSet: ReadonlySet<string>,
): ClassifiedAsset {
  if (!targetSet.has(classOf(asset))) return asset;
  switch (shock.kind) {
    case "reprice":
      return { ...asset, value: asset.value * (1 + shock.amount) };
    case "drift":
      return { ...asset, expectedReturn: asset.expectedReturn + shock.amount };
    case "vol":
      return { ...asset, volatility: asset.volatility * shock.amount };
    default: {
      const never: never = shock.kind;
      throw new ScenarioError(`unknown shock kind: ${String(never)}`);
    }
  }
}

/**
 * Apply every shock in `scenario` to `assets`, returning a new array of shocked
 * assets in the same order. Pure: the input array and its assets are not
 * mutated. Shocks apply in listed order, so two shocks on the same class
 * compose (e.g. reprice then vol).
 *
 * Validates the scenario first; throws {@link ScenarioError} on a bad shock.
 */
export function shockAssets(
  assets: readonly ClassifiedAsset[],
  scenario: Scenario,
): ClassifiedAsset[] {
  validateScenario(scenario);
  let current = assets.map((a) => a);
  for (const shock of scenario.shocks) {
    const targetSet = new Set<string>(shock.targets);
    current = current.map((a) => applyShockToAsset(a, shock, targetSet));
  }
  return current;
}

/**
 * Build the {@link SimulationInput} for running `scenario` against a `base`
 * input through the Monte Carlo engine.
 *
 * The base's assets are shocked (see {@link shockAssets}); every other field
 * (paths, horizon, steps, seed) is carried through unchanged so the *only*
 * difference from the baseline run is the scenario itself — which is exactly
 * what you want when comparing a stressed run to its baseline on the same seed.
 *
 * Correlation precedence: the scenario's `correlation` override wins; otherwise
 * the base correlation is used. The returned assets keep their `assetClass`
 * tags (a {@link ClassifiedAsset} is a {@link SimAsset}), so the result is a
 * valid `SimulationInput` the engine accepts directly.
 */
export function applyScenario(
  base: SimulationInput & { readonly assets: readonly ClassifiedAsset[] },
  scenario: Scenario,
): SimulationInput {
  const assets = shockAssets(base.assets, scenario);
  const correlation = scenario.correlation ?? base.correlation;
  return { ...base, assets, ...(correlation ? { correlation } : {}) };
}
