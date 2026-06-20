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
  });
});
