import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { TIGHT_FORECAST_INPUT } from "@/lib/cashflow";

import CashflowPage from "./CashflowPage";

describe("CashflowPage", () => {
  it("renders the heading and the four headline KPIs", () => {
    render(<CashflowPage />);
    expect(
      screen.getByRole("heading", { name: /cashflow & liquidity runway/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("kpi-opening")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-runway")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-lowest")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-ending")).toBeInTheDocument();
  });

  it("draws the runway chart with one point per period plus the opening point", () => {
    render(<CashflowPage />);
    const chart = screen.getByTestId("runway-chart");
    expect(chart).toBeInTheDocument();
    // 12 periods + opening "Now" = 13 points.
    expect(chart).toHaveAttribute("data-points", "13");
    expect(within(chart).getByTestId("runway-zero-line")).toBeInTheDocument();
    expect(within(chart).getByTestId("runway-line")).toBeInTheDocument();
    expect(within(chart).getByTestId("runway-area")).toBeInTheDocument();
  });

  it("defaults to the surviving base case (no depletion marker)", () => {
    render(<CashflowPage />);
    const chart = screen.getByTestId("runway-chart");
    expect(chart).toHaveAttribute("data-exhausted", "false");
    expect(within(chart).queryByTestId("runway-depletion")).toBeNull();
    expect(screen.getByTestId("kpi-runway")).toHaveTextContent(/12\+ months/);
    expect(screen.getByTestId("runway-summary")).toHaveTextContent(/holds/i);
  });

  it("renders a per-period flow table with one row per month", () => {
    render(<CashflowPage />);
    const table = screen.getByTestId("flow-table");
    const rows = within(table).getAllByTestId("flow-row");
    expect(rows).toHaveLength(12);
    // The first row is M0 and is not breached in the base case.
    expect(rows[0]).toHaveAttribute("data-period", "0");
    expect(rows.every((r) => r.getAttribute("data-breached") === "false")).toBe(
      true,
    );
  });

  it("switches to the thin-buffer scenario and shows depletion", async () => {
    const user = userEvent.setup();
    render(<CashflowPage />);

    await user.click(screen.getByTestId("scenario-tight"));

    expect(screen.getByTestId("scenario-tight")).toHaveAttribute(
      "data-selected",
      "true",
    );
    const chart = screen.getByTestId("runway-chart");
    expect(chart).toHaveAttribute("data-exhausted", "true");
    expect(within(chart).getByTestId("runway-depletion")).toBeInTheDocument();
    expect(screen.getByTestId("runway-summary")).toHaveTextContent(/runs out/i);

    // At least one breached row now appears.
    const breached = within(screen.getByTestId("flow-table"))
      .getAllByTestId("flow-row")
      .filter((r) => r.getAttribute("data-breached") === "true");
    expect(breached.length).toBeGreaterThan(0);
  });

  it("honors a controlled input prop and hides the scenario toggle", () => {
    render(<CashflowPage input={TIGHT_FORECAST_INPUT} />);
    expect(screen.queryByTestId("scenario-toggle")).toBeNull();
    const chart = screen.getByTestId("runway-chart");
    expect(chart).toHaveAttribute("data-exhausted", "true");
  });

  it("links back to the dashboard", () => {
    render(<CashflowPage />);
    expect(screen.getByTestId("cashflow-back")).toHaveAttribute("href", "#/");
  });
});
