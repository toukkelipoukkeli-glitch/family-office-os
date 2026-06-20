import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  buildLiquidityModel,
  seededLiquidityInput,
  seededLiquidityModel,
} from "@/lib/liquidity";

import LiquidityPage from "./LiquidityPage";

describe("LiquidityPage", () => {
  it("renders the heading and the six headline KPIs", () => {
    render(<LiquidityPage />);
    expect(
      screen.getByRole("heading", { name: /liquidity & capital-call coverage/i }),
    ).toBeInTheDocument();
    for (const id of [
      "kpi-liquidity",
      "kpi-obligations",
      "kpi-calls",
      "kpi-coverage",
      "kpi-worst",
      "kpi-shortfall",
    ]) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
  });

  it("draws the coverage line chart with two series", () => {
    render(<LiquidityPage />);
    const chart = screen.getByTestId("line-chart");
    expect(chart).toBeInTheDocument();
    expect(screen.getByTestId("liquidity-chart-summary")).toBeInTheDocument();
  });

  it("draws the reserve-tier bar chart with one bar per tier", () => {
    render(<LiquidityPage />);
    const bar = screen.getByTestId("bar-chart");
    expect(bar).toHaveAttribute(
      "data-bars",
      String(seededLiquidityModel.reserves.length),
    );
  });

  it("lists every reserve tier in the breakdown table", () => {
    render(<LiquidityPage />);
    const rows = screen.getAllByTestId("liquidity-reserve-row");
    expect(rows).toHaveLength(seededLiquidityModel.reserves.length);
    expect(rows[0].getAttribute("data-tier")).toBe("cash");
  });

  it("lists each obligation-bearing month in the coverage table", () => {
    render(<LiquidityPage />);
    const obligationMonths = seededLiquidityModel.months.filter(
      (m) => m.obligation > 0,
    );
    const rows = screen.getAllByTestId("liquidity-row");
    expect(rows).toHaveLength(obligationMonths.length);
    expect(rows[0].getAttribute("data-period")).toBe("2024-07");
  });

  it("shows the fully-covered banner for the solvent seeded family", () => {
    expect(seededLiquidityModel.kpis.firstShortfallPeriod).toBeNull();
    render(<LiquidityPage />);
    expect(screen.getByTestId("liquidity-covered-banner")).toBeInTheDocument();
    expect(
      screen.queryByTestId("liquidity-shortfall-banner"),
    ).not.toBeInTheDocument();
  });

  it("shows the shortfall banner when reserves cannot fund the calls", () => {
    const model = buildLiquidityModel({
      input: {
        ...seededLiquidityInput,
        reserves: [
          { id: "cash", label: "Operating cash", balance: "500000", haircut: "0" },
        ],
      },
    });
    expect(model.kpis.firstShortfallPeriod).not.toBeNull();
    render(<LiquidityPage model={model} />);
    const banner = screen.getByTestId("liquidity-shortfall-banner");
    expect(banner).toBeInTheDocument();
    expect(
      screen.queryByTestId("liquidity-covered-banner"),
    ).not.toBeInTheDocument();
  });

  it("renders the deployable-liquidity KPI from the seeded model", () => {
    render(<LiquidityPage />);
    // Compact currency for the 9,190,000 deployable reserves.
    expect(screen.getByTestId("kpi-liquidity")).toHaveTextContent(/\$9(\.2)?M/);
  });

  it("renders the coverage ratio as a multiple", () => {
    render(<LiquidityPage />);
    // 9,190,000 / 4,560,000 ≈ 2.02×.
    expect(screen.getByTestId("kpi-coverage")).toHaveTextContent(/2\.02×/);
  });

  it("renders from a custom single-month model prop", () => {
    const model = buildLiquidityModel({
      input: {
        horizonMonths: 1,
        currency: "USD",
        startPeriod: "2024-01",
        reserves: [{ id: "cash", label: "Cash", balance: "1000" }],
        obligations: [
          { id: "c", label: "Call", category: "pe-call", amount: "100", month: 0 },
        ],
      },
    });
    render(<LiquidityPage model={model} />);
    expect(screen.getAllByTestId("liquidity-row")).toHaveLength(1);
  });
});
