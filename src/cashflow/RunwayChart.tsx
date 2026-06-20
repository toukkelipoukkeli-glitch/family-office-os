import * as React from "react";

import {
  DEFAULT_MARGIN,
  extent,
  linearScale,
  round,
  toAreaPath,
  toLinePath,
  type Margin,
} from "@/components/charts/chart-utils";
import { cn } from "@/lib/utils";
import type { RunwayPoint } from "./cashflow-view";

export interface RunwayChartProps
  extends Omit<React.SVGProps<SVGSVGElement>, "points"> {
  points: readonly RunwayPoint[];
  /** Period index where cash first goes negative, or null. Drawn as a marker. */
  depletionPeriod?: number | null;
  /** Period index of the lowest balance (the trough), drawn as a marker. */
  lowestPeriod?: number;
  width?: number;
  height?: number;
  margin?: Margin;
  formatValue?: (value: number) => string;
}

const CHART_MARGIN: Margin = { top: 16, right: 16, bottom: 28, left: 16 };

/**
 * Liquidity-runway chart: the cash-balance trajectory drawn as a filled area
 * over time, with an explicit **zero line** (the runway threshold), a trough
 * marker at the lowest balance, and — when the office runs out of cash — a
 * depletion marker at the first period that breaches zero. Pure SVG, themed via
 * the `--color-chart-*` CSS variables, deterministic and offline.
 */
export const RunwayChart = React.forwardRef<SVGSVGElement, RunwayChartProps>(
  (
    {
      points,
      depletionPeriod = null,
      lowestPeriod,
      width = 960,
      height = 320,
      margin = CHART_MARGIN ?? DEFAULT_MARGIN,
      formatValue = (v) => String(v),
      className,
      ...props
    },
    ref,
  ) => {
    const values = points.map((p) => p.value);
    // Always include 0 in the domain so the zero threshold is on-canvas, and pad
    // the top/bottom a little so markers/labels are not clipped.
    const raw = extent(values);
    const lo = Math.min(0, raw.min);
    const hi = Math.max(0, raw.max);
    const pad = (hi - lo || 1) * 0.12;
    const innerTop = margin.top;
    const innerBottom = height - margin.bottom;
    const innerLeft = margin.left;
    const innerRight = width - margin.right;

    const y = linearScale(
      { min: lo - pad, max: hi + pad },
      innerBottom,
      innerTop,
    );
    const x =
      points.length <= 1
        ? () => (innerLeft + innerRight) / 2
        : linearScale({ min: 0, max: points.length - 1 }, innerLeft, innerRight);

    const xy = points.map((p, i) => ({
      x: round(x(i)),
      y: round(y(p.value)),
    }));
    const zeroY = round(y(0));
    const baselineY = innerBottom;
    const areaPath = toAreaPath(xy, baselineY);
    const linePath = toLinePath(xy);
    const gradientId = React.useId();

    const depletionIndex =
      depletionPeriod === null || depletionPeriod === undefined
        ? -1
        : points.findIndex((p) => p.period === depletionPeriod);
    const lowestIndex =
      lowestPeriod === undefined
        ? -1
        : points.findIndex((p) => p.period === lowestPeriod);

    // Show a sparse set of x-axis tick labels to avoid clutter at small widths.
    const tickEvery = Math.max(1, Math.ceil(points.length / 8));

    return (
      <svg
        ref={ref}
        role="img"
        aria-label="liquidity runway chart"
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className={cn("text-muted-foreground", className)}
        data-testid="runway-chart"
        data-points={points.length}
        data-exhausted={depletionIndex >= 0}
        {...props}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor="var(--color-chart-1)"
              stopOpacity={0.3}
            />
            <stop
              offset="100%"
              stopColor="var(--color-chart-1)"
              stopOpacity={0}
            />
          </linearGradient>
        </defs>

        {/* Zero / runway threshold line */}
        <line
          x1={innerLeft}
          x2={innerRight}
          y1={zeroY}
          y2={zeroY}
          stroke="var(--color-chart-grid)"
          strokeWidth={1.5}
          strokeDasharray="4 4"
          data-testid="runway-zero-line"
        />
        <text
          x={innerLeft}
          y={zeroY - 4}
          className="fill-muted-foreground"
          fontSize={11}
        >
          $0 — runway threshold
        </text>

        {areaPath && (
          <path
            d={areaPath}
            fill={`url(#${gradientId})`}
            stroke="none"
            data-testid="runway-area"
          />
        )}
        {linePath && (
          <path
            d={linePath}
            fill="none"
            stroke="var(--color-chart-1)"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            data-testid="runway-line"
          />
        )}

        {/* Point dots */}
        {xy.map((p, i) => (
          <circle
            key={`dot-${i}`}
            cx={p.x}
            cy={p.y}
            r={2.5}
            className={cn(
              points[i].negative
                ? "fill-[var(--color-chart-down)]"
                : "fill-[var(--color-chart-1)]",
            )}
            data-testid="runway-dot"
          />
        ))}

        {/* Depletion marker */}
        {depletionIndex >= 0 && (
          <g data-testid="runway-depletion">
            <line
              x1={xy[depletionIndex].x}
              x2={xy[depletionIndex].x}
              y1={innerTop}
              y2={innerBottom}
              stroke="var(--color-chart-down)"
              strokeWidth={1.5}
              strokeDasharray="3 3"
            />
            <circle
              cx={xy[depletionIndex].x}
              cy={xy[depletionIndex].y}
              r={5}
              className="fill-[var(--color-chart-down)]"
            />
            <text
              x={xy[depletionIndex].x}
              y={innerTop + 12}
              textAnchor={
                depletionIndex > points.length / 2 ? "end" : "start"
              }
              className="fill-[var(--color-chart-down)]"
              fontSize={11}
              fontWeight={600}
            >
              Cash depleted
            </text>
          </g>
        )}

        {/* Trough marker (only when distinct from depletion) */}
        {lowestIndex >= 0 && lowestIndex !== depletionIndex && (
          <circle
            cx={xy[lowestIndex].x}
            cy={xy[lowestIndex].y}
            r={4}
            fill="none"
            stroke="var(--color-chart-1)"
            strokeWidth={2}
            data-testid="runway-trough"
          />
        )}

        {/* X-axis labels */}
        {points.map((p, i) =>
          i % tickEvery === 0 || i === points.length - 1 ? (
            <text
              key={`tick-${i}`}
              x={xy[i].x}
              y={height - 8}
              textAnchor="middle"
              className="fill-muted-foreground"
              fontSize={10}
              data-testid="runway-tick"
            >
              {p.label}
            </text>
          ) : null,
        )}

        <title>
          {`Runway: ${points.length - 1} periods; ends at ${formatValue(
            values[values.length - 1] ?? 0,
          )}`}
        </title>
      </svg>
    );
  },
);
RunwayChart.displayName = "RunwayChart";

export default RunwayChart;
