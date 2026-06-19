import * as React from "react";

import { cn } from "@/lib/utils";
import { seriesColor } from "./palette";
import { donutLayout } from "./chart-utils";

export interface DonutDatum {
  label: string;
  value: number;
  color?: string;
}

export interface DonutChartProps
  extends Omit<React.SVGProps<SVGSVGElement>, "values"> {
  data: readonly DonutDatum[];
  /** Square viewport size in px. */
  size?: number;
  /** Ring thickness as a fraction of the radius (0..1). 0 yields a pie. */
  thickness?: number;
  /** Optional centre label (e.g. a total). */
  centerLabel?: string;
}

/**
 * Donut / pie chart in pure SVG. Negative values are clamped to zero. When
 * `thickness` is 1 the chart renders as a full pie. Deterministic.
 */
export const DonutChart = React.forwardRef<SVGSVGElement, DonutChartProps>(
  (
    { data, size = 200, thickness = 0.4, centerLabel, className, ...props },
    ref,
  ) => {
    const cx = size / 2;
    const cy = size / 2;
    const outer = size / 2;
    const inner = outer * (1 - Math.min(1, Math.max(0, thickness)));
    const values = data.map((d) => d.value);
    const segments = donutLayout(values, cx, cy, outer, inner);

    return (
      <svg
        ref={ref}
        role="img"
        aria-label={`donut chart: ${data.map((d) => d.label).join(", ")}`}
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        className={cn(className)}
        data-testid="donut-chart"
        data-segments={segments.length}
        {...props}
      >
        {segments.map((seg, i) => (
          <path
            key={`seg-${i}`}
            d={seg.path}
            fill={data[i].color ?? seriesColor(i)}
            data-testid="donut-segment"
            data-label={data[i].label}
            data-value={seg.value}
          />
        ))}
        {centerLabel && inner > 0 && (
          <text
            x={cx}
            y={cy}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-foreground text-sm font-medium"
            data-testid="donut-center-label"
          >
            {centerLabel}
          </text>
        )}
      </svg>
    );
  },
);
DonutChart.displayName = "DonutChart";

export default DonutChart;
