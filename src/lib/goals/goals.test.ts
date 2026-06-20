import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import { Money } from "@/lib/money";

import {
  analyzeFundingPlan,
  analyzeGoal,
  formatFundedRatio,
  futureValue,
  GoalFundingError,
  seededFundingPlan,
  type FundingPlan,
  type Goal,
} from "./index";

const usd = (a: string) => Money.of(a, "USD");

function goal(overrides: Partial<Goal> & Pick<Goal, "id">): Goal {
  return {
    name: "Goal",
    category: "other",
    target: usd("1000000"),
    dueYears: 1,
    priority: 1,
    dedicated: [],
    ...overrides,
  };
}

describe("futureValue", () => {
  it("returns the same amount at zero years or zero rate", () => {
    expect(futureValue(usd("1000"), 0.05, 0).equals(usd("1000"))).toBe(true);
    expect(futureValue(usd("1000"), 0, 5).equals(usd("1000"))).toBe(true);
  });

  it("compounds at an integer horizon exactly", () => {
    // 1000 * 1.1^2 = 1210
    expect(futureValue(usd("1000"), 0.1, 2).round().equals(usd("1210"))).toBe(
      true,
    );
  });

  it("supports fractional horizons", () => {
    const fv = futureValue(usd("1000"), 0.21, 0.5); // sqrt(1.21) = 1.1
    expect(fv.round().equals(usd("1100"))).toBe(true);
  });

  it("rejects a rate <= -1 or non-finite inputs", () => {
    expect(() => futureValue(usd("1"), -1, 1)).toThrow(GoalFundingError);
    expect(() => futureValue(usd("1"), 0.05, -1)).toThrow(GoalFundingError);
    expect(() => futureValue(usd("1"), Infinity, 1)).toThrow(GoalFundingError);
  });
});

describe("analyzeGoal", () => {
  it("marks a fully cash-funded, due-now goal as funded with ratio 1", () => {
    const g = goal({
      id: "g",
      target: usd("500000"),
      dueYears: 0,
      dedicated: [{ id: "a", name: "Cash", value: usd("500000") }],
    });
    const f = analyzeGoal(g, "USD");
    expect(f.funded).toBe(true);
    expect(f.gap.isZero()).toBe(true);
    expect(f.surplus.isZero()).toBe(true);
    expect(f.fundedRatio.equals(1)).toBe(true);
    expect(f.dedicatedAtDue.equals(usd("500000"))).toBe(true);
  });

  it("reports a gap and ratio < 1 for an under-funded goal", () => {
    const g = goal({
      id: "g",
      target: usd("1000000"),
      dueYears: 0,
      dedicated: [{ id: "a", name: "Cash", value: usd("600000") }],
    });
    const f = analyzeGoal(g, "USD");
    expect(f.funded).toBe(false);
    expect(f.gap.equals(usd("400000"))).toBe(true);
    expect(f.surplus.isZero()).toBe(true);
    expect(f.fundedRatio.equals(new Decimal("0.6"))).toBe(true);
  });

  it("reports a surplus and ratio > 1 for an over-funded goal", () => {
    const g = goal({
      id: "g",
      target: usd("1000000"),
      dueYears: 0,
      dedicated: [{ id: "a", name: "Cash", value: usd("1500000") }],
    });
    const f = analyzeGoal(g, "USD");
    expect(f.funded).toBe(true);
    expect(f.gap.isZero()).toBe(true);
    expect(f.surplus.equals(usd("500000"))).toBe(true);
    expect(f.fundedRatio.equals(new Decimal("1.5"))).toBe(true);
  });

  it("grows dedicated assets to the due date before comparing to target", () => {
    const g = goal({
      id: "g",
      target: usd("1210000"),
      dueYears: 2,
      dedicated: [
        { id: "a", name: "Pool", value: usd("1000000"), growthRate: 0.1 },
      ],
    });
    const f = analyzeGoal(g, "USD");
    expect(f.dedicatedNow.equals(usd("1000000"))).toBe(true);
    expect(f.dedicatedAtDue.round().equals(usd("1210000"))).toBe(true);
    expect(f.funded).toBe(true);
  });

  it("treats a zero target as trivially funded (ratio 1)", () => {
    const f = analyzeGoal(goal({ id: "g", target: usd("0") }), "USD");
    expect(f.fundedRatio.equals(1)).toBe(true);
    expect(f.funded).toBe(true);
  });
});

