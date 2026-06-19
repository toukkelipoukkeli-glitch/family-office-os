import { Decimal } from "decimal.js";

/**
 * Small exact-decimal statistics helpers for the LEGO price guide.
 *
 * All operate on {@link Decimal} arrays so the price guide never touches
 * floating-point money. They are robust by design (median + MAD rather than
 * mean + stdev) because secondary-market comps are noisy and contain outliers.
 */

/** Ascending copy of `values` (does not mutate the input). */
export function sortedAsc(values: Decimal[]): Decimal[] {
  return [...values].sort((a, b) => a.comparedTo(b));
}

/**
 * Exact median of a non-empty list. For an even count it returns the exact
 * average of the two middle values. Throws on an empty list.
 */
export function median(values: Decimal[]): Decimal {
  if (values.length === 0) {
    throw new Error("median of an empty list is undefined");
  }
  const s = sortedAsc(values);
  const mid = Math.floor(s.length / 2);
  if (s.length % 2 === 1) {
    return s[mid];
  }
  return s[mid - 1].plus(s[mid]).div(2);
}

/**
 * Median absolute deviation from the median — a robust spread measure. Zero
 * when all values are equal. Throws on an empty list.
 */
export function medianAbsoluteDeviation(values: Decimal[]): Decimal {
  if (values.length === 0) {
    throw new Error("MAD of an empty list is undefined");
  }
  const m = median(values);
  const deviations = values.map((v) => v.minus(m).abs());
  return median(deviations);
}

/**
 * Filter out values more than `k` MADs from the median (Hampel filter). With
 * MAD = 0 (all equal, or tiny samples) nothing is filtered. Always keeps at
 * least one value: if every value would be rejected, the original list is
 * returned unchanged.
 *
 * Returns the indices kept *and* the kept values so callers can drop the
 * matching weights (e.g. recency) in lockstep.
 */
export function hampelKeep(
  values: Decimal[],
  k: Decimal = new Decimal(3),
): { indices: number[]; values: Decimal[] } {
  if (values.length === 0) {
    return { indices: [], values: [] };
  }
  const m = median(values);
  const mad = medianAbsoluteDeviation(values);
  if (mad.isZero()) {
    return { indices: values.map((_, i) => i), values: [...values] };
  }
  // Scale MAD to be a consistent estimator of stdev for normal data.
  const threshold = k.times(new Decimal("1.4826")).times(mad);
  const indices: number[] = [];
  const kept: Decimal[] = [];
  values.forEach((v, i) => {
    if (v.minus(m).abs().lessThanOrEqualTo(threshold)) {
      indices.push(i);
      kept.push(v);
    }
  });
  if (kept.length === 0) {
    return { indices: values.map((_, i) => i), values: [...values] };
  }
  return { indices, values: kept };
}

/**
 * Weighted median: the smallest sorted value whose cumulative weight reaches
 * half the total weight. Robust and exact. Weights must be non-negative and
 * sum to a positive value; lengths must match.
 */
export function weightedMedian(values: Decimal[], weights: Decimal[]): Decimal {
  if (values.length === 0) {
    throw new Error("weighted median of an empty list is undefined");
  }
  if (values.length !== weights.length) {
    throw new Error("values and weights must have the same length");
  }
  const paired = values.map((v, i) => ({ v, w: weights[i] }));
  paired.sort((a, b) => a.v.comparedTo(b.v));
  let total = new Decimal(0);
  for (const p of paired) {
    if (p.w.lessThan(0)) {
      throw new Error("weights must be non-negative");
    }
    total = total.plus(p.w);
  }
  if (total.lessThanOrEqualTo(0)) {
    throw new Error("weights must sum to a positive value");
  }
  const half = total.div(2);
  let cumulative = new Decimal(0);
  for (const p of paired) {
    cumulative = cumulative.plus(p.w);
    if (cumulative.greaterThanOrEqualTo(half)) {
      return p.v;
    }
  }
  // Unreachable given a positive total, but satisfy the type checker.
  return paired[paired.length - 1].v;
}
