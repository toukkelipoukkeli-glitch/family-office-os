import * as React from "react";

import { linearScale, round } from "@/components/charts/chart-utils";
import { cn } from "@/lib/utils";
import type { FactorRow } from "@/lib/factors/view";

export interface FactorBetasChartProps
  extends Omit<React.SVGProps<SVGSVGElement>, "children"> {
  loadings: FactorRow[];
  width?: number;
  /** Row height per factor (px). */
  rowHeight?: number;
  formatValue: (value: number) => string;
}

const LEFT = 124; // label gutter
const RIGHT = 52; // right gutter, leaves room for the value label past the bar
const TOP = 8;
const BOTTOM = 8;

/**
 * Diverging horizontal bars of each factor's regression beta (loading). Bars
 * grow right for a positive loading and left for a negative one from a shared
 * zero axis, so the eye reads which factors the book is long and which it is
 * short. Pure SVG, deterministic, theme-aware.
 */
export const FactorBetasChart = React.forwardRef<
  SVGSVGElement,
  FactorBetasChartProps
>(
  (
    { loadings, width = 640, rowHeight = 40, formatValue, className, ...props },
    ref,
  ) => {
    const innerW = Math.max(0, width - LEFT - RIGHT);
    const height = TOP + BOTTOM + loadings.length * rowHeight;

    const rawMax =
      loadings.reduce((mx, l) => Math.max(mx, Math.abs(l.beta)), 0) || 1;
    const maxAbs = rawMax * 1.12;
    const x = linearScale({ min: -maxAbs, max: maxAbs }, LEFT, LEFT + innerW);
    const zeroX = round(x(0));
    const barH = Math.max(6, rowHeight - 16);

    return (
      <svg
        ref={ref}
        role="img"
        aria-label="factor betas (regression loadings)"
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className={cn("text-foreground", className)}
        data-testid="factor-betas-chart"
        data-factors={loadings.length}
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
        {loadings.map((l, i) => {
          const rowY = TOP + i * rowHeight;
          const cy = round(rowY + rowHeight / 2);
          const vx = round(x(l.beta));
          const bx = Math.min(zeroX, vx);
          const bw = Math.max(1, Math.abs(vx - zeroX));
          const positive = l.beta >= 0;
          return (
            <g
              key={l.key}
              data-testid="beta-row"
              data-factor={l.key}
              data-beta={round(l.beta, 6)}
            >
              <text
                x={LEFT - 10}
                y={cy}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-foreground text-[11px]"
              >
                {l.label}
              </text>
              <rect
                x={bx}
                y={round(cy - barH / 2)}
                width={bw}
                height={barH}
                rx={2}
                fill={
                  positive ? "var(--color-chart-up)" : "var(--color-chart-down)"
                }
              />
              <text
                x={positive ? bx + bw + 5 : bx - 5}
                y={cy}
                textAnchor={positive ? "start" : "end"}
                dominantBaseline="middle"
                className="fill-foreground text-[11px] font-medium tabular-nums"
              >
                {formatValue(l.beta)}
              </text>
            </g>
          );
        })}
      </svg>
    );
  },
);
FactorBetasChart.displayName = "FactorBetasChart";

export default FactorBetasChart;
