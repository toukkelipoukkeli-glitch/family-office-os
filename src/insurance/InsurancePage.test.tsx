import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Money } from "@/lib/money";
import type { InsuranceBook } from "@/lib/insurance";

import InsurancePage from "./InsurancePage";

const usd = (a: string) => Money.of(a, "USD");

/** A fully-covered book with no gaps at all. */
function cleanBook(): InsuranceBook {
  return {
    id: "clean",
    name: "Clean book",
    currency: "USD",
    exposure: {
      netWorth: usd("1000000"),
      lifeNeed: usd("1000000"),
      propertyValue: usd("1000000"),
      liabilityExposure: usd("1000000"),
    },
    policies: [
      {
        id: "l",
        name: "Life",
        carrier: "C",
        kind: "life",
        status: "active",
        coverage: usd("1000000"),
        annualPremium: usd("1000"),
      },
      {
        id: "p",
        name: "Property",
        carrier: "C",
        kind: "property",
        status: "active",
        coverage: usd("1000000"),
        annualPremium: usd("1000"),
      },
      {
        id: "li",
        name: "Liability",
        carrier: "C",
        kind: "liability",
        status: "active",
        coverage: usd("1000000"),
        annualPremium: usd("1000"),
      },
    ],
  };
}

describe("InsurancePage", () => {
  it("renders the heading and the four headline KPIs", () => {
    render(<InsurancePage />);
    expect(
      screen.getByRole("heading", { name: /insurance coverage tracker/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("kpi-coverage")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-premium")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-tower")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-gaps")).toBeInTheDocument();
  });

  it("draws a coverage bar per category, in canonical order", () => {
    render(<InsurancePage />);
    const bars = within(screen.getByTestId("coverage-bars")).getAllByTestId(
      "coverage-bar",
    );
    expect(bars.map((b) => b.getAttribute("data-kind"))).toEqual([
      "life",
      "property",
      "liability",
      "umbrella",
    ]);
  });

  it("lists every policy in the schedule, badging non-active ones", () => {
    render(<InsurancePage />);
    const rows = within(screen.getByTestId("policy-table")).getAllByTestId(
      "policy-row",
    );
    expect(rows).toHaveLength(9);
    const lapsed = rows.find(
      (r) => r.getAttribute("data-policy") === "pc-jewellery-floater",
    )!;
    expect(within(lapsed).getByTestId("policy-status-badge")).toHaveTextContent(
      /lapsed/i,
    );
  });

  it("surfaces the property critical gap and the life warning", () => {
    render(<InsurancePage />);
    const gaps = within(screen.getByTestId("gap-list")).getAllByTestId(
      "gap-row",
    );
    const critical = gaps.filter(
      (g) => g.getAttribute("data-severity") === "critical",
    );
    expect(
      critical.some((g) => g.getAttribute("data-scope") === "property"),
    ).toBe(true);
    // life is a warning, with a quantified shortfall.
    const lifeGap = gaps.find(
      (g) =>
        g.getAttribute("data-scope") === "life" &&
        g.getAttribute("data-severity") === "warning",
    );
    expect(lifeGap).toBeDefined();
    expect(lifeGap!).toHaveTextContent(/shortfall/i);
  });

  it("shows the liability tower KPI as covered for the seeded book", () => {
    render(<InsurancePage />);
    // 55M tower vs 52.5M net worth -> 105% -> up tone.
    expect(screen.getByTestId("kpi-tower")).toHaveTextContent("105%");
  });

  it("shows an all-clear state when there are no gaps", () => {
    render(<InsurancePage book={cleanBook()} />);
    expect(screen.getByTestId("gaps-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("gap-list")).not.toBeInTheDocument();
    expect(screen.getByTestId("kpi-gaps")).toHaveTextContent("0");
  });

  it("links back to the dashboard", () => {
    render(<InsurancePage />);
    expect(screen.getByTestId("insurance-back")).toHaveAttribute("href", "#/");
  });
});
