import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ConsolidationView } from "./ConsolidationPage";

describe("ConsolidationView", () => {
  it("renders the four reconciliation KPIs", () => {
    render(<ConsolidationView />);
    expect(screen.getByTestId("consolidation-view")).toBeInTheDocument();
    expect(screen.getByTestId("cons-kpi-gross-value")).toHaveTextContent(
      "$46M",
    );
    expect(
      screen.getByTestId("cons-kpi-eliminations-value"),
    ).toHaveTextContent("−$4.9M");
    expect(screen.getByTestId("cons-kpi-minority-value")).toHaveTextContent(
      "−$12.2M",
    );
    expect(
      screen.getByTestId("cons-kpi-consolidated-value"),
    ).toHaveTextContent("$28.9M");
  });

  it("draws the consolidation bridge and the owned-NAV donut", () => {
    render(<ConsolidationView />);
    expect(screen.getByTestId("cons-bridge-chart")).toBeInTheDocument();
    // Four bridge bars: gross, eliminations, minority, consolidated.
    const bars = within(
      screen.getByTestId("cons-bridge-chart"),
    ).getAllByTestId("bar");
    expect(bars).toHaveLength(4);
    expect(screen.getByTestId("cons-donut")).toBeInTheDocument();
  });

  it("lists every entity with its owned NAV and minority interest", () => {
    render(<ConsolidationView />);
    const rows = screen.getAllByTestId("cons-entity-row");
    expect(rows).toHaveLength(8);
    // Sorted by owned NAV descending — beacon (9.6M) is the largest.
    expect(rows[0]).toHaveAttribute("data-entity-id", "beacon");
    const beacon = rows[0];
    expect(within(beacon).getByText("$9.6M")).toBeInTheDocument();
    expect(within(beacon).getByText("$6.4M")).toBeInTheDocument(); // minority
  });

  it("reconciles the entity table footer to gross NAV and minority interest", () => {
    render(<ConsolidationView />);
    expect(screen.getByTestId("cons-entities-gross")).toHaveTextContent("$46M");
    expect(screen.getByTestId("cons-entities-minority")).toHaveTextContent(
      "$12.2M",
    );
  });

  it("lists each intercompany elimination and totals them", () => {
    render(<ConsolidationView />);
    const rows = screen.getAllByTestId("cons-elim-row");
    expect(rows).toHaveLength(5);
    // Largest elimination first: holdco -> atlas, 1.8M.
    expect(rows[0]).toHaveAttribute("data-holder-id", "holdco");
    expect(rows[0]).toHaveAttribute("data-investee-id", "atlas");
    expect(screen.getByTestId("cons-elim-total")).toHaveTextContent("−$4.9M");
  });

  it("re-consolidates when the reporting root changes", async () => {
    const user = userEvent.setup();
    render(<ConsolidationView />);

    // Consolidating up to the holdco drops the trust's own 1.5M NAV from gross
    // and removes the trust→holdco elimination.
    await user.selectOptions(
      screen.getByTestId("cons-root-select"),
      "holdco",
    );
    // Gross NAV excludes the trust now: 46M − 1.5M = 44.5M.
    expect(screen.getByTestId("cons-kpi-gross-value")).toHaveTextContent(
      "$44.5M",
    );
    // Only 4 intercompany stakes remain (the trust→holdco one is gone).
    expect(screen.getAllByTestId("cons-elim-row")).toHaveLength(4);
    expect(screen.getByTestId("cons-kpi-eliminations-value")).toHaveTextContent(
      "−$3.7M",
    );
  });
});
