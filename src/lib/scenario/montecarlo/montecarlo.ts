/**
 * Monte Carlo net-worth simulator.
 *
 * Given a set of assets — each with a current value, an expected (annualized,
 * log) return and a volatility — plus a cross-asset correlation matrix, this
 * simulates many independent paths of total net worth and reports the resulting
 * distribution (mean, percentiles, probability of loss, value-at-risk, …).
 *
 * The model is a standard correlated geometric-Brownian-motion (lognormal)
 * multi-asset walk:
 *
 *  1. Each step we draw a vector of independent standard normals `z`.
 *  2. We correlate them with the Cholesky factor of the correlation matrix:
 *     `e = L z` has the requested correlation structure and unit variances.
 *  3. Asset `a`'s log-return for the step is
 *     `(μ_a − σ_a²/2)·dt + σ_a·√dt·e_a`, the usual GBM drift/diffusion.
 *  4. The asset value compounds by `exp(log-return)`; net worth is the sum
 *     across assets at the horizon.
 *
 * Determinism is the headline feature: every run is driven by a
 * {@link Mulberry32} seeded from the caller's integer seed, so the same inputs
 * and seed always produce the same paths and therefore the same statistics. The
 * test suite asserts distribution statistics for a fixed seed.
 *
 * Pure, deterministic, offline. READ-ONLY product: this projects hypothetical
 * outcomes for planning and reporting; it never moves money or places trades.
 */

import {
  applyLowerTriangular,
  choleskyLower,
  Mulberry32,
  RngError,
} from "./rng";

/** Thrown when simulation inputs are structurally invalid. */
export class MonteCarloError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MonteCarloError";
  }
}

/** A single asset's current value and (annualized) return assumptions. */
export interface SimAsset {
  /** Stable identifier (e.g. asset-class key or holding id). Must be unique. */
  readonly key: string;
  /** Current market value of the holding. Must be finite and non-negative. */
  readonly value: number;
  /**
   * Expected annualized continuously-compounded (log) drift, as a decimal
   * (0.07 = +7%/yr). Used directly as μ in the GBM step.
   */
  readonly expectedReturn: number;
  /** Annualized volatility (standard deviation of log-returns), decimal, >= 0. */
  readonly volatility: number;
}

/** Inputs to a Monte Carlo net-worth simulation. */
export interface SimulationInput {
  /** The assets to simulate. At least one; keys must be unique. */
  readonly assets: readonly SimAsset[];
  /**
   * Correlation matrix of the assets' log-returns, in `assets` order. Square,
   * symmetric, unit-diagonal, positive semi-definite. Defaults to the identity
   * (independent assets) when omitted.
   */
  readonly correlation?: readonly (readonly number[])[];
  /** Number of simulated paths. Positive integer. */
  readonly paths: number;
  /** Total horizon in years (> 0). Default 1. */
  readonly horizonYears?: number;
  /** Number of time steps over the horizon. Positive integer. Default 1. */
  readonly steps?: number;
  /** Integer seed for the deterministic generator. */
  readonly seed: number;
}

/** Summary statistics of the simulated terminal net-worth distribution. */
export interface DistributionStats {
  /** Number of samples (equal to `paths`). */
  readonly count: number;
  /** Arithmetic mean terminal net worth. */
  readonly mean: number;
  /** Sample standard deviation of terminal net worth. */
  readonly stddev: number;
  /** Minimum simulated terminal net worth. */
  readonly min: number;
  /** Maximum simulated terminal net worth. */
  readonly max: number;
  /** Median (p50) terminal net worth. */
  readonly median: number;
  /**
   * Selected percentiles of the terminal distribution, keyed by the requested
   * percentile (e.g. `5`, `50`, `95`). Linear interpolation between samples.
   */
  readonly percentiles: Readonly<Record<number, number>>;
}

/** Full result of a simulation run. */
export interface SimulationResult {
  /** Current total net worth (sum of asset values at t=0). */
  readonly initialNetWorth: number;
  /**
   * Sorted (ascending) terminal net-worth samples, one per path. Sorting makes
   * percentile queries cheap and the array directly chartable as a CDF.
   */
  readonly terminalNetWorth: readonly number[];
  /** Distribution statistics of {@link terminalNetWorth}. */
  readonly stats: DistributionStats;
  /**
   * Probability (fraction in `[0, 1]`) that terminal net worth is strictly below
   * the initial net worth — i.e. the chance of ending underwater.
   */
  readonly probabilityOfLoss: number;
}

