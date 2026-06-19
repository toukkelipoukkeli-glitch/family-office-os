/**
 * Pairwise Pearson correlation and covariance across several aligned return
 * series — e.g. building the correlation matrix of a multi-asset portfolio.
 *
 * Pure and deterministic. Every series must have the same length (the same
 * observation dates), and at least two observations. None of this moves money;
 * it only describes how a set of series the family already holds co-move.
 */

import { RiskInputError, mean } from "./returns";

/** A correlation/covariance matrix tagged with the keys of its series. */
export interface LabeledMatrix {
  /** Series keys, in row/column order. `matrix[i][j]` relates `keys[i]`/`keys[j]`. */
  keys: string[];
  /** Square symmetric matrix; `matrix[i][j]` is the i,j statistic. */
  matrix: number[][];
}

function validateSeriesMap(
  series: Readonly<Record<string, readonly number[]>>,
): string[] {
  const keys = Object.keys(series);
  if (keys.length === 0) {
    throw new RiskInputError("at least one series is required");
  }
  const len = series[keys[0]].length;
  if (len < 2) {
    throw new RiskInputError("each series needs at least two observations");
  }
  for (const key of keys) {
    const s = series[key];
    if (s.length !== len) {
      throw new RiskInputError(
        `series "${key}" has length ${s.length}, expected ${len} (all series must align)`,
      );
    }
    for (let i = 0; i < s.length; i++) {
      if (!Number.isFinite(s[i])) {
        throw new RiskInputError(
          `series "${key}" has non-finite value ${s[i]} at index ${i}`,
        );
      }
    }
  }
  return keys;
}

/** Sample covariance between two equal-length, finite series (`n - 1`). */
export function covariance(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) {
    throw new RiskInputError("covariance series must have equal length");
  }
  if (a.length < 2) {
    throw new RiskInputError("covariance requires at least two observations");
  }
  // `mean()` already rejects non-finite inputs for both series, so a NaN/Inf
  // would have thrown above before we reach the accumulation loop.
  const ma = mean(a);
  const mb = mean(b);
  let acc = 0;
  for (let i = 0; i < a.length; i++) {
    acc += (a[i] - ma) * (b[i] - mb);
  }
  return acc / (a.length - 1);
}

/**
 * Pearson correlation coefficient between two series, in `[-1, 1]`.
 *
 * Throws if either series has zero variance (correlation is undefined). The
 * result is clamped to `[-1, 1]` to absorb floating-point overshoot.
 */
export function correlation(
  a: readonly number[],
  b: readonly number[],
): number {
  const cov = covariance(a, b);
  const va = covariance(a, a);
  const vb = covariance(b, b);
  if (va === 0 || vb === 0) {
    throw new RiskInputError(
      "correlation is undefined for a zero-variance series",
    );
  }
  const r = cov / Math.sqrt(va * vb);
  return Math.max(-1, Math.min(1, r));
}

/**
 * Build the symmetric Pearson correlation matrix across a map of aligned
 * return series. The diagonal is exactly `1` for any series with non-zero
 * variance. A zero-variance (flat) series makes its correlations undefined:
 * both its diagonal cell and its off-diagonal cells are reported as `null`
 * rather than throwing, so a single flat series doesn't sink the whole matrix.
 */
export function correlationMatrix(
  series: Readonly<Record<string, readonly number[]>>,
): { keys: string[]; matrix: (number | null)[][] } {
  const keys = validateSeriesMap(series);
  const n = keys.length;
  const variances = keys.map((k) => covariance(series[k], series[k]));
  const matrix: (number | null)[][] = keys.map(() => new Array(n).fill(null));
  for (let i = 0; i < n; i++) {
    matrix[i][i] = variances[i] === 0 ? null : 1;
    for (let j = i + 1; j < n; j++) {
      let r: number | null;
      if (variances[i] === 0 || variances[j] === 0) {
        r = null;
      } else {
        const cov = covariance(series[keys[i]], series[keys[j]]);
        r = Math.max(-1, Math.min(1, cov / Math.sqrt(variances[i] * variances[j])));
      }
      matrix[i][j] = r;
      matrix[j][i] = r;
    }
  }
  return { keys, matrix };
}

/**
 * Build the symmetric sample covariance matrix across a map of aligned return
 * series. The diagonal holds each series' variance.
 */
export function covarianceMatrix(
  series: Readonly<Record<string, readonly number[]>>,
): LabeledMatrix {
  const keys = validateSeriesMap(series);
  const n = keys.length;
  const matrix: number[][] = keys.map(() => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const cov = covariance(series[keys[i]], series[keys[j]]);
      matrix[i][j] = cov;
      matrix[j][i] = cov;
    }
  }
  return { keys, matrix };
}
