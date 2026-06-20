import * as React from "react";

import { cn } from "@/lib/utils";

/** A single column header for the accessible data table. */
export interface ChartTableColumn {
  /** Visible column header text. */
  header: string;
  /**
   * Cell alignment. Numeric columns default to right-aligned for scannability;
   * the first (label) column is typically left-aligned.
   */
  align?: "left" | "right";
}

/** One row of cells in the accessible data table (stringified for display). */
export type ChartTableRow = readonly React.ReactNode[];

export interface ChartFigureProps {
  /**
   * Accessible caption describing the chart. Used as the `<figcaption>` and as
   * the table's `<caption>`, so screen-reader users get the same context a
   * sighted user reads above the chart.
   */
  caption: React.ReactNode;
  /** Column headers for the data table that mirrors the chart's data. */
  columns: readonly ChartTableColumn[];
  /** Rows of data backing the chart, in the same order it is drawn. */
  rows: readonly ChartTableRow[];
  /** The chart element itself (an `<svg>` chart component). */
  children: React.ReactNode;
  /**
   * How the data table is exposed:
   *   - "toggle"      → a "Show data table" button reveals it visually (default).
   *   - "visually-hidden" → the table is always in the DOM but `sr-only`, so it
   *     is read by assistive tech without taking visual space.
   */
  tableMode?: "toggle" | "visually-hidden";
  /** Visually hide the caption (chart already has a visible title elsewhere). */
  hideCaption?: boolean;
  /** `data-testid` for the wrapping `<figure>`. */
  testId?: string;
  /** Extra classes for the `<figure>`. */
  className?: string;
}

/**
 * Accessibility wrapper that pairs a chart with a tabular representation of the
 * same data.
 *
 * SVG charts convey their meaning purely visually; a screen-reader user lands on
 * a single `role="img"` with a terse label and cannot read individual values.
 * `ChartFigure` fixes that by rendering the chart inside a `<figure>` and
 * exposing every data point in an associated `<table>` — either always present
 * but visually hidden (`visually-hidden`) or revealed on demand via a toggle
 * button (`toggle`). Either way the data is reachable by keyboard and assistive
 * tech, and the visual layout is unchanged when the toggle is closed.
 */
export function ChartFigure({
  caption,
  columns,
  rows,
  children,
  tableMode = "toggle",
  hideCaption = false,
  testId,
  className,
}: ChartFigureProps) {
  const [open, setOpen] = React.useState(false);
  const tableId = React.useId();
  const captionId = React.useId();
  const isToggle = tableMode === "toggle";
  const tableVisible = !isToggle || open;

  const table = (
    <table
      className="w-full border-collapse text-left text-sm"
      data-testid={testId ? `${testId}-table` : undefined}
    >
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          {columns.map((col, i) => (
            <th
              key={i}
              scope="col"
              className={cn(
                "border-b border-border py-1.5 pr-3 font-medium text-muted-foreground",
                col.align === "right" && "text-right",
              )}
            >
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, ri) => (
          <tr key={ri} data-testid={testId ? `${testId}-row` : undefined}>
            {row.map((cell, ci) => {
              const align = columns[ci]?.align;
              const cellClass = cn(
                "border-b border-border/60 py-1.5 pr-3 tabular-nums",
                align === "right" && "text-right",
              );
              // First column is a row header for screen-reader navigation.
              return ci === 0 ? (
                <th key={ci} scope="row" className={cn(cellClass, "font-normal")}>
                  {cell}
                </th>
              ) : (
                <td key={ci} className={cellClass}>
                  {cell}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <figure
      className={cn("m-0", className)}
      data-testid={testId}
      aria-labelledby={hideCaption ? undefined : captionId}
    >
      {children}

      {!hideCaption && (
        <figcaption
          id={captionId}
          className="mt-2 text-xs text-muted-foreground"
        >
          {caption}
        </figcaption>
      )}

      {isToggle ? (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={tableId}
            data-testid={testId ? `${testId}-table-toggle` : undefined}
            className="mt-2 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground underline-offset-4 hover:bg-muted hover:underline"
          >
            {open ? "Hide data table" : "Show data table"}
          </button>
          <div
            id={tableId}
            hidden={!tableVisible}
            className={cn("mt-3 overflow-x-auto", !tableVisible && "hidden")}
          >
            {table}
          </div>
        </>
      ) : (
        <div id={tableId} className="sr-only">
          {table}
        </div>
      )}
    </figure>
  );
}

export default ChartFigure;
