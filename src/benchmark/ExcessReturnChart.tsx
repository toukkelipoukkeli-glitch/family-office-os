import * as React from "react";

import { linearScale, round } from "@/components/charts/chart-utils";
import { cn } from "@/lib/utils";

export interface ExcessReturnChartProps
  extends Omit<React.SVGProps<SVGSVGElement>, "children"> {
  /** Per-period active return (portfolio − benchmark), decimals. */
  excess: readonly number[];
  width?: number;
  height?: number;
  formatValue: (value: number) => string;
}

const TOP = 10;
const BOTTOM = 10;
const LEFT = 8;
const RIGHT = 8;

/**
 * A diverging vertical bar strip of per-period excess return: each period's
 * active return grows up from a shared zero axis when the portfolio beat the
 * benchmark and down when it lagged. Pure SVG, deterministic, theme-aware — the
 * "where did we add/give back value" companion to the cumulative growth chart.
 */
export const ExcessReturnChart = React.forwardRef<
  SVGSVGElement,
  ExcessReturnChartProps
>(
  (
    { excess, width = 640, height = 180, formatValue, className, ...props },
    ref,
  ) => {
    const innerW = Math.max(0, width - LEFT - RIGHT);
    const innerH = Math.max(0, height - TOP - BOTTOM);
    const n = excess.length;

    const rawMax = excess.reduce((mx, v) => Math.max(mx, Math.abs(v)), 0) || 1;
    const maxAbs = rawMax * 1.2;
    const y = linearScale({ min: -maxAbs, max: maxAbs }, TOP + innerH, TOP);
    const zeroY = round(y(0));

    const slot = n > 0 ? innerW / n : innerW;
    const barW = Math.max(2, round(slot * 0.62));

    return (
      <svg
        ref={ref}
        role="img"
        aria-label="per-period excess return versus the benchmark"
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className={cn("text-foreground", className)}
        data-testid="excess-return-chart"
        data-periods={n}
        {...props}
      >
        {/* Zero axis */}
        <line
          x1={LEFT}
          x2={width - RIGHT}
          y1={zeroY}
          y2={zeroY}
          stroke="var(--color-chart-grid)"
          strokeWidth={1}
        />
        {excess.map((v, i) => {
          const cx = round(LEFT + slot * (i + 0.5));
          const vy = round(y(v));
          const top = Math.min(zeroY, vy);
          const h = Math.max(1, Math.abs(vy - zeroY));
          const up = v >= 0;
          return (
            <rect
              key={i}
              data-testid="excess-bar"
              data-period={i}
              data-value={round(v, 8)}
              x={round(cx - barW / 2)}
              y={top}
              width={barW}
              height={h}
              rx={1.5}
              fill={
                up ? "var(--color-chart-up)" : "var(--color-chart-down)"
              }
            >
              <title>{`Period ${i + 1}: ${formatValue(v)}`}</title>
            </rect>
          );
        })}
      </svg>
    );
  },
);
ExcessReturnChart.displayName = "ExcessReturnChart";

export default ExcessReturnChart;
