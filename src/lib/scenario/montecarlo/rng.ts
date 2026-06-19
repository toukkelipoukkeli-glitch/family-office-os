/**
 * Deterministic, seeded random-number generation for Monte Carlo simulation.
 *
 * The whole point of a Monte Carlo net-worth simulator that ships with tests is
 * that it is **reproducible**: the same seed must always produce the same draws,
 * so distribution statistics can be asserted exactly. The platform `Math.random`
 * is unseedable, so we use our own small, well-understood generators instead:
 *
 *  - {@link splitMix32} expands a single 32-bit seed into a stream of seeds with
 *    good avalanche, used to initialize the main generator's state.
 *  - {@link Mulberry32} is the main uniform generator — a tiny, fast,
 *    statistically respectable 32-bit PRNG. Plenty for scenario analysis (this
 *    is not cryptography, and it never needs to be).
 *  - {@link Mulberry32.nextGaussian} turns uniforms into standard-normal draws
 *    via the Box–Muller transform.
 *
 * Everything here is pure given its seed, deterministic, and offline. READ-ONLY
 * product: this generates hypothetical scenarios for reporting; it never moves
 * money or places trades.
 */

/** Thrown when a generator is constructed or driven with invalid input. */
export class RngError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RngError";
  }
}

/**
 * SplitMix32 seed expander. Given a 32-bit state it returns a `[value, next]`
 * pair; chaining `next` yields a high-quality stream used to seed other
 * generators so a single integer seed produces a well-mixed starting state.
 */
export function splitMix32(state: number): { value: number; next: number } {
  let z = (state + 0x9e3779b9) | 0;
  const nextState = z;
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
  z = z ^ (z >>> 15);
  // >>> 0 maps the signed 32-bit int into the unsigned 0..2^32-1 range.
  return { value: z >>> 0, next: nextState };
}

/** Coerce an arbitrary number into a valid 32-bit unsigned seed. */
function normalizeSeed(seed: number): number {
  if (!Number.isFinite(seed)) {
    throw new RngError(`seed must be a finite number, got ${seed}`);
  }
  // Truncate toward zero, then fold into the unsigned 32-bit range.
  return Math.trunc(seed) >>> 0;
}

/**
 * Mulberry32 — a compact 32-bit pseudo-random generator.
 *
 * Deterministic given its seed. Produces uniform doubles in `[0, 1)` and, via
 * {@link nextGaussian}, standard-normal draws. The internal state is a single
 * 32-bit integer, advanced once per uniform draw.
 */
export class Mulberry32 {
  private state: number;
  /** Cached second Box–Muller normal (they come in pairs). */
  private spareGaussian: number | null = null;

  constructor(seed: number) {
    // Run the raw seed through SplitMix32 once so that nearby seeds (0, 1, 2…)
    // produce well-separated streams rather than correlated ones.
    this.state = splitMix32(normalizeSeed(seed)).value;
  }

  /** Next uniform double in `[0, 1)`. */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Next standard-normal (mean 0, variance 1) draw via the polar-free Box–Muller
   * transform. Draws are generated in pairs; the spare is returned on the next
   * call so no uniforms are wasted.
   */
  nextGaussian(): number {
    if (this.spareGaussian !== null) {
      const g = this.spareGaussian;
      this.spareGaussian = null;
      return g;
    }
    // Guard u1 away from exactly 0 so log() stays finite.
    let u1 = this.next();
    if (u1 < 1e-300) u1 = 1e-300;
    const u2 = this.next();
    const radius = Math.sqrt(-2 * Math.log(u1));
    const theta = 2 * Math.PI * u2;
    this.spareGaussian = radius * Math.sin(theta);
    return radius * Math.cos(theta);
  }

  /** Fill and return an array of `n` standard-normal draws. */
  gaussianVector(n: number): number[] {
    if (!Number.isInteger(n) || n < 0) {
      throw new RngError(`gaussianVector length must be a non-negative integer, got ${n}`);
    }
    const out = new Array<number>(n);
    for (let i = 0; i < n; i++) out[i] = this.nextGaussian();
    return out;
  }
}

/**
 * Lower-triangular Cholesky factor `L` of a symmetric positive (semi-)definite
 * matrix `A`, such that `A = L Lᵀ`. Used to convert a vector of independent
 * standard normals `z` into correlated normals `L z` with covariance `A`.
 *
 * Tolerates a zero (within `tol`) pivot for the rank-deficient PSD case by
 * setting that column to zero. Throws {@link RngError} if a pivot is materially
 * negative (the matrix is not PSD) — repair such matrices with
 * `nearestPositiveSemiDefinite` from the correlation module first.
 *
 * @param matrix symmetric PSD matrix (e.g. a correlation or covariance matrix).
 * @param tol    negative-pivot tolerance for the PSD check (default `1e-9`).
 */
export function choleskyLower(
  matrix: readonly (readonly number[])[],
  tol = 1e-9,
): number[][] {
  const n = matrix.length;
  if (n === 0) {
    throw new RngError("choleskyLower requires a non-empty matrix");
  }
  for (let i = 0; i < n; i++) {
    if (matrix[i].length !== n) {
      throw new RngError(
        `choleskyLower requires a square matrix; row ${i} has length ${matrix[i].length}, expected ${n}`,
      );
    }
  }
  const l: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let j = 0; j < n; j++) {
    let diag = matrix[j][j];
    for (let k = 0; k < j; k++) diag -= l[j][k] * l[j][k];
    if (diag < -tol) {
      throw new RngError(
        `matrix is not positive semi-definite: negative pivot ${diag} at index ${j}`,
      );
    }
    const ljj = diag > tol ? Math.sqrt(diag) : 0;
    l[j][j] = ljj;
    for (let i = j + 1; i < n; i++) {
      if (ljj === 0) {
        // Degenerate column: with a zero pivot the off-diagonal must be ~0 for a
        // genuinely PSD matrix; leave the entry at 0.
        l[i][j] = 0;
        continue;
      }
      let s = matrix[i][j];
      for (let k = 0; k < j; k++) s -= l[i][k] * l[j][k];
      l[i][j] = s / ljj;
    }
  }
  return l;
}

/**
 * Multiply a lower-triangular matrix `L` by a vector `z` (`L z`), used to turn
 * independent standard normals into correlated ones. `L` must be `n×n` and `z`
 * length `n`.
 */
export function applyLowerTriangular(
  l: readonly (readonly number[])[],
  z: readonly number[],
): number[] {
  const n = l.length;
  if (z.length !== n) {
    throw new RngError(
      `applyLowerTriangular dimension mismatch: matrix is ${n}×${n} but vector has length ${z.length}`,
    );
  }
  const out = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = 0;
    // L is lower-triangular, so only j <= i contribute.
    for (let j = 0; j <= i; j++) s += l[i][j] * z[j];
    out[i] = s;
  }
  return out;
}
