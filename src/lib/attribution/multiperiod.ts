import { Decimal } from "decimal.js";

import {
  attribute,
  AttributionError,
  type AttributionInput,
  type AttributionMethod,
  type SegmentEffect,
} from "./attribution";

/**
 * Multi-period attribution with **Carino logarithmic linking**.
 *
 * Single-period Brinson effects are *arithmetic* (R_p − R_b), but compounded
 * returns are *geometric*. Naively summing single-period effects across periods
 * does not reconcile with the compounded active return. The Carino (1999)
 * algorithm scales each period's effects by a coefficient so that the linked
 * effects sum **exactly** to the geometric (compounded) active return:
 *
 *   linked total = Π(1 + R_pᵗ) − Π(1 + R_bᵗ)
 *
 * For each period t the scaling coefficient is
 *
 *   kₜ = ln(1+R_pᵗ) − ln(1+R_bᵗ)) / (R_pᵗ − R_bᵗ)            (active ≠ 0)
 *
 * and the overall coefficient is
 *
 *   k = (ln(1+R_p) − ln(1+R_b)) / (R_p − R_b)                 (total active ≠ 0)
 *
 * The scaled effect for period t is `effect · kₜ / k`. When a period's active
 * return is zero the limit kₜ → 1/(1+R) is used; likewise for the total.
 *
 * Pure and deterministic; operates on {@link Decimal}. Nothing moves money.
 */

export interface MultiPeriodInput {
  /** Ordered single-period attribution inputs (period 1, 2, …). */
  periods: AttributionInput[];
  /** Effect convention applied to every period. Defaults to Brinson-Fachler. */
  method?: AttributionMethod;
}

export interface LinkedSegmentEffect {
  id: string;
  label: string;
  allocation: Decimal;
  selection: Decimal;
  interaction: Decimal;
  total: Decimal;
}

export interface MultiPeriodResult {
  method: AttributionMethod;
  /** Compounded portfolio return: Π(1+R_pᵗ) − 1. */
  portfolioReturn: Decimal;
  /** Compounded benchmark return: Π(1+R_bᵗ) − 1. */
  benchmarkReturn: Decimal;
  /** Geometric active return: (1+R_p)/(1+R_b) − 1 is *not* used here; the
   *  Carino identity reconciles the *arithmetic* difference R_p − R_b. */
  activeReturn: Decimal;
  /** Per-segment linked effects (summed across periods, Carino-scaled). */
  segments: LinkedSegmentEffect[];
  totalAllocation: Decimal;
  totalSelection: Decimal;
  totalInteraction: Decimal;
  /** Σ of linked effects — equals {@link activeReturn} up to rounding. */
  totalEffect: Decimal;
}

const LN = (x: Decimal): Decimal => new Decimal(Math.log(x.toNumber()));

/**
 * Carino smoothing coefficient for a single period (or the whole horizon):
 *
 *   k = (ln(1+R_p) − ln(1+R_b)) / (R_p − R_b)   when R_p ≠ R_b
 *   k = 1 / (1 + R_p)                            when R_p = R_b  (the limit)
 *
 * Requires 1+R_p and 1+R_b strictly positive (returns above −100%).
 */
function carinoCoefficient(rp: Decimal, rb: Decimal): Decimal {
  const onePlusP = rp.plus(1);
  const onePlusB = rb.plus(1);
  if (onePlusP.lessThanOrEqualTo(0) || onePlusB.lessThanOrEqualTo(0)) {
    throw new AttributionError(
      "multiPeriodAttribution: period returns must exceed -100%",
    );
  }
  const active = rp.minus(rb);
  if (active.isZero()) {
    return new Decimal(1).div(onePlusP);
  }
  return LN(onePlusP).minus(LN(onePlusB)).div(active);
}

/**
 * Link single-period Brinson attribution across periods with Carino smoothing.
 *
 * Requires at least one period. Every period must expose the *same* set of
 * segment ids (so effects can be accumulated per segment).
 */
export function multiPeriodAttribution(
  input: MultiPeriodInput,
): MultiPeriodResult {
  const method: AttributionMethod = input.method ?? "BF";
  const { periods } = input;

  if (periods.length === 0) {
    throw new AttributionError(
      "multiPeriodAttribution: need at least one period",
    );
  }

  const perPeriod = periods.map((p) => attribute({ ...p, method }));

  // Validate a consistent segment universe across periods.
  const ids = perPeriod[0].segments.map((s) => s.id);
  const idKey = ids.join("|");
  for (const r of perPeriod) {
    if (r.segments.map((s) => s.id).join("|") !== idKey) {
      throw new AttributionError(
        "multiPeriodAttribution: every period must have the same segment ids in the same order",
      );
    }
  }

  // Compounded returns.
  let growthP = new Decimal(1);
  let growthB = new Decimal(1);
  for (const r of perPeriod) {
    growthP = growthP.times(r.portfolioReturn.plus(1));
    growthB = growthB.times(r.benchmarkReturn.plus(1));
  }
  const portfolioReturn = growthP.minus(1);
  const benchmarkReturn = growthB.minus(1);
  const activeReturn = portfolioReturn.minus(benchmarkReturn);

  const k = carinoCoefficient(portfolioReturn, benchmarkReturn);

  // Accumulate Carino-scaled effects per segment.
  const acc = new Map<
    string,
    { label: string; allocation: Decimal; selection: Decimal; interaction: Decimal }
  >();
  for (const id of ids) {
    const label =
      perPeriod[0].segments.find((s) => s.id === id)?.label ?? id;
    acc.set(id, {
      label,
      allocation: new Decimal(0),
      selection: new Decimal(0),
      interaction: new Decimal(0),
    });
  }

  for (const r of perPeriod) {
    const kt = carinoCoefficient(r.portfolioReturn, r.benchmarkReturn);
    const scale = kt.div(k); // kₜ / k
    for (const seg of r.segments) {
      const a = acc.get(seg.id)!;
      a.allocation = a.allocation.plus(seg.allocation.times(scale));
      a.selection = a.selection.plus(seg.selection.times(scale));
      a.interaction = a.interaction.plus(seg.interaction.times(scale));
    }
  }

  const segments: LinkedSegmentEffect[] = ids.map((id) => {
    const a = acc.get(id)!;
    return {
      id,
      label: a.label,
      allocation: a.allocation,
      selection: a.selection,
      interaction: a.interaction,
      total: a.allocation.plus(a.selection).plus(a.interaction),
    };
  });

  const totalAllocation = segments.reduce(
    (s, e) => s.plus(e.allocation),
    new Decimal(0),
  );
  const totalSelection = segments.reduce(
    (s, e) => s.plus(e.selection),
    new Decimal(0),
  );
  const totalInteraction = segments.reduce(
    (s, e) => s.plus(e.interaction),
    new Decimal(0),
  );

  return {
    method,
    portfolioReturn,
    benchmarkReturn,
    activeReturn,
    segments,
    totalAllocation,
    totalSelection,
    totalInteraction,
    totalEffect: totalAllocation.plus(totalSelection).plus(totalInteraction),
  };
}

export type { SegmentEffect };