const DEFAULT_PERCENTILES = [1, 5, 10, 25, 50, 75, 90, 95, 99] as const;

function assertPositiveInt(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new MonteCarloError(`${name} must be a positive integer, got ${value}`);
  }
}

function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new MonteCarloError(`${name} must be a finite number, got ${value}`);
  }
}

function validateAssets(assets: readonly SimAsset[]): void {
  if (assets.length === 0) {
    throw new MonteCarloError("simulation requires at least one asset");
  }
  const seen = new Set<string>();
  for (const a of assets) {
    if (seen.has(a.key)) {
      throw new MonteCarloError(`duplicate asset key: ${a.key}`);
    }
    seen.add(a.key);
    assertFinite(a.value, `asset ${a.key} value`);
    if (a.value < 0) {
      throw new MonteCarloError(`asset ${a.key} value must be non-negative, got ${a.value}`);
    }
    assertFinite(a.expectedReturn, `asset ${a.key} expectedReturn`);
    assertFinite(a.volatility, `asset ${a.key} volatility`);
    if (a.volatility < 0) {
      throw new MonteCarloError(`asset ${a.key} volatility must be non-negative, got ${a.volatility}`);
    }
  }
}

function identity(n: number): number[][] {
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  );
}

/**
 * The `p`-th percentile (0..100) of an ascending-sorted array, using linear
 * interpolation between the two nearest ranks. The array must be non-empty and
 * already sorted ascending.
 */
export function percentileSorted(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) {
    throw new MonteCarloError("percentileSorted requires a non-empty array");
  }
  if (!Number.isFinite(p) || p < 0 || p > 100) {
    throw new MonteCarloError(`percentile must be in [0, 100], got ${p}`);
  }
  if (sorted.length === 1) return sorted[0];
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  const frac = rank - lo;
  return sorted[lo] + (sorted[hi] - sorted[lo]) * frac;
}

/**
 * Summary statistics of an array of samples. The samples need not be sorted; a
 * sorted copy is made internally for the percentile queries.
 *
 * @param percentiles percentile points (0..100) to report. Defaults to a
 *                    standard spread; `50` is always included so `median` is
 *                    well-defined.
 */
export function distributionStats(
  samples: readonly number[],
  percentiles: readonly number[] = DEFAULT_PERCENTILES,
): DistributionStats {
  const n = samples.length;
  if (n === 0) {
    throw new MonteCarloError("distributionStats requires at least one sample");
  }
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < n; i++) {
    const v = samples[i];
    if (!Number.isFinite(v)) {
      throw new MonteCarloError(`sample ${i} is not finite: ${v}`);
    }
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const mean = sum / n;
  let ss = 0;
  for (let i = 0; i < n; i++) {
    const d = samples[i] - mean;
    ss += d * d;
  }
  // Sample standard deviation (n-1); a single sample has zero spread.
  const stddev = n > 1 ? Math.sqrt(ss / (n - 1)) : 0;

  const sorted = [...samples].sort((a, b) => a - b);
  const pct: Record<number, number> = {};
  for (const p of percentiles) {
    pct[p] = percentileSorted(sorted, p);
  }
  const median = percentileSorted(sorted, 50);

  return { count: n, mean, stddev, min, max, median, percentiles: pct };
}

/**
 * Run a correlated multi-asset Monte Carlo simulation of terminal net worth.
 *
 * Deterministic in `input.seed`: the same input always yields the same result.
 * See the module doc for the model. Throws {@link MonteCarloError} on invalid
 * structure (no assets, bad dimensions, non-PSD correlation, …).
 */
