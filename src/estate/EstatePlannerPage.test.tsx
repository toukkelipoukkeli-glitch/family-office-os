import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Money } from "@/lib/money";
import type { EstatePlan } from "@/lib/estate";

import EstatePlannerPage from "./EstatePlannerPage";

const usd = (a: string) => Money.of(a, "USD");

/** A plan with a deliberate liquidity shortfall (all wealth illiquid). */
function shortfallPlan(): EstatePlan {
  return {
    id: "short",
    name: "Illiquid estate",
    currency: "USD",
    principal: "Test Principal",
    entities: [{ id: "holdco", name: "HoldCo", kind: "holdco" }],
    assets: [
      {
        id: "co",
        name: "Operating company",
        value: usd("10000000"),
        liquidity: "illiquid",
        entityId: "holdco",
      },
      { id: "cash", name: "Cash", value: usd("100000"), liquidity: "cash" },
    ],
    liabilities: [],
    beneficiaries: [{ id: "kid", name: "Heir", relation: "child" }],
    bequests: [{ id: "bq", beneficiaryId: "kid", residueShare: 1 }],
    exemption: usd("0"),
    taxRate: 0.4,
  };
}

describe("EstatePlannerPage", () => {
  it("renders the heading and the four headline KPIs", () => {
    render(<EstatePlannerPage />);
    expect(
      screen.getByRole("heading", { name: /estate & succession planner/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("kpi-gross")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-taxable")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-tax")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-coverage")).toBeInTheDocument();
  });

  it("shows the seeded plan's coverage verdict as covered", () => {
    render(<EstatePlannerPage />);
    const verdict = screen.getByTestId("coverage-verdict");
    expect(verdict).toHaveAttribute("data-covered", "true");
    expect(verdict).toHaveTextContent(/fully covered/i);
    expect(screen.getByTestId("kpi-coverage")).toHaveTextContent("208%");
  });

  it("renders the estate-tax build-up ending in the tax due", () => {
    render(<EstatePlannerPage />);
    const table = screen.getByTestId("tax-table");
    expect(table).toBeInTheDocument();
    // The seeded plan's tax is $4.8M (compact).
    expect(screen.getByTestId("tax-row-total")).toHaveTextContent(/\$4\.8M/);
  });

  it("lists a row per beneficiary, sorted by net descending", () => {
    render(<EstatePlannerPage />);
    const list = screen.getByTestId("beneficiary-list");
    const rows = within(list).getAllByTestId("beneficiary-row");
    expect(rows).toHaveLength(4);
    // Spouse (the largest marital legacy) leads.
    expect(rows[0]).toHaveAttribute("data-beneficiary", "spouse");
  });

  it("draws the settlement funding waterfall, cash first", () => {
    render(<EstatePlannerPage />);
    const rows = within(screen.getByTestId("waterfall-table")).getAllByTestId(
      "waterfall-row",
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toHaveAttribute("data-cls", "cash");
  });

  it("draws the succession flow graph with estate, entity, beneficiary and tax nodes", () => {
    render(<EstatePlannerPage />);
    const flow = screen.getByTestId("succession-flow");
    expect(flow).toBeInTheDocument();
    const kinds = new Set(
      within(flow)
        .getAllByTestId("flow-node")
        .map((n) => n.getAttribute("data-kind")),
    );
    expect(kinds).toContain("estate");
    expect(kinds).toContain("entity");
    expect(kinds).toContain("beneficiary");
    expect(kinds).toContain("tax");
    expect(within(flow).getAllByTestId("flow-link").length).toBeGreaterThan(0);
  });

  it("surfaces a liquidity shortfall when the estate is illiquid", () => {
    render(<EstatePlannerPage plan={shortfallPlan()} />);
    const verdict = screen.getByTestId("coverage-verdict");
    expect(verdict).toHaveAttribute("data-covered", "false");
    expect(verdict).toHaveTextContent(/shortfall/i);
    // The waterfall must dip into the illiquid tier.
    const rows = within(screen.getByTestId("waterfall-table")).getAllByTestId(
      "waterfall-row",
    );
    expect(rows.some((r) => r.getAttribute("data-cls") === "illiquid")).toBe(
      true,
    );
  });

  it("links back to the dashboard", () => {
    render(<EstatePlannerPage />);
    expect(screen.getByTestId("estate-back")).toHaveAttribute("href", "#/");
  });
});
