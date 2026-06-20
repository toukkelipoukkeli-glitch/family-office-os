import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ChartFigure } from "./chart-figure";

const COLUMNS = [
  { header: "Region" },
  { header: "Share %", align: "right" as const },
];
const ROWS = [
  ["US", 55],
  ["EU", 25],
  ["APAC", 15],
];

function Chart() {
  return (
    <svg role="img" aria-label="donut chart" data-testid="the-chart" />
  );
}

describe("ChartFigure", () => {
  it("wraps the chart in a figure labelled by its caption", () => {
    render(
      <ChartFigure testId="fig" caption="Exposure by region." columns={COLUMNS} rows={ROWS}>
        <Chart />
      </ChartFigure>,
    );
    const fig = screen.getByTestId("fig");
    expect(fig.tagName.toLowerCase()).toBe("figure");
    // The figure is accessible-named by its visible figcaption.
    expect(
      screen.getByRole("figure", { name: "Exposure by region." }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("the-chart")).toBeInTheDocument();
  });

  it("renders an accessible table mirroring the data with header cells", () => {
    // Use visually-hidden mode so the table is in the a11y tree (toggle mode
    // keeps it `hidden` until opened, which removes its roles).
    render(
      <ChartFigure
        testId="fig"
        caption="Exposure by region."
        columns={COLUMNS}
        rows={ROWS}
        tableMode="visually-hidden"
      >
        <Chart />
      </ChartFigure>,
    );
    const table = screen.getByTestId("fig-table");
    // Column headers.
    const colHeaders = within(table).getAllByRole("columnheader");
    expect(colHeaders.map((h) => h.textContent)).toEqual(["Region", "Share %"]);
    // One row per datum + the header row.
    expect(within(table).getAllByRole("row")).toHaveLength(ROWS.length + 1);
    // First column is a row header for screen-reader navigation.
    expect(
      within(table).getByRole("rowheader", { name: "US" }),
    ).toBeInTheDocument();
    // Numeric cell present.
    expect(within(table).getByRole("cell", { name: "55" })).toBeInTheDocument();
    // Caption ties the table to the chart's meaning.
    expect(table.querySelector("caption")).toHaveTextContent(
      "Exposure by region.",
    );
  });

  it("toggle mode hides the table until the button is pressed", async () => {
    const user = userEvent.setup();
    render(
      <ChartFigure testId="fig" caption="Exposure by region." columns={COLUMNS} rows={ROWS}>
        <Chart />
      </ChartFigure>,
    );
    const toggle = screen.getByTestId("fig-table-toggle");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveTextContent("Show data table");

    // The container is hidden initially.
    const container = document.getElementById(
      toggle.getAttribute("aria-controls")!,
    );
    expect(container).not.toBeVisible();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveTextContent("Hide data table");
    expect(container).toBeVisible();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(container).not.toBeVisible();
  });

  it("visually-hidden mode keeps the table in the DOM with no toggle", () => {
    render(
      <ChartFigure
        testId="fig"
        caption="Exposure by region."
        columns={COLUMNS}
        rows={ROWS}
        tableMode="visually-hidden"
      >
        <Chart />
      </ChartFigure>,
    );
    // No toggle button.
    expect(screen.queryByTestId("fig-table-toggle")).not.toBeInTheDocument();
    // Table is always rendered (accessible to assistive tech) ...
    const table = screen.getByTestId("fig-table");
    expect(table).toBeInTheDocument();
    // ... inside an sr-only wrapper.
    expect(table.closest(".sr-only")).not.toBeNull();
  });

  it("hideCaption omits the visible figcaption but keeps the table caption", () => {
    render(
      <ChartFigure
        testId="fig"
        caption="Exposure by region."
        columns={COLUMNS}
        rows={ROWS}
        hideCaption
      >
        <Chart />
      </ChartFigure>,
    );
    // No visible figcaption is rendered.
    expect(screen.getByTestId("fig").querySelector("figcaption")).toBeNull();
    // The table still carries the caption for screen readers.
    const table = screen.getByTestId("fig-table");
    expect(table.querySelector("caption")).toHaveTextContent(
      "Exposure by region.",
    );
    // With no visible figcaption, the figure must not dangle an aria-labelledby
    // pointing at a non-existent caption id (that would be a broken a11y ref).
    expect(screen.getByTestId("fig")).not.toHaveAttribute("aria-labelledby");
  });

  // --- Adversarial / edge cases (independent tester) ---

  it("renders an empty data table (header only) without crashing on zero rows", () => {
    render(
      <ChartFigure
        testId="fig"
        caption="No data yet."
        columns={COLUMNS}
        rows={[]}
        tableMode="visually-hidden"
      >
        <Chart />
      </ChartFigure>,
    );
    const table = screen.getByTestId("fig-table");
    // Header row still present; no data rows.
    expect(within(table).getAllByRole("row")).toHaveLength(1);
    expect(within(table).queryByRole("rowheader")).toBeNull();
    expect(within(table).getAllByRole("columnheader")).toHaveLength(2);
  });

  it("does not drop extra cells when a row is longer than the column set", () => {
    // A row with more cells than declared columns: the wrapper must still render
    // every cell (no silent data loss) rather than truncating to columns.length.
    render(
      <ChartFigure
        testId="fig"
        caption="Ragged."
        columns={COLUMNS}
        rows={[["US", 55, 99]]}
        tableMode="visually-hidden"
      >
        <Chart />
      </ChartFigure>,
    );
    const table = screen.getByTestId("fig-table");
    const dataRow = within(table).getAllByRole("row")[1];
    // 1 row header + 2 data cells = the full 3-cell row is preserved.
    expect(within(dataRow).getByRole("rowheader", { name: "US" })).toBeTruthy();
    expect(within(dataRow).getAllByRole("cell")).toHaveLength(2);
    expect(within(dataRow).getByRole("cell", { name: "99" })).toBeTruthy();
  });

  it("gives the toggle a per-chart accessible name so SR quick-nav can tell them apart", () => {
    render(
      <ChartFigure
        testId="fig"
        caption="Allocation by asset class."
        columns={COLUMNS}
        rows={ROWS}
      >
        <Chart />
      </ChartFigure>,
    );
    // Accessible name is derived from the caption + state, not just "Show data table".
    expect(
      screen.getByRole("button", {
        name: "Show data table, Allocation by asset class.",
      }),
    ).toBeInTheDocument();
  });

  it("each toggle instance controls its own table (unique ids, no collision)", () => {
    render(
      <>
        <ChartFigure testId="a" caption="A" columns={COLUMNS} rows={ROWS}>
          <Chart />
        </ChartFigure>
        <ChartFigure testId="b" caption="B" columns={COLUMNS} rows={ROWS}>
          <Chart />
        </ChartFigure>
      </>,
    );
    const aControls = screen
      .getByTestId("a-table-toggle")
      .getAttribute("aria-controls");
    const bControls = screen
      .getByTestId("b-table-toggle")
      .getAttribute("aria-controls");
    expect(aControls).toBeTruthy();
    expect(bControls).toBeTruthy();
    // Two figures on one page must not share a controlled-region id.
    expect(aControls).not.toBe(bControls);
  });
});
