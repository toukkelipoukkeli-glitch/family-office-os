/**
 * Goal & liability funding engine — asset-liability matching (ALM) for a
 * family office.
 *
 * A family office does not invest in the abstract; it invests *against
 * obligations*: a philanthropy pledge due in three years, school fees due every
 * autumn, an estate-tax reserve that must exist on the day the principal dies,
 * a perpetual spending floor that the family lives on. Each of these is a
 * **dated goal** — a future liability with a target amount and a due date — and
 * the question the family office must answer is brutally simple: *for each goal,
 * do we have enough money set aside, and growing fast enough, to meet it when it
 * comes due?*
 *
 * This module is the deterministic engine behind that question. It implements a
 * **dedicated-portfolio / liability-matching** model:
 *
 *  - a **goal** has a target {@link Money} amount, a due date (years from the
 *    valuation date), a priority, and a category (philanthropy, education,
 *    estate-tax reserve, spending floor, …);
 *  - **dedicated assets** are explicitly earmarked against a goal — a pool of
 *    capital set aside to fund it, optionally growing at an assumed real return
 *    until the due date;
 *  - the engine computes, per goal, the **future value** of its dedicated
 *    assets at the due date, discounts nothing on the liability (the target is
 *    already stated as the amount needed *at* the due date), and reports the
 *    **funded ratio** (assets-at-due ÷ target), the **funding gap** (target −
 *    assets-at-due, floored at zero), and the **surplus** when over-funded;
 *  - at the portfolio level it rolls these up into total target, total
 *    dedicated, total gap, an aggregate funded ratio, and a
 *    **dedicated-vs-shortfall** split for the headline stacked view.
 *
 * The model is intentionally a *matching* model, not a Monte-Carlo projection:
 * one assumed growth rate per goal, compounded deterministically. That keeps it
 * exact, testable, and explainable — the family office can point at any goal and
 * say precisely why it is or isn't funded.
 *
 * Everything is pure, deterministic and offline. Money is {@link Money}
 * (Decimal-backed) — never floating-point currency. READ-ONLY product: this
 * *analyses* whether goals are funded; it never moves money, rebalances a
 * dedicated pool, or funds anything.
 */

import { Decimal } from "decimal.js";

import { Money, sumMoney } from "@/lib/money";

/** Thrown when goal-funding inputs are structurally invalid. */
export class GoalFundingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoalFundingError";
  }
}

/**
 * The kind of obligation a goal represents. Drives grouping and labels in the
 * UI; it does not change the funding maths.
 */
export const GOAL_CATEGORIES = [
  "philanthropy",
  "education",
  "estate-tax",
  "spending-floor",
  "other",
] as const;
export type GoalCategory = (typeof GOAL_CATEGORIES)[number];

/** Human-readable labels for each {@link GoalCategory}. */
export const GOAL_CATEGORY_LABELS: Record<GoalCategory, string> = {
  philanthropy: "Philanthropy pledge",
  education: "Education",
  "estate-tax": "Estate-tax reserve",
  "spending-floor": "Spending floor",
  other: "Other",
};

/**
 * A pool of capital explicitly earmarked against a goal.
 *
 * `value` is today's market value; `growthRate` is the assumed annual real
 * return applied (compounded) from the valuation date to the goal's due date.
 * A `growthRate` of 0 models cash held flat; a negative rate models a reserve
 * expected to erode in real terms.
 */
export interface DedicatedAsset {
  /** Stable id. */
  id: string;
  /** Human-readable name, e.g. "Pledge escrow account". */
  name: string;
  /** Present market value of the earmarked capital. */
  value: Money;
  /**
   * Assumed annual growth rate as a decimal fraction (0.04 = 4%/yr). Compounded
   * from the valuation date to the goal's due date. Defaults to 0 (held flat).
   */
  growthRate?: number;
}

/**
 * A dated family goal / liability the office must fund.
 *
 * `target` is the amount required **at** `dueYears` from the valuation date
 * (already stated in due-date money, so no liability discounting is applied).
 * `dueYears` may be 0 (due now) or fractional (e.g. 0.5 = six months).
 */
export interface Goal {
  /** Stable id. */
  id: string;
  /** Human-readable name, e.g. "Hospital wing pledge". */
  name: string;
  /** What kind of obligation this is. */
  category: GoalCategory;
  /** Amount required at the due date. */
  target: Money;
  /** Years from the valuation date until the goal is due (>= 0). */
  dueYears: number;
  /**
   * Funding priority, lower = more important. Used only for ordering /
   * highlighting the most critical unfunded goals; it does not change the
   * per-goal maths.
   */
  priority: number;
  /** Capital pools earmarked against this goal (may be empty = fully unfunded). */
  dedicated: DedicatedAsset[];
}

