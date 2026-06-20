import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { FACTOR_KEYS } from "@/lib/factors";

import FactorAttributionPage from "./FactorAttributionPage";

describe("FactorAttributionPage", () => {
  it("renders the heading and the four headline KPIs", () => {
    render(<FactorAttributionPage />);
    expect(
      screen.getByRole("heading", { name: /factor & style attribution/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("kpi-rsquared")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-alpha")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-factor-return")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-mean-return")).toBeInTheDocument();
  });

  it("draws one beta bar per factor", () => {
    render(<FactorAttributionPage />);
    const chart = screen.getByTestId("factor-betas-chart");
    expect(within(chart).getAllByTestId("beta-row")).toHaveLength(
      FACTOR_KEYS.length,
    );
  });

  it("draws a contribution bar for alpha, each factor and the total", () => {
    render(<FactorAttributionPage />);
    const chart = screen.getByTestId("contribution-chart");
    expect(within(chart).getAllByTestId("contrib-factor")).toHaveLength(
      FACTOR_KEYS.length,
    );
    expect(within(chart).getByTestId("contrib-alpha")).toBeInTheDocument();
    expect(within(chart).getByTestId("contrib-total")).toBeInTheDocument();
  });

  it("renders a detail table with one row per factor plus alpha", () => {
    render(<FactorAttributionPage />);
    const table = screen.getByTestId("factors-table");
    expect(within(table).getAllByTestId("factor-row")).toHaveLength(
      FACTOR_KEYS.length,
    );
    expect(within(table).getByTestId("factor-row-alpha")).toBeInTheDocument();
    expect(screen.getByTestId("factors-total-value")).toBeInTheDocument();
  });

  it("switches the regressed book when the toggle is clicked", async () => {
    const user = userEvent.setup();
    render(<FactorAttributionPage />);

    const before = screen.getByTestId("kpi-rsquared").textContent;

    const synthetic = screen
      .getAllByTestId("book-select")
      .find((b) => b.getAttribute("data-book") === "synthetic");
    expect(synthetic).toBeDefined();
    await user.click(synthetic!);
    expect(synthetic).toHaveAttribute("data-selected", "true");

    // The clean synthetic book is a perfect fit ⇒ R² shows 100.0%.
    expect(screen.getByTestId("kpi-rsquared")).toHaveTextContent("100.0%");
    expect(screen.getByTestId("kpi-rsquared").textContent).not.toBe(before);
  });

  it("links back to the dashboard", () => {
    render(<FactorAttributionPage />);
    expect(screen.getByTestId("factors-back")).toHaveAttribute("href", "#/");
  });
});
