import * as React from "react";

import { cn } from "@/lib/utils";
import { seriesColor } from "./palette";
import {
  DEFAULT_MARGIN,
  extent,
  pointsFromValues,
  toLinePath,
  type Margin,
} from "./chart-utils";

export interface LineSeries {
  /** Series label (used for the accessible legend). */
  label: string;
  values: readonly number[];
  /** Optional explicit colour; falls back to the categorical palette. */
  color?: string;
}

export interface LineChartProps
  extends Omit<React.SVGProps<SVGSVGElement>, "values"> {
  /** One or more series. Each series is plotted as its own line. */
  series: readonly LineSeries[];
  width?: number;
  height?: number;
  strokeWidth?: number;
  margin?: Margin;
  /** Draw faint horizontal gridlines. */
  grid?: boolean;
}

/**
 * Multi-series themed line chart in pure SVG. All series share a common
 * y-domain so they are visually comparable. Deterministic and offline.
 */
export const LineChart = React.forwardRef<SVGSVGElement, LineChartProps>(
  (
    {
      series,
      width = 480,
      height = 240,
      strokeWidth = 2,
      margin = DEFAULT_MARGIN,
      grid = true,
      className,
      ...props
    },
    ref,
  ) => {
    // Shared domain across all series so lines are comparable.
    const all = series.flatMap((s) => [...s.values]);
    const sharedDomain = extent(all);
    const innerTop = margin.top;
    const innerBottom = height - margin.bottom;
    const gridLines = grid
      ? [0, 0.25, 0.5, 0.75, 1].map(
          (f) => innerTop + f * (innerBottom - innerTop),
        )
      : [];

    return (
      <svg
        ref={ref}
        role="img"
        aria-label={`line chart: ${series.map((s) => s.label).join(", ")}`}
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className={cn("text-muted-foreground", className)}
        data-testid="line-chart"
        data-series={series.length}
        {...props}
      >
        {gridLines.map((gy, i) => (
          <line
            key={`grid-${i}`}
            x1={margin.left}
            x2={width - margin.right}
            y1={gy}
            y2={gy}
            stroke="var(--color-chart-grid)"
            strokeWidth={1}
            data-testid="grid-line"
          />
        ))}
        {series.map((s, i) => {
          const seriesPts = pointsFromValues(
            s.values,
            width,
            height,
            margin,
            0.05,
            sharedDomain,
          );
          const color = s.color ?? seriesColor(i);
          return (
            <path
              key={`series-${i}`}
              d={toLinePath(seriesPts)}
              fill="none"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              data-testid="line-series"
              data-label={s.label}
            />
          );
        })}
      </svg>
    );
  },
);
LineChart.displayName = "LineChart";

export default LineChart;
