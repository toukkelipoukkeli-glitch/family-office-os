import * as React from "react";

import { cn } from "@/lib/utils";
import { pointsFromValues, toLinePath, type Margin } from "./chart-utils";

export interface SparklineProps
  extends Omit<React.SVGProps<SVGSVGElement>, "values"> {
  /** Series of y-values, left to right. */
  values: readonly number[];
  width?: number;
  height?: number;
  /** Stroke colour; defaults to the primary theme colour. */
  color?: string;
  strokeWidth?: number;
  /** Show a dot at the last value. */
  showLastDot?: boolean;
  margin?: Margin;
}

/**
 * Tiny inline trend line with no axes — ideal next to a KPI number.
 * Pure SVG, theme-aware, deterministic.
 */
export const Sparkline = React.forwardRef<SVGSVGElement, SparklineProps>(
  (
    {
      values,
      width = 120,
      height = 32,
      color = "var(--color-chart-1)",
      strokeWidth = 1.5,
      showLastDot = true,
      margin = { top: 2, right: 2, bottom: 2, left: 2 },
      className,
      ...props
    },
    ref,
  ) => {
    const points = pointsFromValues(values, width, height, margin, 0.1);
    const path = toLinePath(points);
    const last = points[points.length - 1];
    return (
      <svg
        ref={ref}
        role="img"
        aria-label="sparkline"
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        preserveAspectRatio="none"
        className={cn("overflow-visible", className)}
        data-testid="sparkline"
        data-points={points.length}
        {...props}
      >
        {path && (
          <path
            d={path}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {showLastDot && last && (
          <circle cx={last.x} cy={last.y} r={strokeWidth * 1.5} fill={color} />
        )}
      </svg>
    );
  },
);
Sparkline.displayName = "Sparkline";

export default Sparkline;
