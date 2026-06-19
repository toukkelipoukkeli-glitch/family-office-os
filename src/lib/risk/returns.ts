/**
 * Return-series helpers shared by the risk metrics.
 *
 * Everything here is pure, deterministic, and side-effect free so it can be
 * unit-tested in isolation against known values. A "return series" is an array
 * of periodic *simple* returns expressed as decimals (e.g. `0.01` = +1%). None
 * of this moves money or places trades — it only describes the statistical
 * shape of a series the family already holds.
 */

/** Thrown when a metric is given input it cannot meaningfully reduce. */
export class RiskInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RiskInputError";
  }
}

function assertFinite(values: readonly number[], label: string): void {
  for (let i = 0; i < values.length; i++) {
    if (!Number.isFinite(values[i])) {
      throw new RiskInputError(
        `${label} must contain only finite numbers; got ${values[i]} at index ${i}`,
      );
    }
  }
}

/** Arithmetic mean of a non-empty series. */
export function mean(values: readonly number[]): number {
  if (values.length === 0) {
    throw new RiskInputError("mean requires at least one value");
  }
  assertFinite(values, "mean input");
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/**
 * Variance of a series.
 *
 * `sample` (the default) divides by `n - 1` (Bessel's correction) and requires
 * at least two values; the population variant divides by `n` and requires at
 * least one.
 */
export function variance(
  values: readonly number[],
  { sample = true }: { sample?: boolean } = {},
): number {
  const n = values.length;
  const minN = sample ? 2 : 1;
  if (n < minN) {
    throw new RiskInputError(
      `${sample ? "sample" : "population"} variance requires at least ${minN} value(s)`,
    );
  }
  assertFinite(values, "variance input");
  const m = mean(values);
  let ss = 0;
  for (const v of values) {
    const d = v - m;
    ss += d * d;
  }
  return ss / (sample ? n - 1 : n);
}

/** Standard deviation: the square root of {@link variance}. */
export function stddev(
  values: readonly number[],
  opts: { sample?: boolean } = {},
): number {
  return Math.sqrt(variance(values, opts));
}

/**
 * Convert a series of price/value levels into the simple returns between
 * consecutive levels: `r[i] = level[i+1] / level[i] - 1`.
 *
 * Requires at least two levels (one return). Throws if any level is
 * non-finite or if a non-final level is zero (division by zero).
 */
export function returnsFromLevels(levels: readonly number[]): number[] {
  if (levels.length < 2) {
    throw new RiskInputError("returnsFromLevels requires at least two levels");
  }
  assertFinite(levels, "levels");
  const out: number[] = [];
  for (let i = 1; i < levels.length; i++) {
    const prev = levels[i - 1];
    if (prev === 0) {
      throw new RiskInputError(
        `cannot compute a return from a zero level at index ${i - 1}`,
      );
    }
    out.push(levels[i] / prev - 1);
  }
  return out;
}
