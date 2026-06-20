import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { seededTaxInputs, seededSchedule } from "@/lib/taxtimeline";

import TaxTimelinePage from "./TaxTimelinePage";

describe("TaxTimelinePage", () => {
  it("renders the heading and the four headline KPIs", () => {
    render(<TaxTimelinePage />);
    expect(
      screen.getByRole("heading", { name: /tax timeline/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("kpi-tax")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-harvest")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-charitable")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-deadlines")).toBeInTheDocument();
  });

  it("shows the seeded composed headline numbers", () => {
    render(<TaxTimelinePage />);
    expect(screen.getByTestId("kpi-tax")).toHaveTextContent(/\$250\.3K|\$250K/);
    expect(screen.getByTestId("kpi-harvest")).toHaveTextContent("$21K");
    expect(screen.getByTestId("kpi-deadlines")).toHaveTextContent("7");
  });

  it("renders every sequenced event in date order", () => {
    render(<TaxTimelinePage />);
    const rows = within(screen.getByTestId("event-list")).getAllByTestId(
      "event-row",
    );
    expect(rows).toHaveLength(14);
    const dates = rows.map((r) => r.getAttribute("data-date"));
    const sorted = [...dates].sort();
    expect(dates).toEqual(sorted);
    // First event is the Jan estate review; last is the following-April filing.
    expect(rows[0]).toHaveAttribute("data-id", "estate-review");
    expect(rows[rows.length - 1]).toHaveAttribute("data-id", "filing-return");
  });

  it("draws a year track with a row per populated category", () => {
    render(<TaxTimelinePage />);
    const track = screen.getByTestId("year-track");
    const rows = within(track).getAllByTestId("track-row");
    // All five categories are populated in the seeded fixture.
    expect(rows).toHaveLength(5);
    // Wash-sale windows render as a band.
    expect(within(track).getAllByTestId("track-window").length).toBeGreaterThan(
      0,
    );
  });

  it("filters the event list when a category chip is clicked", () => {
    render(<TaxTimelinePage />);
    fireEvent.click(screen.getByTestId("filter-charitable"));
    const rows = within(screen.getByTestId("event-list")).getAllByTestId(
      "event-row",
    );
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r).toHaveAttribute("data-category", "charitable");
    }
    // Toggling the same chip off restores the full list.
    fireEvent.click(screen.getByTestId("filter-charitable"));
    expect(
      within(screen.getByTestId("event-list")).getAllByTestId("event-row"),
    ).toHaveLength(14);
  });

  it("degrades gracefully with a tax-only timeline", () => {
    render(
      <TaxTimelinePage
        inputs={{
          year: 2026,
          taxEstimate: { inputs: seededTaxInputs, schedule: seededSchedule },
        }}
      />,
    );
    const rows = within(screen.getByTestId("event-list")).getAllByTestId(
      "event-row",
    );
    // 4 quarterly payments + 1 filing deadline.
    expect(rows).toHaveLength(5);
    // The harvest filter chip is disabled (no harvest events).
    expect(screen.getByTestId("filter-harvest")).toBeDisabled();
  });

  it("links back to the dashboard", () => {
    render(<TaxTimelinePage />);
    expect(screen.getByTestId("timeline-back")).toHaveAttribute("href", "#/");
  });
});
