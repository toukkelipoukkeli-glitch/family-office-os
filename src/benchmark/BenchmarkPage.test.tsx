import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { PORTFOLIO_RETURNS } from "@/lib/benchmark";

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

  it("shows the excess return computed from the default policy fixture", () => {
    render(<BenchmarkPage />);
    // policy 55/35/10 vs portfolio -> +6.88% excess (0.068751 rounded)
    expect(screen.getByTestId("kpi-excess")).toHaveTextContent("+6.88%");
    expect(screen.getByTestId("table-excess")).toHaveTextContent("+6.88%");
  });

  it("draws the growth overlay with both series", () => {
    render(<BenchmarkPage />);
    const chart = screen.getByTestId("growth-chart");
    const svg = within(chart).getByTestId("line-chart");
    expect(svg).toHaveAttribute("data-series", "2");
  });

  it("renders one table row per period", () => {
    render(<BenchmarkPage />);
    const table = screen.getByTestId("benchmark-table");
    expect(within(table).getAllByTestId("table-row")).toHaveLength(
      PORTFOLIO_RETURNS.length,
    );
  });

  it("switches benchmark when a selector is clicked, changing the excess", async () => {
    const user = userEvent.setup();
    render(<BenchmarkPage />);

    const policyExcess = screen.getByTestId("kpi-excess").textContent;

    const bondOnly = screen
      .getAllByTestId("benchmark-select")
      .find((b) => b.getAttribute("data-benchmark") === "broad-bond-only");
    expect(bondOnly).toBeDefined();
    await user.click(bondOnly!);
    expect(bondOnly).toHaveAttribute("data-selected", "true");

    // Beating a 100% bond benchmark is a different (and larger) excess than the
    // blended policy, so the headline must change.
    expect(screen.getByTestId("kpi-excess").textContent).not.toBe(policyExcess);
  });

  it("links back to the dashboard", () => {
    render(<BenchmarkPage />);
    expect(screen.getByTestId("benchmark-back")).toHaveAttribute("href", "#/");
  });

  it("throws if asked to render with no benchmarks and no precomputed view", () => {
    // Guards against an empty selectable set crashing on benchmarks[0] access.
    expect(() => render(<BenchmarkPage benchmarks={[]} />)).toThrow();
  });
});