/** A complete funding plan: the input to the engine. */
export interface FundingPlan {
  /** Stable id. */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Base reporting currency; every goal & asset must use it. */
  currency: string;
  /** The dated goals to fund. */
  goals: Goal[];
}

/** Per-goal funding analysis. */
export interface GoalFunding {
  /** The goal this row analyses. */
  goal: Goal;
  /** Sum of dedicated pools at present value. */
  dedicatedNow: Money;
  /**
   * Sum of dedicated pools grown to the due date (each pool compounded at its
   * own growth rate). This is what is actually available to meet the target.
   */
  dedicatedAtDue: Money;
  /** The goal's target amount (echoed for convenience). */
  target: Money;
  /**
   * Funding gap = max(0, target − dedicatedAtDue). Zero when fully funded or
   * over-funded.
   */
  gap: Money;
  /** Surplus = max(0, dedicatedAtDue − target). Zero when under-funded. */
  surplus: Money;
  /**
   * Funded ratio = dedicatedAtDue ÷ target, as an exact {@link Decimal}. 1 =
   * exactly funded, < 1 = short, > 1 = over-funded. When the target is zero the
   * ratio is defined as 1 (a zero liability is trivially funded).
   */
  fundedRatio: Decimal;
  /** True when dedicatedAtDue >= target (gap is zero). */
  funded: boolean;
}

/** Portfolio-level roll-up across all goals. */
export interface FundingSummary {
  /** Base currency. */
  currency: string;
  /** Per-goal rows, ordered by priority then due date. */
  goals: GoalFunding[];
  /** Sum of all goal targets. */
  totalTarget: Money;
  /** Sum of all dedicated pools at present value. */
  totalDedicatedNow: Money;
  /** Sum of all dedicated pools grown to their due dates. */
  totalDedicatedAtDue: Money;
  /**
   * Aggregate dedicated-vs-shortfall split, in due-date money: how much of the
   * total target is met by dedicated assets vs. how much is still short. The
   * dedicated portion is capped per-goal at the goal's target so an over-funded
   * goal cannot paper over another goal's shortfall.
   */
  dedicatedCovered: Money;
  /** Aggregate funding gap = totalTarget − dedicatedCovered. */
  totalGap: Money;
  /**
   * Aggregate funded ratio = dedicatedCovered ÷ totalTarget, as an exact
   * {@link Decimal}. Uses the *capped* covered amount so surpluses on one goal
   * do not inflate the headline number. 1 when there are no goals.
   */
  fundedRatio: Decimal;
  /** Count of goals that are fully funded. */
  fundedCount: number;
  /** Count of goals with a non-zero gap. */
  shortfallCount: number;
}

function assertCurrency(
  value: Money,
  expected: string,
  where: string,
): void {
  if (value.currency !== expected) {
    throw new GoalFundingError(
      `Currency mismatch in ${where}: ${value.currency} vs plan ${expected}`,
    );
  }
}

function validatePlan(plan: FundingPlan): string {
  const ccy = plan.currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(ccy)) {
    throw new GoalFundingError(`Invalid plan currency: ${plan.currency}`);
  }
  if (plan.goals.length === 0) {
    throw new GoalFundingError("A funding plan must have at least one goal");
  }
  const seen = new Set<string>();
  for (const goal of plan.goals) {
    if (seen.has(goal.id)) {
      throw new GoalFundingError(`Duplicate goal id: ${goal.id}`);
    }
    seen.add(goal.id);
    if (!Number.isFinite(goal.dueYears) || goal.dueYears < 0) {
      throw new GoalFundingError(
        `Goal ${goal.id}: dueYears must be a finite number >= 0`,
      );
    }
    if (!Number.isFinite(goal.priority)) {
      throw new GoalFundingError(`Goal ${goal.id}: priority must be finite`);
    }
    assertCurrency(goal.target, ccy, `goal ${goal.id} target`);
    if (goal.target.isNegative()) {
      throw new GoalFundingError(`Goal ${goal.id}: target must be >= 0`);
    }
    const assetIds = new Set<string>();
    for (const asset of goal.dedicated) {
      if (assetIds.has(asset.id)) {
        throw new GoalFundingError(
          `Goal ${goal.id}: duplicate dedicated asset id ${asset.id}`,
        );
      }
      assetIds.add(asset.id);
      assertCurrency(asset.value, ccy, `asset ${asset.id} in goal ${goal.id}`);
      if (asset.value.isNegative()) {
        throw new GoalFundingError(
          `Asset ${asset.id} in goal ${goal.id}: value must be >= 0`,
        );
      }
      if (
        asset.growthRate !== undefined &&
        (!Number.isFinite(asset.growthRate) || asset.growthRate <= -1)
      ) {
        throw new GoalFundingError(
          `Asset ${asset.id} in goal ${goal.id}: growthRate must be finite and > -1`,
        );
      }
    }
  }
  return ccy;
}

