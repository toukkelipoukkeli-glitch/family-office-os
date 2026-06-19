/**
 * Square-matrix utilities for scenario correlation work.
 *
 * These are the structural checks a correlation matrix must satisfy before it
 * can be trusted in scenario / stress analysis:
 *
 *  - **square + finite** — every cell is a real number and the matrix is n×n;
 *  - **symmetric** — `M[i][j] === M[j][i]` (a correlation is the same whichever
 *    way round you read the pair);
 *  - **unit diagonal** — every variable is perfectly correlated with itself;
 *  - **in range** — every off-diagonal entry lies in `[-1, 1]`;
 *  - **positive semi-definite (PSD)** — there exists no portfolio of the
 *    underlying variables with negative variance. A matrix that is symmetric,
 *    unit-diagonal and in-range can still be *non*-PSD (an internally
 *    inconsistent set of pairwise assumptions); such a matrix cannot be the
 *    correlation matrix of any real set of random variables and will break
 *    Cholesky-based simulation, so we detect and (optionally) repair it.
 *
 * Everything here is pure, deterministic and offline. Nothing moves money.
 */

/** Thrown when a matrix violates a structural correlation-matrix invariant. */
export class CorrelationMatrixError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CorrelationMatrixError";
  }
}

/** A correlation matrix tagged with the variable keys of its rows/columns. */
export interface LabeledCorrelationMatrix {
  /** Variable keys, in row/column order. `matrix[i][j]` relates `keys[i]`/`keys[j]`. */
  keys: string[];
  /** Square, symmetric, unit-diagonal matrix of correlation coefficients. */
  matrix: number[][];
}

/** Result of {@link checkCorrelationMatrix}: a verdict plus human-readable reasons. */
export interface MatrixCheck {
  /** True when the matrix satisfies every checked invariant. */
  ok: boolean;
  /** One message per failed invariant (empty when `ok`). */
  issues: string[];
}

/**
 * Assert a value is a square matrix of finite numbers and return its dimension.
 * Throws {@link CorrelationMatrixError} otherwise.
 */
export function squareDimension(matrix: readonly (readonly number[])[]): number {
  const n = matrix.length;
  if (n === 0) {
    throw new CorrelationMatrixError("matrix must have at least one row");
  }
  for (let i = 0; i < n; i++) {
    const row = matrix[i];
    if (row.length !== n) {
      throw new CorrelationMatrixError(
        `matrix is not square: row ${i} has length ${row.length}, expected ${n}`,
      );
    }
    for (let j = 0; j < n; j++) {
      if (!Number.isFinite(row[j])) {
        throw new CorrelationMatrixError(
          `matrix has non-finite value ${row[j]} at [${i}][${j}]`,
        );
      }
    }
  }
  return n;
}

/**
 * True when the matrix is square and symmetric within `tol` (default `1e-9`):
 * `|M[i][j] - M[j][i]| <= tol` for all i, j. Throws if the matrix is not a
 * square, finite matrix.
 */
export function isSymmetric(
  matrix: readonly (readonly number[])[],
  tol = 1e-9,
): boolean {
  const n = squareDimension(matrix);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(matrix[i][j] - matrix[j][i]) > tol) return false;
    }
  }
  return true;
}

/**
 * True when the matrix is **positive semi-definite** within `tol`.
 *
 * Uses an LDL^T (Cholesky-style) decomposition that tolerates a zero pivot
 * (the semi-definite, rank-deficient case) but rejects a pivot more negative
 * than `-tol` (an indefinite matrix). The matrix must be symmetric and finite;
 * pass a symmetric matrix or this is meaningless. Throws if not square/finite.
 */
export function isPositiveSemiDefinite(
  matrix: readonly (readonly number[])[],
  tol = 1e-9,
): boolean {
  const n = squareDimension(matrix);
  // LDL^T: A = L D L^T with unit-diagonal L. d[j] are the pivots; A is PSD iff
  // every pivot is >= 0 (allowing for tiny negative floating-point noise).
  const d = new Array<number>(n).fill(0);
  const l: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let j = 0; j < n; j++) {
    let dj = matrix[j][j];
    for (let k = 0; k < j; k++) {
      dj -= l[j][k] * l[j][k] * d[k];
    }
    if (dj < -tol) return false;
    d[j] = dj;
    l[j][j] = 1;
    for (let i = j + 1; i < n; i++) {
      if (dj <= tol) {
        // Zero (or near-zero) pivot: column is determined by the rows above.
        // For a genuinely PSD matrix the off-diagonal here is also ~0; if it
        // is materially non-zero the matrix is indefinite.
        let s = matrix[i][j];
        for (let k = 0; k < j; k++) s -= l[i][k] * l[j][k] * d[k];
        if (Math.abs(s) > Math.sqrt(tol)) return false;
        l[i][j] = 0;
      } else {
        let s = matrix[i][j];
        for (let k = 0; k < j; k++) s -= l[i][k] * l[j][k] * d[k];
        l[i][j] = s / dj;
      }
    }
  }
  return true;
}

