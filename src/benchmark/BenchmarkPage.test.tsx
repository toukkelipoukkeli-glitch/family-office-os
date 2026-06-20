import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { FAMILY_PORTFOLIO } from "@/lib/benchmark";

import BenchmarkPage from "./BenchmarkPage";

describe("BenchmarkPage", () => {
  it("renders the heading and the four headline KPIs", () => {
    render(<BenchmarkPage />);
    expect(
      screen.getByRole("heading", { name: /benchmark & relative performance/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("kpi-excess")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-tracking-error")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-info-ratio")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-beta")).toBeInTheDocument();
  });

  it("shows the relative-performance figures computed from the policy fixture", () => {
    render(<BenchmarkPage />);
    // Default benchmark is the bespoke policy mix.
    expect(screen.getByTestId("kpi-excess")).toHaveTextContent("+3.88%");
    expect(screen.getByTestId("kpi-tracking-error")).toHaveTextContent("2.62%");
    expect(screen.getByTestId("kpi-info-ratio")).toHaveTextContent("+1.38");
    expect(screen.getByTestId("kpi-beta")).toHaveTextContent("1.63");
  });

  it("draws both equity curves on the growth chart", () => {
    render(<BenchmarkPage />);
    const chart = screen.getByTestId("growth-chart");
    expect(chart).toBeInTheDocument();
    expect(chart).toHaveAttribute("data-series", "2");
    expect(within(chart).getAllByTestId("line-series")).toHaveLength(2);
  });

  it("draws one excess bar per period", () => {
    render(<BenchmarkPage />);
    const strip = screen.getByTestId("excess-return-chart");
    expect(strip).toHaveAttribute("data-periods", "12");
    expect(within(strip).getAllByTestId("excess-bar")).toHaveLength(
      FAMILY_PORTFOLIO.returns.length,
    );
  });

  it("renders a detail table whose footer reconciles to the excess return", () => {
    render(<BenchmarkPage />);
    const table = screen.getByTestId("benchmark-table");
    expect(within(table).getAllByTestId("table-row")).toHaveLength(12);
    expect(screen.getByTestId("table-excess")).toHaveTextContent("+3.88%");
  });

  it("recomputes the metrics when the benchmark is switched", async () => {
    const user = userEvent.setup();
    render(<BenchmarkPage />);

    const bonds = screen
      .getAllByTestId("benchmark-select")
      .find((b) => b.getAttribute("data-benchmark") === "bonds");
    expect(bonds).toBeDefined();
    await user.click(bonds!);
    expect(bonds).toHaveAttribute("data-selected", "true");

    // Against bonds the portfolio's excess and beta change sign/magnitude.
    expect(screen.getByTestId("kpi-excess")).toHaveTextContent("+7.98%");
    expect(screen.getByTestId("kpi-beta")).toHaveTextContent("-3.55");
    expect(screen.getByTestId("table-excess")).toHaveTextContent("+7.98%");
  });

  it("links back to the dashboard", () => {
    render(<BenchmarkPage />);
    expect(screen.getByTestId("benchmark-back")).toHaveAttribute("href", "#/");
  });
});
