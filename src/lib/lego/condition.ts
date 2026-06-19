import { Decimal } from "decimal.js";
import * as z from "zod";

/**
 * Condition grading for LEGO sets on the secondary market.
 *
 * Collectors price a set very differently depending on whether it is still
 * factory-sealed, opened-but-complete (CIB — "complete in box"), used/built, or
 * incomplete. The grade is the single biggest driver of secondary value after
 * the set's identity, so the price guide normalizes every comparable to a
 * common grade (`sealed`) before aggregating, then re-applies the multiplier
 * for the grade being valued.
 *
 * READ-ONLY product: a grade is descriptive metadata for reporting.
 */
export const SET_CONDITIONS = [
  "sealed", // factory-sealed, new in box (NISB)
  "complete", // opened, complete in box with instructions (CIB)
  "used", // built/used, complete, no/partial box
  "incomplete", // missing pieces / instructions / box
] as const;

export const SetCondition = z.enum(SET_CONDITIONS);
export type SetCondition = z.infer<typeof SetCondition>;

/**
 * Multiplier each condition commands relative to a factory-sealed example of
 * the same set (`sealed` = 1.0). These are deliberately conservative,
 * documented heuristics for a *reporting* estimate, not a market oracle:
 *
 *  - `complete`  ~0.72 of sealed — opened CIB with instructions.
 *  - `used`      ~0.55 of sealed — built, complete, box wear.
 *  - `incomplete` ~0.30 of sealed — before any completeness penalty.
 *
 * Exposed (and exact, via {@link Decimal}) so the assumption is auditable and
 * testable rather than buried in arithmetic.
 */
export const CONDITION_MULTIPLIERS: Record<SetCondition, Decimal> = {
  sealed: new Decimal("1.00"),
  complete: new Decimal("0.72"),
  used: new Decimal("0.55"),
  incomplete: new Decimal("0.30"),
};

/** The multiplier a condition commands relative to a factory-sealed example. */
export function conditionMultiplier(condition: SetCondition): Decimal {
  return CONDITION_MULTIPLIERS[condition];
}

/**
 * A completeness fraction in the inclusive range [0, 1] — the share of pieces
 * (by value, approximated by count) the example still has. Stored as an exact
 * decimal string so it survives JSON round-trips without float drift.
 */
export const Completeness = z
  .string()
  .trim()
  .regex(/^(0(\.\d+)?|1(\.0+)?)$/, "completeness must be a decimal in [0, 1]");
export type Completeness = z.infer<typeof Completeness>;

/**
 * Penalty factor applied for missing pieces. A fully complete example
 * (`completeness` = 1) is unpenalized (factor 1). Missing pieces hurt more than
 * linearly because a set missing even a few pieces is much less desirable, so
 * the factor is `completeness^1.5`, clamped to [0, 1].
 *
 * Sealed sets are complete by definition; callers should pass `1` for them.
 */
export function completenessFactor(completeness: Decimal): Decimal {
  if (completeness.lessThan(0) || completeness.greaterThan(1)) {
    throw new Error(
      `completeness must be in [0, 1], got ${completeness.toFixed()}`,
    );
  }
  // completeness ** 1.5 — exact at the endpoints (0 -> 0, 1 -> 1).
  if (completeness.isZero()) return new Decimal(0);
  if (completeness.equals(1)) return new Decimal(1);
  return completeness.pow(new Decimal("1.5"));
}