/**
 * Run every structural invariant of a correlation matrix and collect the
 * failures. Never throws for a non-square/non-finite matrix — it reports those
 * as issues too, so a caller can surface them rather than crash.
 *
 * @param diagTol  tolerance for the unit-diagonal check (default `1e-9`).
 * @param symTol   tolerance for the symmetry check (default `1e-9`).
 * @param psdTol   tolerance for the PSD eigen-pivot check (default `1e-9`).
 */
export function checkCorrelationMatrix(
  matrix: readonly (readonly number[])[],
  {
    diagTol = 1e-9,
    symTol = 1e-9,
    psdTol = 1e-9,
  }: { diagTol?: number; symTol?: number; psdTol?: number } = {},
): MatrixCheck {
  const issues: string[] = [];
  let n: number;
  try {
    n = squareDimension(matrix);
  } catch (err) {
    return {
      ok: false,
      issues: [err instanceof Error ? err.message : String(err)],
    };
  }

  for (let i = 0; i < n; i++) {
    if (Math.abs(matrix[i][i] - 1) > diagTol) {
      issues.push(`diagonal entry [${i}][${i}] is ${matrix[i][i]}, expected 1`);
    }
    for (let j = 0; j < n; j++) {
      if (i !== j && (matrix[i][j] < -1 - diagTol || matrix[i][j] > 1 + diagTol)) {
        issues.push(
          `off-diagonal entry [${i}][${j}] is ${matrix[i][j]}, outside [-1, 1]`,
        );
      }
    }
  }

  if (!isSymmetric(matrix, symTol)) {
    issues.push("matrix is not symmetric");
  }
  if (!isPositiveSemiDefinite(matrix, psdTol)) {
    issues.push("matrix is not positive semi-definite");
  }

  return { ok: issues.length === 0, issues };
}

/**
 * Project a symmetric, unit-diagonal matrix to the nearest valid correlation
 * matrix by clipping its eigenvalues at zero (Higham-style nearest-PSD), then
 * rescaling so the diagonal returns to exactly `1`.
 *
 * Use this to repair an internally inconsistent set of *assumed* pairwise
 * correlations into one that an actual joint distribution could produce. The
 * input must be symmetric and finite (throws otherwise); a matrix that is
 * already PSD is returned essentially unchanged (within numerical noise).
 */
export function nearestPositiveSemiDefinite(
  matrix: readonly (readonly number[])[],
  { iterations = 64 }: { iterations?: number } = {},
): number[][] {
  const n = squareDimension(matrix);
  if (!isSymmetric(matrix)) {
    throw new CorrelationMatrixError(
      "nearestPositiveSemiDefinite requires a symmetric matrix",
    );
  }
  // Symmetric eigen-decomposition via cyclic Jacobi rotations.
  const a: number[][] = matrix.map((row) => row.slice());
  const v: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  );

  const offDiagNorm = (m: number[][]): number => {
    let s = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) s += m[i][j] * m[i][j];
    }
    return Math.sqrt(2 * s);
  };

  for (let sweep = 0; sweep < iterations && offDiagNorm(a) > 1e-15; sweep++) {
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-300) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t =
          Math.sign(theta || 1) /
          (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let i = 0; i < n; i++) {
          const aip = a[i][p];
          const aiq = a[i][q];
          a[i][p] = c * aip - s * aiq;
          a[i][q] = s * aip + c * aiq;
        }
        for (let i = 0; i < n; i++) {
          const api = a[p][i];
          const aqi = a[q][i];
          a[p][i] = c * api - s * aqi;
          a[q][i] = s * api + c * aqi;
        }
        for (let i = 0; i < n; i++) {
          const vip = v[i][p];
          const viq = v[i][q];
          v[i][p] = c * vip - s * viq;
          v[i][q] = s * vip + c * viq;
        }
      }
    }
  }

  // Eigenvalues are now on the diagonal of `a`; clip negatives at zero and
  // reconstruct B = V * max(D, 0) * V^T.
  const eig = new Array<number>(n);
  for (let i = 0; i < n; i++) eig[i] = Math.max(a[i][i], 0);

  const b: number[][] = Array.from({ length: n }, () =>
    new Array<number>(n).fill(0),
  );
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      let acc = 0;
      for (let k = 0; k < n; k++) acc += v[i][k] * eig[k] * v[j][k];
      b[i][j] = acc;
      b[j][i] = acc;
    }
  }

  // Rescale to unit diagonal so the result is a correlation (not covariance)
  // matrix. A clipped diagonal of 0 means a degenerate variable; keep it 0 off
  // the diagonal and 1 on it.
  const scale = new Array<number>(n);
  for (let i = 0; i < n; i++) scale[i] = b[i][i] > 0 ? Math.sqrt(b[i][i]) : 0;

  const out: number[][] = Array.from({ length: n }, () =>
    new Array<number>(n).fill(0),
  );
  for (let i = 0; i < n; i++) {
    out[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      const denom = scale[i] * scale[j];
      let r = denom > 0 ? b[i][j] / denom : 0;
      if (r > 1) r = 1;
      else if (r < -1) r = -1;
      out[i][j] = r;
      out[j][i] = r;
    }
  }
  return out;
}