/**
 * Future value of `value` compounded at `rate` per year over `years`.
 * `value × (1 + rate) ^ years`, evaluated exactly via {@link Decimal} when the
 * exponent is an integer and via `Decimal.pow` (which supports fractional
 * exponents) otherwise.
 */
export function futureValue(value: Money, rate: number, years: number): Money {
  if (!Number.isFinite(years) || years < 0) {
    throw new GoalFundingError("futureValue: years must be finite and >= 0");
  }
  if (!Number.isFinite(rate) || rate <= -1) {
    throw new GoalFundingError("futureValue: rate must be finite and > -1");
  }
  if (years === 0 || rate === 0) {
    return value;
  }
  const base = new Decimal(1).plus(new Decimal(rate));
  const factor = base.pow(new Decimal(years));
  return value.times(factor);
}

/** Sum the present value of a goal's dedicated pools. */
function dedicatedNowOf(goal: Goal, currency: string): Money {
  return sumMoney(
    goal.dedicated.map((a) => a.value),
    currency,
  );
}

/** Sum a goal's dedicated pools grown to its due date. */
function dedicatedAtDueOf(goal: Goal, currency: string): Money {
  return sumMoney(
    goal.dedicated.map((a) =>
      futureValue(a.value, a.growthRate ?? 0, goal.dueYears),
    ),
    currency,
  );
}

/** Analyse a single goal's funding. */
export function analyzeGoal(goal: Goal, currency: string): GoalFunding {
  const dedicatedNow = dedicatedNowOf(goal, currency);
  const dedicatedAtDue = dedicatedAtDueOf(goal, currency);
  const target = goal.target;

  const shortfall = target.minus(dedicatedAtDue);
  const gap = shortfall.isPositive() ? shortfall : Money.zero(currency);
  const over = dedicatedAtDue.minus(target);
  const surplus = over.isPositive() ? over : Money.zero(currency);

  const fundedRatio = target.isZero()
    ? new Decimal(1)
    : dedicatedAtDue.amount.div(target.amount);
  const funded = gap.isZero();

  return {
    goal,
    dedicatedNow,
    dedicatedAtDue,
    target,
    gap,
    surplus,
    fundedRatio,
    funded,
  };
}

/**
 * Order comparator: most-critical first. Lower priority number wins; ties
 * broken by the sooner due date, then by id for stability.
 */
function byCriticality(a: GoalFunding, b: GoalFunding): number {
  if (a.goal.priority !== b.goal.priority) {
    return a.goal.priority - b.goal.priority;
  }
  if (a.goal.dueYears !== b.goal.dueYears) {
    return a.goal.dueYears - b.goal.dueYears;
  }
  return a.goal.id < b.goal.id ? -1 : a.goal.id > b.goal.id ? 1 : 0;
}

/**
 * Analyse a whole funding plan: validate it, analyse each goal, and roll the
 * results up into a {@link FundingSummary}.
 */
export function analyzeFundingPlan(plan: FundingPlan): FundingSummary {
  const currency = validatePlan(plan);

  const goals = plan.goals
    .map((g) => analyzeGoal(g, currency))
    .sort(byCriticality);

  const totalTarget = sumMoney(
    goals.map((g) => g.target),
    currency,
  );
  const totalDedicatedNow = sumMoney(
    goals.map((g) => g.dedicatedNow),
    currency,
  );
  const totalDedicatedAtDue = sumMoney(
    goals.map((g) => g.dedicatedAtDue),
    currency,
  );

  // Covered amount, capped per-goal at the target so an over-funded goal can't
  // mask another goal's shortfall in the headline split.
  const dedicatedCovered = sumMoney(
    goals.map((g) =>
      g.dedicatedAtDue.greaterThan(g.target) ? g.target : g.dedicatedAtDue,
    ),
    currency,
  );
  const totalGap = totalTarget.minus(dedicatedCovered);

  const fundedRatio = totalTarget.isZero()
    ? new Decimal(1)
    : dedicatedCovered.amount.div(totalTarget.amount);

  const fundedCount = goals.filter((g) => g.funded).length;
  const shortfallCount = goals.filter((g) => !g.funded).length;

  return {
    currency,
    goals,
    totalTarget,
    totalDedicatedNow,
    totalDedicatedAtDue,
    dedicatedCovered,
    totalGap,
    fundedRatio,
    fundedCount,
    shortfallCount,
  };
}

/** Format a funded ratio (Decimal fraction) as a rounded percent string, e.g. "87%". */
export function formatFundedRatio(ratio: Decimal): string {
  return `${ratio.times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toFixed()}%`;
}
