import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Money } from "@/lib/money";
import type { GivingPlan } from "@/lib/giving";

import GivingPage from "./GivingPage";

const usd = (a: string) => Money.of(a, "USD");

/** A cash-only plan with no appreciated gifts (no in-kind spotlight). */
function cashOnlyPlan(): GivingPlan {
  return {
    name: "Cash-only",
    profile: {
      currency: "USD",
      agi: usd("1000000"),
      ordinaryRate: 0.37,
      capitalGainsRate: 0.238,
      standardDeduction: usd("29200"),
      otherItemized: usd("0"),
    },
    years: [
      {
        year: 2026,
        gifts: [
          {
            id: "c1",
            label: "Cash gift",
            kind: "cash",
            recipient: "public-charity",
            fairMarketValue: usd("100000"),
          },
        ],
      },
    ],
  };
}

describe("GivingPage", () => {
  it("renders the heading and the four headline KPIs", () => {
    render(<GivingPage />);
    expect(
      screen.getByRole("heading", { name: /charitable giving planner/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("kpi-gifted")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-cg-avoided")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-benefit")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-net-cost")).toBeInTheDocument();
  });

  it("shows the seeded plan's headline totals", () => {
    render(<GivingPage />);
    // total gifted 2.1M, CG avoided ~316.5K, benefit ~1.1M, net cost ~1.0M
    expect(screen.getByTestId("kpi-gifted")).toHaveTextContent("$2.1M");
    expect(screen.getByTestId("kpi-cg-avoided")).toHaveTextContent("$316.5K");
    expect(screen.getByTestId("kpi-benefit")).toHaveTextContent("$1.1M");
    expect(screen.getByTestId("kpi-net-cost")).toHaveTextContent("$1M");
  });

  it("renders the in-kind spotlight for the largest appreciated gift", () => {
    render(<GivingPage />);
    const card = screen.getByTestId("inkind-card");
    expect(card).toBeInTheDocument();
    // Largest appreciated gift is ACME (1.2M FMV).
    expect(card).toHaveTextContent(/ACME/);
    expect(screen.getByTestId("inkind-cg")).toBeInTheDocument();
    expect(screen.getByTestId("inkind-advantage")).toBeInTheDocument();
  });

  it("renders a plan row per year and a totals row", () => {
    render(<GivingPage />);
    const rows = within(screen.getByTestId("plan-table")).getAllByTestId(
      "plan-row",
    );
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveAttribute("data-year", "2026");
    expect(screen.getByTestId("plan-total-row")).toHaveTextContent("$2.1M");
  });

  it("draws a benefit bar per year", () => {
    render(<GivingPage />);
    const bars = within(screen.getByTestId("benefit-chart")).getAllByTestId(
      "benefit-bar",
    );
    expect(bars).toHaveLength(4);
  });

  it("lists every gift with its capital-gains-avoided badge", () => {
    render(<GivingPage />);
    const rows = within(screen.getByTestId("gift-list")).getAllByTestId(
      "gift-row",
    );
    // 2 gifts in 2026 + 1 each of 2027/2028/2029 = 5 gifts.
    expect(rows).toHaveLength(5);
    expect(screen.getByTestId("gift-list")).toHaveTextContent(/CG avoided/);
  });

  it("hides the in-kind spotlight when there are no appreciated gifts", () => {
    render(<GivingPage plan={cashOnlyPlan()} />);
    expect(screen.queryByTestId("inkind-card")).not.toBeInTheDocument();
    // Cash-only: zero capital gains avoided.
    expect(screen.getByTestId("kpi-cg-avoided")).toHaveTextContent("$0");
  });

  it("links back to the dashboard", () => {
    render(<GivingPage />);
    expect(screen.getByTestId("giving-back")).toHaveAttribute("href", "#/");
  });
});
