/**
 * Benchmark return-series construction for a read-only family office OS.
 *
 * A "benchmark" here is a periodic *simple* return series (decimals, `0.01` =
 * +1%) that a portfolio is measured against — a broad equity index, a bond
 * index, a static 60/40 blend, or a bespoke strategic-policy benchmark built by
 * weighting several asset-class index series.
 *
 * The blending math uses {@link Decimal} so the weighted policy benchmark is
 * exact (no float drift when weights like 0.1 are combined), mirroring the
 * attribution engine. Nothing here moves money or places trades — it only
 * describes the shape of an index the family measures itself against.
 */

import Decimal from "decimal.js";

/** Thrown when benchmark construction is given input it cannot reduce. */
export class BenchmarkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BenchmarkError";
  }
}

/** A named asset-class index return series, used as a benchmark constituent. */
export interface IndexSeries {
  /** Stable identifier, e.g. `"world-equity"`. */
  id: string;
  /** Human label, e.g. `"World equity"`. */
  label: string;
  /** Periodic simple returns (decimals). */
  returns: readonly number[];
}

/** A weighted constituent of a blended policy benchmark. */
export interface BlendConstituent extends IndexSeries {
  /** Static policy weight (fraction). Must be > 0; the set sums to 1. */
  weight: number;
}

function assertFiniteReturns(returns: readonly number[], label: string): void {
  if (returns.length === 0) {
    throw new BenchmarkError(`${label} must contain at least one return`);
  }
  for (let i = 0; i < returns.length; i++) {
    if (!Number.isFinite(returns[i])) {
      throw new BenchmarkError(
        `${label} must contain only finite returns; got ${returns[i]} at index ${i}`,
      );
    }
  }
}

/**
 * Build a static blended-policy benchmark return series by weighting several
 * asset-class index series period by period:
 * `b[t] = Σ_i w_i · r_i[t]`.
 *
 * This is the standard rebalanced-each-period strategic benchmark: every period
 * the policy weights are reset, so the blend is a simple weighted average of the
 * constituents' period returns (not a buy-and-hold drift). Weights must be
 * positive and sum to 1 (within a tiny tolerance); all constituents must share
 * the same number of periods.
 *
 * Returns plain numbers (the exact {@link Decimal} sum converted once at the
 * end), suitable for the relative-performance metrics and charting.
 */
export function blendBenchmark(
  constituents: readonly BlendConstituent[],
): number[] {
  if (constituents.length === 0) {
    throw new BenchmarkError("a blended benchmark needs at least one constituent");
  }

  const periods = constituents[0].returns.length;
  let weightSum = new Decimal(0);
  for (const c of constituents) {
    assertFiniteReturns(c.returns, `constituent "${c.id}"`);
    if (c.returns.length !== periods) {
      throw new BenchmarkError(
        `all constituents must share the same period count; "${c.id}" has ${c.returns.length}, expected ${periods}`,
      );
    }
    if (!Number.isFinite(c.weight) || c.weight <= 0) {
      throw new BenchmarkError(
        `constituent "${c.id}" weight must be a positive finite number; got ${c.weight}`,
      );
    }
    weightSum = weightSum.plus(c.weight);
  }
  // Tolerate the kind of rounding a hand-entered policy mix carries.
  if (weightSum.minus(1).abs().greaterThan(new Decimal("1e-9"))) {
    throw new BenchmarkError(
      `constituent weights must sum to 1; got ${weightSum.toString()}`,
    );
  }

  const out: number[] = [];
  for (let t = 0; t < periods; t++) {
    let acc = new Decimal(0);
    for (const c of constituents) {
      acc = acc.plus(new Decimal(c.weight).times(c.returns[t]));
    }
    out.push(acc.toNumber());
  }
  return out;
}

/**
 * Compound a return series into a cumulative growth multiple: the product of
 * `(1 + r[t])`. A flat (all-zero) series returns 1. Used both as a building
 * block and to walk an equity curve.
 */
export function cumulativeGrowth(returns: readonly number[]): number {
  assertFiniteReturns(returns, "returns");
  let g = new Decimal(1);
  for (const r of returns) g = g.times(new Decimal(1).plus(r));
  return g.toNumber();
}

/** The total compounded return of a series: {@link cumulativeGrowth} − 1. */
export function totalReturn(returns: readonly number[]): number {
  return cumulativeGrowth(returns) - 1;
}

/**
 * The cumulative growth curve of a series: an array of length `n + 1` starting
 * at 1.0 (before any return) and compounding each period. Handy for charting an
 * indexed equity curve of the benchmark against the portfolio.
 */
export function growthCurve(returns: readonly number[]): number[] {
  assertFiniteReturns(returns, "returns");
  const curve: number[] = [1];
  let g = new Decimal(1);
  for (const r of returns) {
    g = g.times(new Decimal(1).plus(r));
    curve.push(g.toNumber());
  }
  return curve;
}
