/**
 * Build a custom *blended policy benchmark* from several asset-class index
 * return series and a set of policy (strategic) weights.
 *
 * A family office rarely benchmarks against a single index — its strategic
 * policy might be, say, 55% broad equity / 35% aggregate bonds / 10% cash. This
 * module blends the underlying asset-class index returns into one synthetic
 * benchmark return series so the rest of the relative-performance machinery can
 * treat it like any other benchmark.
 *
 * Two rebalancing conventions are offered:
 *  - `"periodic"` (the default): the policy weights are reset every period, so
 *    each period's benchmark return is the weighted average of the components'
 *    returns that period. This is the standard "rebalanced monthly/quarterly"
 *    policy benchmark.
 *  - `"buy-and-hold"`: the weights drift with each component's compounding, so
 *    winners take a larger share over time and the blend reflects a static,
 *    never-rebalanced policy basket.
 *
 * Pure, deterministic and offline. None of this moves money — it constructs the
 * yardstick a book the family already holds is measured against.
 */

import { BenchmarkInputError } from "./relative";

/** One asset-class component of a blended policy benchmark. */
export interface PolicyComponent {
  /** Stable identifier, e.g. `"broad-equity"`. */
  id: string;
  /** Human-readable label, e.g. `"Broad equity"`. */
  label: string;
  /** Strategic policy weight as a decimal (`0.55` = 55%). Must be ≥ 0. */
  weight: number;
  /** Periodic simple returns for this component's index (decimals). */
  returns: readonly number[];
}

/** A fully-specified blended policy benchmark. */
export interface PolicyBenchmark {
  /** Stable identifier for the blend, e.g. `"balanced-60-40"`. */
  id: string;
  /** Human-readable label, e.g. `"Balanced 60/40 policy"`. */
  label: string;
  /** The weighted asset-class components. */
  components: readonly PolicyComponent[];
}

export type RebalanceMode = "periodic" | "buy-and-hold";

/** Sum of a numeric array. */
function sum(values: readonly number[]): number {
  let s = 0;
  for (const v of values) s += v;
  return s;
}

/**
 * Validate a policy benchmark's shape and return its shared series length.
 *
 * Throws if there are no components, if any weight is negative or non-finite,
 * if the weights don't sum to (approximately) 1, if the component series have
 * mismatched lengths, or if any return is non-finite.
 */
function validate(policy: PolicyBenchmark): number {
  const { components } = policy;
  if (components.length === 0) {
    throw new BenchmarkInputError(
      "a policy benchmark needs at least one component",
    );
  }
  const len = components[0].returns.length;
  if (len === 0) {
    throw new BenchmarkInputError(
      "policy components must have at least one return",
    );
  }
  for (const c of components) {
    if (!Number.isFinite(c.weight) || c.weight < 0) {
      throw new BenchmarkInputError(
        `component "${c.id}" has an invalid weight ${c.weight} (must be a non-negative finite number)`,
      );
    }
    if (c.returns.length !== len) {
      throw new BenchmarkInputError(
        `component "${c.id}" has ${c.returns.length} returns, expected ${len} (all components must align)`,
      );
    }
    for (let i = 0; i < c.returns.length; i++) {
      if (!Number.isFinite(c.returns[i])) {
        throw new BenchmarkInputError(
          `component "${c.id}" has non-finite return ${c.returns[i]} at index ${i}`,
        );
      }
    }
  }
  const total = sum(components.map((c) => c.weight));
  if (Math.abs(total - 1) > 1e-9) {
    throw new BenchmarkInputError(
      `policy weights must sum to 1; got ${total}`,
    );
  }
  return len;
}

/**
 * Blend a policy benchmark's components into a single periodic return series.
 *
 * In `"periodic"` mode the policy weights are reset each period, so each
 * period's blended return is `Σ wᵢ · rᵢ`. In `"buy-and-hold"` mode the
 * effective weights drift with each component's compounded growth, so the blend
 * reflects a static, never-rebalanced basket.
 */
export function blendPolicyReturns(
  policy: PolicyBenchmark,
  { mode = "periodic" }: { mode?: RebalanceMode } = {},
): number[] {
  const len = validate(policy);
  const { components } = policy;

  if (mode === "periodic") {
    const out: number[] = new Array(len);
    for (let t = 0; t < len; t++) {
      let r = 0;
      for (const c of components) {
        r += c.weight * c.returns[t];
      }
      out[t] = r;
    }
    return out;
  }

  // buy-and-hold: track each component's value relative to a basket that starts
  // at the policy weights and is never rebalanced. The blended period return is
  // (total basket value this period / last period) − 1.
  const values = components.map((c) => c.weight); // value of each sleeve
  const out: number[] = new Array(len);
  for (let t = 0; t < len; t++) {
    const prevTotal = sum(values);
    if (prevTotal <= 0 || !Number.isFinite(prevTotal)) {
      throw new BenchmarkInputError(
        `buy-and-hold benchmark is undefined at period ${t + 1}: basket value is ${prevTotal}`,
      );
    }
    for (let i = 0; i < components.length; i++) {
      values[i] *= 1 + components[i].returns[t];
    }
    const newTotal = sum(values);
    out[t] = newTotal / prevTotal - 1;
  }
  return out;
}
