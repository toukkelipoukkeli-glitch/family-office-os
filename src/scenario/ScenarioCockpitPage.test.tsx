import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { NAMED_SCENARIOS } from "@/lib/scenario/named";

import ScenarioCockpit from "./ScenarioCockpitPage";

describe("ScenarioCockpit", () => {
  it("renders the heading and the four headline KPIs", () => {
    render(<ScenarioCockpit />);
    expect(
      screen.getByRole("heading", { name: /scenario cockpit/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("kpi-networth")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-expected")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-var")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-ploss")).toBeInTheDocument();
  });

  it("draws the projection fan with median + both percentile bands", () => {
    render(<ScenarioCockpit />);
    const fan = screen.getByTestId("fan-chart");
    expect(fan).toBeInTheDocument();
    expect(within(fan).getByTestId("fan-median")).toBeInTheDocument();
    expect(within(fan).getByTestId("fan-band-50")).toBeInTheDocument();
    expect(within(fan).getByTestId("fan-band-90")).toBeInTheDocument();
    // 6 horizon points (t0 + 5 years).
    expect(fan).toHaveAttribute("data-points", "6");
  });

  it("draws a tornado bar per named scenario, worst first", () => {
    render(<ScenarioCockpit />);
    const tornado = screen.getByTestId("tornado-chart");
    const rows = within(tornado).getAllByTestId("tornado-row");
    expect(rows).toHaveLength(NAMED_SCENARIOS.length);
    // The first bar is the most damaging (most negative mean delta).
    const deltas = rows.map((r) =>
      Number(r.getAttribute("data-mean-delta")),
    );
    const sorted = [...deltas].sort((a, b) => a - b);
    expect(deltas).toEqual(sorted);
    expect(deltas[0]).toBeLessThan(0);
  });

  it("defaults the waterfall to the worst scenario and shows its rationale", () => {
    render(<ScenarioCockpit />);
    const wf = screen.getByTestId("waterfall-chart");
    // market-correction is the worst with this book.
    expect(wf).toHaveAttribute("data-scenario", "market-correction");
    expect(screen.getByTestId("waterfall-title")).toHaveTextContent(
      /market correction/i,
    );
    expect(screen.getByTestId("scenario-rationale")).toBeInTheDocument();
    // Initial + steps + shocked columns are present.
    expect(within(wf).getByTestId("wf-col-initial")).toBeInTheDocument();
    expect(within(wf).getByTestId("wf-col-shocked")).toBeInTheDocument();
  });

  it("switches the waterfall when another scenario is selected", async () => {
    const user = userEvent.setup();
    render(<ScenarioCockpit />);

    const droughtBtn = screen
      .getAllByTestId("scenario-select")
      .find((b) => b.getAttribute("data-scenario") === "drought");
    expect(droughtBtn).toBeDefined();
    await user.click(droughtBtn!);

    expect(droughtBtn).toHaveAttribute("data-selected", "true");
    expect(screen.getByTestId("waterfall-chart")).toHaveAttribute(
      "data-scenario",
      "drought",
    );
    expect(screen.getByTestId("waterfall-title")).toHaveTextContent(/drought/i);
    // Drought reprices vineyard/forest/wine — those labels appear as columns.
    const wf = screen.getByTestId("waterfall-chart");
    expect(wf.querySelector('[data-testid="wf-col-step-0"]')).not.toBeNull();
  });

  it("summarizes the day-zero move from today to shocked net worth", () => {
    render(<ScenarioCockpit />);
    const summary = screen.getByTestId("waterfall-summary");
    expect(summary).toHaveTextContent(/Net worth moves from/i);
    expect(summary).toHaveTextContent(/day zero/i);
  });

  it("links back to the dashboard", () => {
    render(<ScenarioCockpit />);
    expect(screen.getByTestId("cockpit-back")).toHaveAttribute("href", "#/");
  });

  // --- Deep-linkable sub-view state (m13) --------------------------------

  it("selects the scenario named in the hash deep link on mount", () => {
    window.location.hash = "#/scenarios?s=drought";
    render(<ScenarioCockpit />);
    const selected = screen
      .getAllByTestId("scenario-select")
      .find((b) => b.getAttribute("data-scenario") === "drought");
    expect(selected).toHaveAttribute("data-selected", "true");
    expect(screen.getByTestId("waterfall-title")).toHaveTextContent(/drought/i);
  });

  it("writes the selected scenario to the hash so it is shareable", async () => {
    window.location.hash = "#/scenarios";
    const user = userEvent.setup();
    render(<ScenarioCockpit />);
    const droughtBtn = screen
      .getAllByTestId("scenario-select")
      .find((b) => b.getAttribute("data-scenario") === "drought");
    await user.click(droughtBtn!);
    expect(window.location.hash).toBe("#/scenarios?s=drought");
  });

  it("falls back to the worst scenario for an unknown deep-link id", () => {
    window.location.hash = "#/scenarios?s=not-a-real-scenario";
    render(<ScenarioCockpit />);
    // The first (worst) tornado bar is selected rather than a missing scenario.
    const buttons = screen.getAllByTestId("scenario-select");
    expect(buttons[0]).toHaveAttribute("data-selected", "true");
  });
});
