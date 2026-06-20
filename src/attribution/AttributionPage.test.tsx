import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { FAMILY_OFFICE_ATTRIBUTION } from "@/lib/attribution";

import AttributionPage from "./AttributionPage";

describe("AttributionPage", () => {
  it("renders the heading and the four headline KPIs", () => {
    render(<AttributionPage />);
    expect(
      screen.getByRole("heading", { name: /performance attribution/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("kpi-portfolio")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-benchmark")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-active")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-allocation")).toBeInTheDocument();
  });

  it("shows the active return computed from the fixture", () => {
    render(<AttributionPage />);
    // active return = +0.83% (0.00825 rounded to 2dp)
    expect(screen.getByTestId("kpi-active")).toHaveTextContent("+0.83%");
  });

  it("draws the active-return bridge with benchmark→portfolio columns", () => {
    render(<AttributionPage />);
    const bridge = screen.getByTestId("attribution-bridge");
    expect(bridge).toBeInTheDocument();
    expect(within(bridge).getByTestId("bridge-col-benchmark")).toBeInTheDocument();
    expect(within(bridge).getByTestId("bridge-col-allocation")).toBeInTheDocument();
    expect(within(bridge).getByTestId("bridge-col-selection")).toBeInTheDocument();
    expect(
      within(bridge).getByTestId("bridge-col-interaction"),
    ).toBeInTheDocument();
    expect(within(bridge).getByTestId("bridge-col-portfolio")).toBeInTheDocument();
  });

  it("draws one effect row per segment with three sub-bars each", () => {
    render(<AttributionPage />);
    const chart = screen.getByTestId("segment-effects-chart");
    const rows = within(chart).getAllByTestId("effect-row");
    expect(rows).toHaveLength(FAMILY_OFFICE_ATTRIBUTION.segments.length);
    // each row has allocation/selection/interaction bars
    for (const row of rows) {
      expect(within(row).getAllByTestId("effect-bar")).toHaveLength(3);
    }
  });

  it("renders a detail table whose footer totals reconcile to active return", () => {
    render(<AttributionPage />);
    const table = screen.getByTestId("attribution-table");
    expect(within(table).getAllByTestId("table-row")).toHaveLength(
      FAMILY_OFFICE_ATTRIBUTION.segments.length,
    );
    // footer "active" cell shows the reconciled total effect (+0.83%)
    expect(screen.getByTestId("table-active")).toHaveTextContent("+0.83%");
  });

  it("switches the convention when the method toggle is clicked", async () => {
    const user = userEvent.setup();
    render(<AttributionPage />);

    const bhb = screen
      .getAllByTestId("method-select")
      .find((b) => b.getAttribute("data-method") === "BHB");
    expect(bhb).toBeDefined();
    await user.click(bhb!);
    expect(bhb).toHaveAttribute("data-selected", "true");
    // Active return is convention-independent and must stay reconciled.
    expect(screen.getByTestId("kpi-active")).toHaveTextContent("+0.83%");
    expect(screen.getByTestId("table-active")).toHaveTextContent("+0.83%");
  });

  it("links back to the dashboard", () => {
    render(<AttributionPage />);
    expect(screen.getByTestId("attribution-back")).toHaveAttribute(
      "href",
      "#/",
    );
  });
});
