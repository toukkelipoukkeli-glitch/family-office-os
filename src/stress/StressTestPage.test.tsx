import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { HISTORICAL_SCENARIOS } from "@/lib/stress";

import StressTestPage from "./StressTestPage";

describe("StressTestPage", () => {
  it("renders the heading and the four headline KPIs", () => {
    render(<StressTestPage />);
    expect(
      screen.getByRole("heading", { name: /historical stress tests/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("kpi-networth")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-worst")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-worst-loss")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-episodes")).toBeInTheDocument();
  });

  it("draws a before/after bar group per historical episode", () => {
    render(<StressTestPage />);
    const chart = screen.getByTestId("before-after-chart");
    expect(chart).toBeInTheDocument();
    expect(chart).toHaveAttribute(
      "data-scenarios",
      String(HISTORICAL_SCENARIOS.length),
    );
    const groups = within(chart).getAllByTestId("before-after-group");
    expect(groups).toHaveLength(HISTORICAL_SCENARIOS.length);
    // Each group has both a "before" and an "after" bar.
    expect(within(chart).getAllByTestId("ba-bar-before")).toHaveLength(
      HISTORICAL_SCENARIOS.length,
    );
    expect(within(chart).getAllByTestId("ba-bar-after")).toHaveLength(
      HISTORICAL_SCENARIOS.length,
    );
  });

  it("lists every episode worst-first and defaults the detail to the worst", () => {
    render(<StressTestPage />);
    const list = screen.getByTestId("stress-list");
    const buttons = within(list).getAllByTestId("stress-select");
    expect(buttons).toHaveLength(HISTORICAL_SCENARIOS.length);
    // Worst (GFC) is first and selected by default.
    expect(buttons[0]).toHaveAttribute("data-scenario", "gfc-2008");
    expect(buttons[0]).toHaveAttribute("data-selected", "true");
    expect(screen.getByTestId("stress-detail-title")).toHaveTextContent(
      /global financial crisis/i,
    );
    // The waterfall renders for the worst episode.
    expect(screen.getByTestId("waterfall-chart")).toHaveAttribute(
      "data-scenario",
      "gfc-2008",
    );
  });

  it("shows provenance: sources, forward stats and a day-zero summary", () => {
    render(<StressTestPage />);
    const sources = screen.getByTestId("stress-sources");
    expect(sources).toBeInTheDocument();
    expect(within(sources).getAllByRole("listitem").length).toBeGreaterThan(0);
    expect(sources).toHaveTextContent(/S&P 500/i);
    expect(screen.getByTestId("stress-forward")).toBeInTheDocument();
    expect(screen.getByTestId("stress-summary")).toHaveTextContent(
      /day zero/i,
    );
  });

  it("switches the detail panel when another episode is selected", async () => {
    const user = userEvent.setup();
    render(<StressTestPage />);

    const covidBtn = screen
      .getAllByTestId("stress-select")
      .find((b) => b.getAttribute("data-scenario") === "covid-2020");
    expect(covidBtn).toBeDefined();
    await user.click(covidBtn!);

    expect(covidBtn).toHaveAttribute("data-selected", "true");
    expect(screen.getByTestId("waterfall-chart")).toHaveAttribute(
      "data-scenario",
      "covid-2020",
    );
    expect(screen.getByTestId("stress-detail-title")).toHaveTextContent(
      /covid/i,
    );
    expect(screen.getByTestId("stress-sources")).toHaveTextContent(
      /black thursday/i,
    );
  });

  it("links back to the dashboard", () => {
    render(<StressTestPage />);
    expect(screen.getByTestId("stress-back")).toHaveAttribute("href", "#/");
  });
});
