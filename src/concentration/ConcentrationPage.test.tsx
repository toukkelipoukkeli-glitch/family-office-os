import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Money } from "@/lib/money";

import ConcentrationPage, { ConcentrationView } from "./ConcentrationPage";
import { formatMoneyCompact, formatPct } from "./format";

describe("format helpers", () => {
  it("formats fractions as percentages", () => {
    expect(formatPct(0.1675)).toBe("16.8%");
    expect(formatPct(0.1, 0)).toBe("10%");
  });

  it("formats money compactly without floating-point drift", () => {
    expect(formatMoneyCompact(Money.of("16750000", "USD"))).toBe("$16.75M");
    expect(formatMoneyCompact(Money.of("100000000", "USD"))).toBe("$100M");
  });
});

describe("ConcentrationPage", () => {
  it("renders the page heading and back link", () => {
    render(<ConcentrationPage />);
    expect(
      screen.getByRole("heading", { name: /concentration & single-name risk/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /back to dashboard/i }),
    ).toHaveAttribute("href", "#/");
  });
});

describe("ConcentrationView", () => {
  it("shows net worth and the top single name with look-through", () => {
    render(<ConcentrationView />);
    // Net worth of the sample book.
    expect(screen.getAllByText("$100M").length).toBeGreaterThan(0);
    // Apple is the top single name at 16.8% after look-through.
    const top = screen.getByTestId("conc-stat-topname");
    expect(within(top).getByText("16.8%")).toBeInTheDocument();
    expect(within(top).getByText(/Apple Inc\./)).toBeInTheDocument();
  });

  it("flags a single name over the concentration limit", () => {
    render(<ConcentrationView />);
    const banner = screen.getByTestId("conc-status-banner");
    expect(banner).toHaveAttribute("data-breached", "true");
    // Apple's row is breached (16.8% > 10%).
    const aapl = screen
      .getAllByTestId("conc-name-row")
      .find((r) => r.getAttribute("data-issuer-id") === "issuer-aapl")!;
    expect(aapl).toHaveAttribute("data-breached", "true");
  });

  it("renders single-name bars in descending order, residuals marked", () => {
    render(<ConcentrationView />);
    const rows = screen.getAllByTestId("conc-name-row");
    expect(rows.length).toBeGreaterThan(0);
    // The first *real* (non-residual) name is the most concentrated: Apple.
    const firstReal = rows.find(
      (r) => r.getAttribute("data-residual") === "false",
    )!;
    expect(firstReal).toHaveAttribute("data-issuer-id", "issuer-aapl");
    // At least one residual-diversified bucket from a fund tail.
    expect(
      rows.some((r) => r.getAttribute("data-residual") === "true"),
    ).toBe(true);
  });

  it("splits a name's bar into direct vs fund (look-through) segments", () => {
    render(<ConcentrationView />);
    const aapl = screen
      .getAllByTestId("conc-name-row")
      .find((r) => r.getAttribute("data-issuer-id") === "issuer-aapl")!;
    expect(within(aapl).getByTestId("conc-name-fill-direct")).toBeInTheDocument();
    expect(within(aapl).getByTestId("conc-name-fill-fund")).toBeInTheDocument();
    // The "look-through" tag is present because Apple is partly inside funds.
    expect(within(aapl).getByText(/look-through/i)).toBeInTheDocument();
  });

  it("shows the illiquid percentage of net worth", () => {
    render(<ConcentrationView />);
    const illiquid = screen.getByTestId("conc-stat-illiquid");
    // 24M of 100M illiquid.
    expect(within(illiquid).getByText("24.0%")).toBeInTheDocument();
  });

  it("renders the sector donut and legend", () => {
    render(<ConcentrationView />);
    expect(screen.getByTestId("donut-chart")).toBeInTheDocument();
    const rows = screen.getAllByTestId("conc-sector-row");
    expect(rows.length).toBeGreaterThan(0);
  });

  it("renders three liquidity tiers in canonical order", () => {
    render(<ConcentrationView />);
    const tiers = screen.getAllByTestId("conc-liquidity-row");
    expect(tiers.map((t) => t.getAttribute("data-tier"))).toEqual([
      "liquid",
      "semi_liquid",
      "illiquid",
    ]);
  });

  it("re-analyses when the book is switched to the diversified sleeve", () => {
    render(<ConcentrationView />);
    fireEvent.change(screen.getByTestId("conc-book-select"), {
      target: { value: "diversified-book" },
    });
    // Diversified book: no name over the 10% limit, banner clears.
    const banner = screen.getByTestId("conc-status-banner");
    expect(banner).toHaveAttribute("data-breached", "false");
    // Top single name is below 5%.
    const top = screen.getByTestId("conc-stat-topname");
    // Apple at 4% in the diversified fund.
    expect(within(top).getByText("4.0%")).toBeInTheDocument();
  });
});
