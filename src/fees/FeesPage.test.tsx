import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { seededFeeModel } from "@/lib/fees";

import FeesPage from "./FeesPage";

describe("FeesPage", () => {
  it("renders the heading and the four headline KPIs", () => {
    render(<FeesPage />);
    expect(
      screen.getByRole("heading", {
        name: /fees & total cost of ownership/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("kpi-invested")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-annual-cost")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-blended-rate")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-drag")).toBeInTheDocument();
  });

  it("draws the per-fund cost bar chart with one bar per fund", () => {
    render(<FeesPage />);
    const bar = screen.getByTestId("bar-chart");
    expect(bar).toHaveAttribute(
      "data-bars",
      String(seededFeeModel.funds.length),
    );
  });

  it("draws the fee-composition donut and a legend row per fee type", () => {
    render(<FeesPage />);
    expect(screen.getByTestId("donut-chart")).toBeInTheDocument();
    const legend = screen.getByTestId("composition-legend");
    const rows = within(legend).getAllByTestId("composition-row");
    expect(rows).toHaveLength(seededFeeModel.composition.length);
    expect(rows.map((r) => r.getAttribute("data-key"))).toEqual([
      "management",
      "fundExpenses",
      "performance",
    ]);
  });

  it("draws the fee-drag line chart with gross and net series", () => {
    render(<FeesPage />);
    // Two line series rendered as paths.
    const line = screen
      .getAllByRole("img", { hidden: true })
      .find((el) => el.querySelectorAll("path").length >= 2);
    expect(screen.getByTestId("drag-summary")).toBeInTheDocument();
    expect(line ?? screen.getByTestId("drag-summary")).toBeTruthy();
  });

  it("lists every fund in the breakdown table, most expensive first", () => {
    render(<FeesPage />);
    const rows = screen.getAllByTestId("fees-row");
    expect(rows).toHaveLength(seededFeeModel.funds.length);
    expect(rows.map((r) => r.getAttribute("data-fund"))).toEqual(
      seededFeeModel.funds.map((f) => f.id),
    );
    // The PE fund is the costliest and should head the table.
    expect(rows[0].getAttribute("data-fund")).toBe("fee-private-equity");
  });

  it("shows the blended expense ratio as a percentage", () => {
    render(<FeesPage />);
    const expected = `${(seededFeeModel.kpis.blendedRate * 100).toFixed(2)}%`;
    expect(
      within(screen.getByTestId("kpi-blended-rate")).getByText(expected),
    ).toBeInTheDocument();
  });

  it("renders from a custom model prop", () => {
    const model = {
      ...seededFeeModel,
      funds: [seededFeeModel.funds[0]],
    };
    render(<FeesPage model={model} />);
    expect(screen.getAllByTestId("fees-row")).toHaveLength(1);
  });
});