describe("analyzeFundingPlan — seeded Ursin plan (oracle)", () => {
  const summary = analyzeFundingPlan(seededFundingPlan);

  it("orders goals by priority then due date (most critical first)", () => {
    // priority 1: spending (due 1y) then estate-tax (due 8y); then pledge(2),
    // school(3), endowment(4).
    expect(summary.goals.map((g) => g.goal.id)).toEqual([
      "g-spending",
      "g-estate-tax",
      "g-pledge",
      "g-school",
      "g-endowment",
    ]);
  });

  it("computes the per-goal dedicated-at-due and funded ratios exactly", () => {
    const byId = (id: string) =>
      summary.goals.find((g) => g.goal.id === id)!;

    expect(byId("g-pledge").dedicatedAtDue.amount.toFixed(6)).toBe(
      "4724428.800000",
    );
    expect(byId("g-estate-tax").dedicatedAtDue.amount.toFixed(6)).toBe(
      "8864732.662734",
    );
    expect(byId("g-endowment").dedicatedAtDue.amount.toFixed(6)).toBe(
      "2676451.155200",
    );

    expect(byId("g-school").funded).toBe(true);
    expect(byId("g-school").fundedRatio.equals(1)).toBe(true);
    expect(byId("g-spending").surplus.equals(usd("2000000"))).toBe(true);
    expect(byId("g-pledge").funded).toBe(false);
    expect(byId("g-estate-tax").funded).toBe(false);
  });

  it("rolls up totals and the capped dedicated-vs-shortfall split", () => {
    expect(summary.totalTarget.equals(usd("41200000"))).toBe(true);
    expect(summary.totalDedicatedNow.equals(usd("35400000"))).toBe(true);
    // covered caps the over-funded spending floor at its 20M target.
    expect(summary.dedicatedCovered.amount.toFixed(6)).toBe(
      "37465612.617934",
    );
    expect(summary.totalGap.amount.toFixed(6)).toBe("3734387.382066");
    expect(summary.fundedRatio.times(100).toDecimalPlaces(2).toFixed()).toBe(
      "90.94",
    );
  });

  it("counts funded vs shortfall goals", () => {
    // funded: school (exact), spending (surplus). short: pledge, estate, endow.
    expect(summary.fundedCount).toBe(2);
    expect(summary.shortfallCount).toBe(3);
  });

  it("never lets a surplus mask another goal's shortfall", () => {
    // The capped covered amount strips out the spending floor's 2M surplus, so
    // it is strictly below the uncapped total-at-due -> the surplus is not
    // double-counted, and a real aggregate gap remains.
    expect(
      summary.dedicatedCovered.lessThan(summary.totalDedicatedAtDue),
    ).toBe(true);
    expect(
      summary.totalDedicatedAtDue
        .minus(summary.dedicatedCovered)
        .equals(usd("2000000")),
    ).toBe(true);
    expect(summary.totalGap.isPositive()).toBe(true);
  });
});

describe("formatFundedRatio", () => {
  it("renders a Decimal fraction as a rounded percent", () => {
    expect(formatFundedRatio(new Decimal("0.9094"))).toBe("91%");
    expect(formatFundedRatio(new Decimal("1"))).toBe("100%");
    expect(formatFundedRatio(new Decimal("1.5"))).toBe("150%");
  });
});

describe("validation", () => {
  const base: FundingPlan = {
    id: "p",
    name: "P",
    currency: "USD",
    goals: [goal({ id: "g" })],
  };

  it("rejects an empty plan", () => {
    expect(() =>
      analyzeFundingPlan({ ...base, goals: [] }),
    ).toThrow(/at least one goal/);
  });

  it("rejects duplicate goal ids", () => {
    expect(() =>
      analyzeFundingPlan({
        ...base,
        goals: [goal({ id: "dup" }), goal({ id: "dup" })],
      }),
    ).toThrow(/Duplicate goal id/);
  });

  it("rejects a negative due date", () => {
    expect(() =>
      analyzeFundingPlan({ ...base, goals: [goal({ id: "g", dueYears: -1 })] }),
    ).toThrow(/dueYears/);
  });

  it("rejects a currency mismatch between plan and goal target", () => {
    expect(() =>
      analyzeFundingPlan({
        ...base,
        goals: [goal({ id: "g", target: Money.of("1", "EUR") })],
      }),
    ).toThrow(/Currency mismatch/);
  });

  it("rejects a dedicated asset whose growthRate <= -1", () => {
    expect(() =>
      analyzeFundingPlan({
        ...base,
        goals: [
          goal({
            id: "g",
            dedicated: [
              { id: "a", name: "x", value: usd("1"), growthRate: -1 },
            ],
          }),
        ],
      }),
    ).toThrow(/growthRate/);
  });

  it("rejects a negative target", () => {
    expect(() =>
      analyzeFundingPlan({
        ...base,
        goals: [goal({ id: "g", target: usd("-1") })],
      }),
    ).toThrow(/target must be >= 0/);
  });
});
