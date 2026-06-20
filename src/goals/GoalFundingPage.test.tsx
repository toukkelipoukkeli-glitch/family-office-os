import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Money } from "@/lib/money";
import type { FundingPlan } from "@/lib/goals";

import GoalFundingPage from "./GoalFundingPage";

const usd = (a: string) => Money.of(a, "USD");

/** A tiny two-goal plan: one funded, one deliberately short. */
function mixedPlan(): FundingPlan {
  return {
    id: "p",
    name: "Test funding plan",
    currency: "USD",
    goals: [
      {
        id: "funded",
        name: "Funded goal",
        category: "education",
        target: usd("1000000"),
        dueYears: 0,
        priority: 1,
        dedicated: [{ id: "a", name: "Cash", value: usd("1000000") }],
      },
      {
        id: "short",
        name: "Short goal",
        category: "philanthropy",
        target: usd("1000000"),
        dueYears: 0,
        priority: 2,
        dedicated: [{ id: "b", name: "Pool", value: usd("400000") }],
      },
    ],
  };
}

describe("GoalFundingPage", () => {
  it("renders the heading and the four headline KPIs", () => {
    render(<GoalFundingPage />);
    expect(
      screen.getByRole("heading", { name: /goal & liability funding/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("kpi-target")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-dedicated")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-gap")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-funded-ratio")).toBeInTheDocument();
  });

  it("renders the seeded funded ratio of 91%", () => {
    render(<GoalFundingPage />);
    expect(screen.getByTestId("agg-ratio")).toHaveTextContent("91% funded");
  });

  it("renders one row per goal with its funded state", () => {
    render(<GoalFundingPage plan={mixedPlan()} />);
    const rows = screen.getAllByTestId("goal-row");
    expect(rows).toHaveLength(2);

    const funded = rows.find(
      (r) => r.getAttribute("data-goal-id") === "funded",
    )!;
    expect(funded).toHaveAttribute("data-funded", "true");
    expect(within(funded).getByTestId("goal-ratio")).toHaveTextContent("100%");

    const short = rows.find((r) => r.getAttribute("data-goal-id") === "short")!;
    expect(short).toHaveAttribute("data-funded", "false");
    expect(within(short).getByTestId("goal-ratio")).toHaveTextContent("40%");
  });

  it("renders the dedicated-vs-shortfall split with a shortfall segment", () => {
    render(<GoalFundingPage plan={mixedPlan()} />);
    // covered = 1.0M (funded) + 0.4M (short) = 1.4M of 2.0M target -> 70%.
    const bar = screen.getByTestId("split-bar");
    expect(bar).toHaveAttribute("data-covered-pct", "70.00");
    expect(screen.getByTestId("split-shortfall")).toBeInTheDocument();
  });

  it("hides the shortfall segment when every goal is funded", () => {
    const plan: FundingPlan = {
      id: "p",
      name: "All funded",
      currency: "USD",
      goals: [
        {
          id: "g",
          name: "G",
          category: "other",
          target: usd("100"),
          dueYears: 0,
          priority: 1,
          dedicated: [{ id: "a", name: "Cash", value: usd("100") }],
        },
      ],
    };
    render(<GoalFundingPage plan={plan} />);
    expect(screen.queryByTestId("split-shortfall")).not.toBeInTheDocument();
    expect(screen.getByTestId("agg-ratio")).toHaveTextContent("100% funded");
  });
});
