import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Money } from "@/lib/money";

import RiskCockpitPage, { RiskCockpitView } from "./RiskCockpitPage";
import { formatMoneyCompact, formatPct } from "./format";

describe("format helpers", () => {
  it("formats fractions as percentages with one decimal", () => {
    expect(formatPct(0.3422)).toBe("34.2%");
    expect(formatPct(0.6)).toBe("60.0%");
    expect(formatPct(0.052508)).toBe("5.3%");
  });

  it("formats money compactly without floating-point drift", () => {
    expect(formatMoneyCompact(Money.of("31792500", "USD"))).toBe("$31.79M");
    expect(formatMoneyCompact(Money.of("10880000", "USD"))).toBe("$10.88M");
    expect(formatMoneyCompact(Money.of("150000", "USD"))).toBe("$150K");
  });
});

describe("RiskCockpitPage", () => {
  it("renders the page heading and back link", () => {
    render(<RiskCockpitPage />);
    expect(
      screen.getByRole("heading", { name: /risk-limits cockpit/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /back to dashboard/i }),
    ).toHaveAttribute("href", "#/");
  });
});

describe("RiskCockpitView", () => {
  it("shows the look-through total and top concentration", () => {
    render(<RiskCockpitView />);
    // Total look-through value of the fixture book.
    expect(screen.getAllByText("$31.79M").length).toBeGreaterThan(0);
    // Real estate is the most concentrated class at 34.2%.
    const banner = screen.getByTestId("risk-status-banner");
    expect(banner).toHaveAttribute("data-compliant", "false");
  });

  it("renders one concentration bar per look-through asset class, weight-desc", () => {
    render(<RiskCockpitView />);
    const rows = screen.getAllByTestId("risk-conc-row");
    expect(rows).toHaveLength(6);
    // First row is the most concentrated: real estate.
    expect(rows[0]).toHaveAttribute("data-asset-class", "real_estate");
    expect(rows[0]).toHaveAttribute("data-breached", "true");
  });

  it("marks the breached concentration caps and leaves compliant ones unmarked", () => {
    render(<RiskCockpitView />);
    const re = screen
      .getAllByTestId("risk-conc-row")
      .find((r) => r.getAttribute("data-asset-class") === "real_estate")!;
    expect(re).toHaveAttribute("data-breached", "true");
    expect(within(re).getByTestId("risk-conc-limit-marker")).toBeInTheDocument();

    const equity = screen
      .getAllByTestId("risk-conc-row")
      .find((r) => r.getAttribute("data-asset-class") === "equity")!;
    expect(equity).toHaveAttribute("data-breached", "false");
  });

  it("lists exactly the four breaches with a critical one first", () => {
    render(<RiskCockpitView />);
    const rows = screen.getAllByTestId("risk-breach-row");
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveAttribute("data-severity", "critical");
    expect(rows[0]).toHaveAttribute("data-limit-id", "conc-real-estate");
  });

  it("renders the three liquidity tiers summing to view", () => {
    render(<RiskCockpitView />);
    const tiers = screen.getAllByTestId("risk-liquidity-row");
    expect(tiers.map((t) => t.getAttribute("data-tier"))).toEqual([
      "liquid",
      "semi_liquid",
      "illiquid",
    ]);
  });

  it("shows the risk-metrics panel with volatility, drawdown and Sharpe", () => {
    render(<RiskCockpitView />);
    const card = screen.getByTestId("risk-metrics-card");
    expect(within(card).getByText(/Volatility \(ann\.\)/i)).toBeInTheDocument();
    expect(within(card).getByText(/Max drawdown/i)).toBeInTheDocument();
    expect(within(card).getByText(/Sharpe ratio/i)).toBeInTheDocument();
    // Sharpe ratio of the fixture series ≈ 1.29.
    expect(within(card).getByText("1.29")).toBeInTheDocument();
  });

  it("re-consolidates and clears breaches when reporting from a sub-entity", () => {
    render(<RiskCockpitView />);
    const select = screen.getByTestId("risk-root-select");
    // Report from Harbor (real-estate only): 100% real estate, but the
    // single-class book is all semi-liquid → liquidity floor + RE cap breach.
    fireEvent.change(select, { target: { value: "harbor" } });
    const rows = screen.getAllByTestId("risk-conc-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveAttribute("data-asset-class", "real_estate");
  });
});
