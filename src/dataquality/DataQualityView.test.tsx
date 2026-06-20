import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DataQualityView } from "./DataQualityView";

describe("DataQualityView", () => {
  it("renders the headline grade and summary stats from the fixtures", () => {
    render(<DataQualityView />);
    expect(screen.getByTestId("dataquality-view")).toBeInTheDocument();
    // Deterministic fixture grade is B (82/100).
    expect(screen.getByTestId("dq-grade")).toHaveTextContent("B");
    expect(screen.getByTestId("dq-grade")).toHaveTextContent("82");
    expect(screen.getByTestId("dq-stale")).toHaveTextContent("2");
    expect(screen.getByTestId("dq-missing")).toHaveTextContent("1");
  });

  it("draws the freshness bar chart with a status legend", () => {
    render(<DataQualityView />);
    expect(screen.getByTestId("dq-status-card")).toBeInTheDocument();
    expect(screen.getAllByTestId("bar-chart").length).toBeGreaterThanOrEqual(1);
    const legend = screen.getByTestId("dq-status-legend");
    expect(within(legend).getByText("Fresh")).toBeInTheDocument();
    expect(within(legend).getByText("Stale")).toBeInTheDocument();
  });

  it("lists one row per holding, worst-first", () => {
    render(<DataQualityView />);
    const rows = screen.getAllByTestId("dq-row");
    // 14 seeded + 1 stale sculpture + 1 unvalued angel = 16.
    expect(rows).toHaveLength(16);
    // The unvalued angel has the lowest score and sorts first.
    expect(rows[0]).toHaveAttribute("data-holding-id", "hold-equity-angel");
  });

  it("defaults the detail panel to the worst holding and shows its flags", () => {
    render(<DataQualityView />);
    const detail = screen.getByTestId("dq-detail");
    expect(within(detail).getByTestId("dq-detail-name")).toHaveTextContent(
      "SeedCo Angel SAFE",
    );
    expect(within(detail).getByTestId("dq-detail-score")).toHaveTextContent(
      "5/100",
    );
    const flags = within(detail).getByTestId("dq-detail-flags");
    expect(flags).toHaveTextContent(/No valuation on record/i);
  });

  it("drills into a holding when its row is clicked", () => {
    render(<DataQualityView />);
    fireEvent.click(
      screen.getByRole("button", {
        name: /Inspect data quality of Apple Inc\./i,
      }),
    );
    const detail = screen.getByTestId("dq-detail");
    expect(within(detail).getByTestId("dq-detail-name")).toHaveTextContent(
      "Apple Inc.",
    );
    // Apple is a fresh, fully-trusted number.
    expect(detail).toHaveTextContent(/No issues — trusted number\./i);
  });

  it("filters the table by staleness band", () => {
    render(<DataQualityView />);
    // Click the "stale" filter button.
    const staleFilter = screen
      .getAllByTestId("dq-filter")
      .find((b) => b.getAttribute("data-filter") === "stale")!;
    fireEvent.click(staleFilter);
    const rows = screen.getAllByTestId("dq-row");
    // Two stale holdings: the unvalued angel and the overdue bronze.
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r).toHaveAttribute("data-status", "stale");
    }
  });

  it("shows an empty-band message when a filter matches nothing", () => {
    render(<DataQualityView />);
    const agingFilter = screen
      .getAllByTestId("dq-filter")
      .find((b) => b.getAttribute("data-filter") === "aging")!;
    fireEvent.click(agingFilter);
    // No aging holdings in the fixture.
    expect(screen.queryAllByTestId("dq-row")).toHaveLength(0);
    expect(screen.getByTestId("dq-empty")).toBeInTheDocument();
  });
});
