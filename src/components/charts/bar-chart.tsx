import * as React from "react";

import { cn } from "@/lib/utils";
import { seriesColor } from "./palette";
import { barLayout, DEFAULT_MARGIN, type Margin } from "./chart-utils";

export interface BarDatum {
  label: string;
  value: number;
}

export interface BarChartProps
  extends Omit<React.SVGProps<SVGSVGElement>, "values"> {
  data: readonly BarDatum[];
  width?: number;
  height?: number;
  /** Single colour for all bars; defaults to the first palette colour. */
  color?: string;
  /** Colour each bar individually from the categorical palette. */
  colorByIndex?: boolean;
  /** Use a distinct down-colour for negative values. */
  signed?: boolean;
  gapRatio?: number;
  margin?: Margin;
  radius?: number;
}

/**
 * Vertical bar chart in pure SVG. Bars share a zero baseline when the data
 * crosses zero. Deterministic and theme-aware.
 */
export const BarChart = React.forwardRef<SVGSVGElement, BarChartProps>(
  (
    {
      data,
      width = 480,
      height = 240,
      color = "var(--color-chart-1)",
      colorByIndex = false,
      signed = false,
      gapRatio = 0.2,
      margin = DEFAULT_MARGIN,
      radius = 2,
      className,
      ...props
    },
    ref,
  ) => {
    const values = data.map((d) => d.value);
    const bars = barLayout(values, width, height, margin, gapRatio);

    function barColor(i: number, value: number): string {
      if (signed) {
        return value < 0 ? "var(--color-chart-down)" : "var(--color-chart-up)";
      }
      if (colorByIndex) return seriesColor(i);
      return color;
    }

    return (
      <svg
        ref={ref}
        role="img"
        aria-label="bar chart"
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className={cn("h-auto max-w-full", className)}
        data-testid="bar-chart"
        data-bars={bars.length}
        {...props}
      >
        {bars.map((b, i) => (
          <rect
            key={`bar-${i}`}
            x={b.x}
            y={b.y}
            width={b.width}
            height={b.height}
            rx={radius}
            ry={radius}
            fill={barColor(i, b.value)}
            data-testid="bar"
            data-label={data[i].label}
            data-value={b.value}
          />
        ))}
      </svg>
    );
  },
);
BarChart.displayName = "BarChart";

export default BarChart;
