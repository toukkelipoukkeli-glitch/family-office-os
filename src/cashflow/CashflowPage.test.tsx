import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  buildCashflowModel,
  seededCashflowInput,
  seededCashflowModel,
} from "@/lib/cashflow";

import CashflowPage from "./CashflowPage";

describe("CashflowPage", () => {
  it("renders the heading and the six headline KPIs", () => {
    render(<CashflowPage />);
    expect(
      screen.getByRole("heading", { name: /household cashflow projection/i }),
    ).toBeInTheDocument();
    for (const id of [
      "kpi-opening",
      "kpi-ending",
      "kpi-min",
      "kpi-inflows",
      "kpi-outflows",
      "kpi-net",
    ]) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
  });

  it("draws the projected-balance line chart and its summary", () => {
    render(<CashflowPage />);
    expect(screen.getByTestId("line-chart")).toBeInTheDocument();
    expect(screen.getByTestId("cashflow-balance-summary")).toBeInTheDocument();
  });

  it("draws the per-category bar chart with one bar per category", () => {
    render(<CashflowPage />);
    const bar = screen.getByTestId("bar-chart");
    expect(bar).toHaveAttribute(
      "data-bars",
      String(seededCashflowModel.categories.length),
    );
  });

  it("lists every projected month in the table", () => {
    render(<CashflowPage />);
    const rows = screen.getAllByTestId("cashflow-row");
    expect(rows).toHaveLength(seededCashflowModel.months.length);
    // First row is the first horizon month (2024-07).
    expect(rows[0].getAttribute("data-period")).toBe("2024-07");
    expect(rows[rows.length - 1].getAttribute("data-period")).toBe("2026-06");
  });

  it("hides the shortfall banner when the household stays solvent", () => {
    // The seeded household never runs negative (firstShortfallPeriod is null).
    expect(seededCashflowModel.kpis.firstShortfallPeriod).toBeNull();
    render(<CashflowPage />);
    expect(
      screen.queryByTestId("cashflow-shortfall-banner"),
    ).not.toBeInTheDocument();
  });

  it("shows the shortfall banner when cash goes negative", () => {
    // Thin opening cushion → a PE call drives the balance negative.
    const model = buildCashflowModel({
      input: { ...seededCashflowInput, openingBalance: "250000" },
    });
    expect(model.kpis.firstShortfallPeriod).not.toBeNull();
    render(<CashflowPage model={model} />);
    const banner = screen.getByTestId("cashflow-shortfall-banner");
    expect(banner).toBeInTheDocument();
    // Banner names the shortfall month (2024-09 → "Sep 2024").
    expect(banner).toHaveTextContent(/Sep 2024/);
  });

  it("renders the opening-balance KPI from the seeded model", () => {
    render(<CashflowPage />);
    // Compact currency for the 4,000,000 opening balance.
    expect(screen.getByTestId("kpi-opening")).toHaveTextContent(/\$4(\.0)?M/);
  });

  it("renders from a custom single-month model prop", () => {
    const model = buildCashflowModel({
      input: {
        openingBalance: "1000",
        horizonMonths: 1,
        currency: "USD",
        startPeriod: "2024-01",
        recurring: [
          {
            id: "s",
            label: "Salary",
            category: "salary",
            direction: "inflow",
            amount: "100",
            frequency: "monthly",
          },
        ],
      },
    });
    render(<CashflowPage model={model} />);
    expect(screen.getAllByTestId("cashflow-row")).toHaveLength(1);
  });
});
