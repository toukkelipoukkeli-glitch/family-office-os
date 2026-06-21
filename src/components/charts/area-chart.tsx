import * as React from "react";

import { cn } from "@/lib/utils";
import {
  DEFAULT_MARGIN,
  pointsFromValues,
  toAreaPath,
  toLinePath,
  type Margin,
} from "./chart-utils";

export interface AreaChartProps
  extends Omit<React.SVGProps<SVGSVGElement>, "values"> {
  values: readonly number[];
  width?: number;
  height?: number;
  color?: string;
  strokeWidth?: number;
  /** Fill opacity for the area band (0..1). */
  fillOpacity?: number;
  margin?: Margin;
}

/**
 * Single-series themed area chart in pure SVG. The band is filled with a
 * vertical gradient derived from `color`. Deterministic and offline.
 */
export const AreaChart = React.forwardRef<SVGSVGElement, AreaChartProps>(
  (
    {
      values,
      width = 480,
      height = 240,
      color = "var(--color-chart-1)",
      strokeWidth = 2,
      fillOpacity = 0.25,
      margin = DEFAULT_MARGIN,
      className,
      ...props
    },
    ref,
  ) => {
    const points = pointsFromValues(values, width, height, margin, 0.05);
    const baselineY = height - margin.bottom;
    const areaPath = toAreaPath(points, baselineY);
    const linePath = toLinePath(points);
    const gradientId = React.useId();

    return (
      <svg
        ref={ref}
        role="img"
        aria-label="area chart"
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className={cn("h-auto max-w-full", className)}
        data-testid="area-chart"
        data-points={points.length}
        {...props}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={fillOpacity} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {areaPath && (
          <path
            d={areaPath}
            fill={`url(#${gradientId})`}
            stroke="none"
            data-testid="area-fill"
          />
        )}
        {linePath && (
          <path
            d={linePath}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            data-testid="area-line"
          />
        )}
      </svg>
    );
  },
);
AreaChart.displayName = "AreaChart";

export default AreaChart;