export function simulateNetWorth(input: SimulationInput): SimulationResult {
  const {
    assets,
    correlation,
    paths,
    horizonYears = 1,
    steps = 1,
    seed,
  } = input;

  validateAssets(assets);
  assertPositiveInt(paths, "paths");
  assertPositiveInt(steps, "steps");
  if (!(horizonYears > 0) || !Number.isFinite(horizonYears)) {
    throw new MonteCarloError(`horizonYears must be a positive finite number, got ${horizonYears}`);
  }

  const n = assets.length;
  const corr = correlation ?? identity(n);
  if (corr.length !== n) {
    throw new MonteCarloError(
      `correlation matrix is ${corr.length}×? but there are ${n} assets`,
    );
  }
  for (let i = 0; i < n; i++) {
    if (corr[i].length !== n) {
      throw new MonteCarloError(
        `correlation row ${i} has length ${corr[i].length}, expected ${n}`,
      );
    }
  }

  let chol: number[][];
  try {
    chol = choleskyLower(corr);
  } catch (err) {
    if (err instanceof RngError) {
      throw new MonteCarloError(
        `correlation matrix is not usable (not positive semi-definite?): ${err.message}`,
      );
    }
    throw err;
  }

  const dt = horizonYears / steps;
  const sqrtDt = Math.sqrt(dt);
  // Precompute per-asset drift and diffusion coefficients per step.
  const drift = new Array<number>(n);
  const diffusion = new Array<number>(n);
  for (let a = 0; a < n; a++) {
    const mu = assets[a].expectedReturn;
    const sigma = assets[a].volatility;
    drift[a] = (mu - (sigma * sigma) / 2) * dt;
    diffusion[a] = sigma * sqrtDt;
  }

  const initialNetWorth = assets.reduce((acc, a) => acc + a.value, 0);
  const rng = new Mulberry32(seed);
  const terminal = new Array<number>(paths);

  // Reused per-path scratch so we do not allocate inside the hot loop.
  const logValue = new Array<number>(n);

  for (let p = 0; p < paths; p++) {
    for (let a = 0; a < n; a++) {
      // Track log-value to keep the lognormal walk numerically stable.
      logValue[a] = assets[a].value > 0 ? Math.log(assets[a].value) : -Infinity;
    }
    for (let s = 0; s < steps; s++) {
      const z = rng.gaussianVector(n);
      const e = applyLowerTriangular(chol, z);
      for (let a = 0; a < n; a++) {
        if (logValue[a] === -Infinity) continue; // a zero-value asset stays zero
        logValue[a] += drift[a] + diffusion[a] * e[a];
      }
    }
    let nw = 0;
    for (let a = 0; a < n; a++) {
      nw += logValue[a] === -Infinity ? 0 : Math.exp(logValue[a]);
    }
    terminal[p] = nw;
  }

  terminal.sort((a, b) => a - b);

  let lossCount = 0;
  for (let p = 0; p < paths; p++) {
    if (terminal[p] < initialNetWorth) lossCount++;
  }

  return {
    initialNetWorth,
    terminalNetWorth: terminal,
    stats: distributionStats(terminal),
    probabilityOfLoss: lossCount / paths,
  };
}

/**
 * Value-at-Risk at confidence `level` (e.g. 0.95) from a completed simulation,
 * expressed as a **loss relative to initial net worth**: the amount you could
 * lose such that only `(1 − level)` of outcomes are worse.
 *
 * Returns a non-negative number for a loss and a negative number when even the
 * tail outcome is a gain. `level` must be in `(0, 1)`.
 */
export function valueAtRisk(result: SimulationResult, level = 0.95): number {
  if (!(level > 0) || !(level < 1)) {
    throw new MonteCarloError(`VaR level must be in (0, 1), got ${level}`);
  }
  const p = (1 - level) * 100;
  const tail = percentileSorted(result.terminalNetWorth, p);
  return result.initialNetWorth - tail;
}

/**
 * Conditional Value-at-Risk (expected shortfall) at confidence `level`: the
 * average loss across the worst `(1 − level)` fraction of outcomes, relative to
 * initial net worth. Always at least as large as {@link valueAtRisk}.
 */
export function conditionalValueAtRisk(
  result: SimulationResult,
  level = 0.95,
): number {
  if (!(level > 0) || !(level < 1)) {
    throw new MonteCarloError(`CVaR level must be in (0, 1), got ${level}`);
  }
  const sorted = result.terminalNetWorth;
  const n = sorted.length;
  // Number of worst-case samples in the tail; at least one.
  const tailCount = Math.max(1, Math.floor(n * (1 - level)));
  let sum = 0;
  for (let i = 0; i < tailCount; i++) sum += sorted[i];
  const meanTail = sum / tailCount;
  return result.initialNetWorth - meanTail;
}
