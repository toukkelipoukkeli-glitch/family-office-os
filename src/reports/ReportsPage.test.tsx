import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { seededBoardReport, DEFAULT_REPORT_DATE } from "@/lib/reporting";

import ReportsPage from "./ReportsPage";

describe("ReportsPage", () => {
  it("renders the board-report heading and the as-of date", () => {
    render(<ReportsPage />);
    expect(
      screen.getByRole("heading", { name: /board report/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("report-as-of")).toHaveTextContent(
      DEFAULT_REPORT_DATE,
    );
  });

  it("renders the full headline KPI strip", () => {
    render(<ReportsPage />);
    const strip = screen.getByTestId("kpi-strip");
    for (const k of seededBoardReport.kpis) {
      const kpi = within(strip).getByTestId(`kpi-${k.key}`);
      expect(kpi).toHaveTextContent(k.display);
    }
  });

  it("draws the net-worth line chart and per-class allocation rows", () => {
    render(<ReportsPage />);
    expect(screen.getByTestId("line-chart")).toBeInTheDocument();
    const rows = screen.getAllByTestId("allocation-row");
    expect(rows).toHaveLength(seededBoardReport.netWorth.byAssetClass.length);
  });

  it("reports IPS compliance status and a breach row per breach", () => {
    render(<ReportsPage />);
    const status = screen.getByTestId("policy-status");
    expect(status).toHaveAttribute(
      "data-compliant",
      String(seededBoardReport.policy.compliant),
    );
    if (!seededBoardReport.policy.compliant) {
      const rows = screen.getAllByTestId("breach-row");
      expect(rows).toHaveLength(seededBoardReport.policy.breachCount);
    }
  });

  it("shows the benchmark, fees and PE stat blocks", () => {
    render(<ReportsPage />);
    expect(screen.getByTestId("benchmark-stats")).toBeInTheDocument();
    expect(screen.getByTestId("fees-stats")).toBeInTheDocument();
    expect(screen.getByTestId("pe-stats")).toBeInTheDocument();
    expect(screen.getByTestId("pe-stats")).toHaveTextContent(
      `${seededBoardReport.privateMarkets.tvpi.toFixed(2)}×`,
    );
  });

  it("draws the attribution bar chart with one bar per segment", () => {
    render(<ReportsPage />);
    const bar = screen.getByTestId("bar-chart");
    expect(bar).toHaveAttribute(
      "data-bars",
      String(seededBoardReport.attribution.segments.length),
    );
    expect(screen.getAllByTestId("attribution-row")).toHaveLength(
      seededBoardReport.attribution.segments.length,
    );
  });

  it("toggles the deterministic Markdown export on demand", async () => {
    const user = userEvent.setup();
    render(<ReportsPage />);
    // Hidden by default.
    expect(screen.queryByTestId("export-markdown")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("toggle-export"));
    const pre = screen.getByTestId("export-markdown");
    expect(pre).toBeInTheDocument();
    expect(pre).toHaveTextContent("Board Report");
    expect(pre).toHaveTextContent("Private markets");

    // Toggling again hides it.
    await user.click(screen.getByTestId("toggle-export"));
    expect(screen.queryByTestId("export-markdown")).not.toBeInTheDocument();
  });
});
