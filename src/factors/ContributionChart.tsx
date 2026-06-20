import * as React from "react";

import { linearScale, round } from "@/components/charts/chart-utils";
import { cn } from "@/lib/utils";
import type { FactorView } from "@/lib/factors/view";

export interface ContributionChartProps
  extends Omit<React.SVGProps<SVGSVGElement>, "children"> {
  view: FactorView;
  width?: number;
  rowHeight?: number;
  formatValue: (value: number) => string;
}

const LEFT = 124;
const RIGHT = 16;
const TOP = 8;
const BOTTOM = 8;

interface Bar {
  testId: string;
  key: string;
  label: string;
  value: number;
  kind: "alpha" | "factor" | "total";
}

/**
 * Return-decomposition bars: the alpha (intercept) plus each factor's
 * contribution (βⱼ · mean factorⱼ), then the total mean portfolio return. Each
 * factor and alpha bar diverges from a shared zero axis; the total bar is drawn
 * in a neutral tone so the eye reads "these pieces add up to this". Pure SVG,
 * deterministic, theme-aware.
 */
export const ContributionChart = React.forwardRef<
  SVGSVGElement,
  ContributionChartProps
>(
  (
    { view, width = 640, rowHeight = 34, formatValue, className, ...props },
    ref,
  ) => {
    const bars: Bar[] = [
      {
        testId: "contrib-alpha",
        key: "alpha",
        label: "Alpha (α)",
        value: view.alpha,
        kind: "alpha",
      },
      ...view.loadings.map((l) => ({
        testId: "contrib-factor",
        key: l.key,
        label: l.label,
        value: l.contribution,
        kind: "factor" as const,
      })),
      {
        testId: "contrib-total",
        key: "total",
        label: "Mean return",
        value: view.meanPortfolioReturn,
        kind: "total",
      },
    ];

    const innerW = Math.max(0, width - LEFT - RIGHT);
    const height = TOP + BOTTOM + bars.length * rowHeight;

    const rawMax =
      bars.reduce((mx, b) => Math.max(mx, Math.abs(b.value)), 0) || 1;
    const maxAbs = rawMax * 1.35;
    const x = linearScale({ min: -maxAbs, max: maxAbs }, LEFT, LEFT + innerW);
    const zeroX = round(x(0));
    const barH = Math.max(6, rowHeight - 14);

    return (
      <svg
        ref={ref}
        role="img"
        aria-label="factor contributions to mean portfolio return"
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className={cn("text-foreground", className)}
        data-testid="contribution-chart"
        data-bars={bars.length}
        {...props}
      >
        <line
          x1={zeroX}
          x2={zeroX}
          y1={TOP}
          y2={height - BOTTOM}
          stroke="var(--color-chart-grid)"
          strokeWidth={1}
        />
        {bars.map((b, i) => {
          const rowY = TOP + i * rowHeight;
          const cy = round(rowY + rowHeight / 2);
          const vx = round(x(b.value));
          const bx = Math.min(zeroX, vx);
          const bw = Math.max(1, Math.abs(vx - zeroX));
          const positive = b.value >= 0;
          const fill =
            b.kind === "total"
              ? "var(--color-chart-grid)"
              : b.kind === "alpha"
                ? "var(--color-chart-4)"
                : positive
                  ? "var(--color-chart-up)"
                  : "var(--color-chart-down)";
          return (
            <g
              key={b.key}
              data-testid={b.testId}
              data-key={b.key}
              data-value={round(b.value, 8)}
            >
              <text
                x={LEFT - 10}
                y={cy}
                textAnchor="end"
                dominantBaseline="middle"
                className={cn(
                  "fill-foreground text-[11px]",
                  b.kind === "total" && "font-semibold",
                )}
              >
                {b.label}
              </text>
              <rect
                x={bx}
                y={round(cy - barH / 2)}
                width={bw}
                height={barH}
                rx={2}
                fill={fill}
                opacity={b.kind === "total" ? 0.85 : 1}
              />
              <text
                x={positive ? bx + bw + 5 : bx - 5}
                y={cy}
                textAnchor={positive ? "start" : "end"}
                dominantBaseline="middle"
                className="fill-muted-foreground text-[10px] tabular-nums"
              >
                {formatValue(b.value)}
              </text>
            </g>
          );
        })}
      </svg>
    );
  },
);
ContributionChart.displayName = "ContributionChart";

export default ContributionChart;
