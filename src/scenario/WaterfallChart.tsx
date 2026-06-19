import * as React from "react";

import { extent, linearScale, round, type Margin } from "@/components/charts/chart-utils";
import { cn } from "@/lib/utils";
import type { WaterfallModel } from "@/lib/scenario/cockpit";

export interface WaterfallChartProps
  extends Omit<React.SVGProps<SVGSVGElement>, "children"> {
  model: WaterfallModel;
  width?: number;
  height?: number;
  margin?: Margin;
  /** Formats a net-worth value for the column labels. */
  formatValue: (value: number) => string;
}

const WF_MARGIN: Margin = { top: 16, right: 12, bottom: 40, left: 12 };

interface Column {
  testId: string;
  label: string;
  /** Top and bottom value of the floating bar (in value units). */
  top: number;
  bottom: number;
  kind: "total" | "increase" | "decrease";
  delta?: number;
}

/**
 * Day-zero repricing waterfall in pure SVG.
 *
 * Starts at today's net worth, steps down (loss) or up (gain) once per repriced
 * asset class, and lands on the shocked net worth — so the eye can see exactly
 * which classes drove the move. Two solid "total" columns bracket the floating
 * step columns. Deterministic and theme-aware.
 */
export const WaterfallChart = React.forwardRef<SVGSVGElement, WaterfallChartProps>(
  (
    { model, width = 720, height = 320, margin = WF_MARGIN, formatValue, className, ...props },
    ref,
  ) => {
    const m = margin;
    const columns: Column[] = [
      {
        testId: "wf-col-initial",
        label: "Today",
        top: model.initialNetWorth,
        bottom: 0,
        kind: "total",
      },
      ...model.steps.map((s, i) => ({
        testId: `wf-col-step-${i}`,
        label: s.label,
        top: Math.max(s.runningBefore, s.runningAfter),
        bottom: Math.min(s.runningBefore, s.runningAfter),
        kind: (s.delta < 0 ? "decrease" : "increase") as Column["kind"],
        delta: s.delta,
      })),
      {
        testId: "wf-col-shocked",
        label: "Shocked",
        top: model.shockedNetWorth,
        bottom: 0,
        kind: "total" as const,
      },
    ];

    const innerW = Math.max(0, width - m.left - m.right);
    const innerH = Math.max(0, height - m.top - m.bottom);

    // Include both edges of every column (and 0) so a cross-zero waterfall —
    // where a shocked running value dips below zero — is not clipped.
    const edges = columns.flatMap((c) => [c.top, c.bottom]);
    const dom = extent([0, ...edges]);
    const pad = (dom.max - dom.min) * 0.08 || 1;
    const y = linearScale(
      { min: dom.min - (dom.min < 0 ? pad : 0), max: dom.max + pad },
      m.top + innerH,
      m.top,
    );

    const slot = innerW / columns.length;
    const barW = round(slot * 0.62);
    const offset = (slot - barW) / 2;

    function colColor(kind: Column["kind"]): string {
      if (kind === "total") return "var(--color-chart-1)";
      return kind === "decrease"
        ? "var(--color-chart-down)"
        : "var(--color-chart-up)";
    }

    return (
      <svg
        ref={ref}
        role="img"
        aria-label={`day-zero repricing waterfall for ${model.scenarioName}`}
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className={cn("text-foreground", className)}
        data-testid="waterfall-chart"
        data-columns={columns.length}
        data-scenario={model.scenarioId}
        {...props}
      >
        <line
          x1={m.left}
          x2={width - m.right}
          y1={round(y(0))}
          y2={round(y(0))}
          stroke="var(--color-chart-grid)"
          strokeWidth={1}
        />
        {columns.map((c, i) => {
          const x = round(m.left + i * slot + offset);
          const yTop = round(y(c.top));
          const yBottom = round(y(c.bottom));
          const h = Math.max(2, round(yBottom - yTop));
          const cxText = round(x + barW / 2);
          return (
            <g key={c.testId} data-testid={c.testId} data-kind={c.kind}>
              {/* Connector from the previous column's running level. */}
              {i > 0 && i < columns.length && (
                <line
                  x1={round(m.left + (i - 1) * slot + offset + barW)}
                  x2={x}
                  y1={round(
                    y(
                      c.kind === "total"
                        ? columns[i - 1].top
                        : (c.delta ?? 0) < 0
                          ? c.top
                          : c.bottom,
                    ),
                  )}
                  y2={round(
                    y(
                      c.kind === "total"
                        ? c.top
                        : (c.delta ?? 0) < 0
                          ? c.top
                          : c.bottom,
                    ),
                  )}
                  stroke="var(--color-chart-grid)"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
              )}
              <rect
                x={x}
                y={yTop}
                width={barW}
                height={h}
                rx={2}
                fill={colColor(c.kind)}
                data-testid="wf-bar"
                data-delta={c.delta ?? ""}
              />
              {/* Magnitude label above the bar. */}
              <text
                x={cxText}
                y={yTop - 4}
                textAnchor="middle"
                className="fill-muted-foreground text-[10px] tabular-nums"
              >
                {c.kind === "total"
                  ? formatValue(c.top)
                  : `${(c.delta ?? 0) < 0 ? "−" : "+"}${formatValue(Math.abs(c.delta ?? 0))}`}
              </text>
              {/* Category label below the axis. */}
              <text
                x={cxText}
                y={height - 22}
                textAnchor="middle"
                className="fill-foreground text-[10px]"
              >
                {truncate(c.label)}
              </text>
            </g>
          );
        })}
      </svg>
    );
  },
);
WaterfallChart.displayName = "WaterfallChart";

function truncate(label: string, max = 12): string {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

export default WaterfallChart;
