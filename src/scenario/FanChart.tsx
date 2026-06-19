import * as React from "react";

import {
  DEFAULT_MARGIN,
  extent,
  linearScale,
  round,
  toLinePath,
  type Margin,
} from "@/components/charts/chart-utils";
import { cn } from "@/lib/utils";
import type { FanPoint } from "@/lib/scenario/cockpit";

export interface FanChartProps
  extends Omit<React.SVGProps<SVGSVGElement>, "points"> {
  /** Fan points over the horizon, including the t=0 anchor. */
  points: readonly FanPoint[];
  width?: number;
  height?: number;
  margin?: Margin;
}

interface BandSpec {
  testId: string;
  lower: (p: FanPoint) => number;
  upper: (p: FanPoint) => number;
  opacity: number;
}

// Outer (p5–p95) drawn first (faintest), inner (p25–p75) on top (stronger).
const BANDS: readonly BandSpec[] = [
  { testId: "fan-band-90", lower: (p) => p.p5, upper: (p) => p.p95, opacity: 0.18 },
  { testId: "fan-band-50", lower: (p) => p.p25, upper: (p) => p.p75, opacity: 0.32 },
];

const FAN_MARGIN: Margin = { top: 12, right: 16, bottom: 24, left: 16 };

/**
 * Net-worth projection fan chart in pure SVG.
 *
 * Renders the p5–p95 and p25–p75 percentile bands as filled cones around the
 * median line, anchored at today's net worth at t=0. Deterministic, theme-aware,
 * dependency-free — driven entirely by the {@link FanPoint}s from the cockpit
 * model so it is DOM- and snapshot-assertable.
 */
export const FanChart = React.forwardRef<SVGSVGElement, FanChartProps>(
  (
    { points, width = 720, height = 300, margin = FAN_MARGIN, className, ...props },
    ref,
  ) => {
    const m = margin ?? DEFAULT_MARGIN;
    const innerW = Math.max(0, width - m.left - m.right);
    const innerH = Math.max(0, height - m.top - m.bottom);

    const allValues = points.flatMap((p) => [p.p5, p.p95]);
    const yDomain = extent(allValues);
    // A little vertical headroom so the outer band is not clipped.
    const pad = (yDomain.max - yDomain.min) * 0.06 || 1;
    const y = linearScale(
      { min: yDomain.min - pad, max: yDomain.max + pad },
      m.top + innerH,
      m.top,
    );
    const lastYear = points[points.length - 1]?.year || 1;
    const x = linearScale({ min: 0, max: lastYear || 1 }, m.left, m.left + innerW);

    function bandPath(spec: BandSpec): string {
      // Upper edge left→right, then lower edge right→left, closed.
      const upper = points.map((p) => ({
        x: round(x(p.year)),
        y: round(y(spec.upper(p))),
      }));
      const lower = [...points]
        .reverse()
        .map((p) => ({ x: round(x(p.year)), y: round(y(spec.lower(p))) }));
      return (
        toLinePath(upper) +
        " " +
        lower.map((pt) => `L${pt.x},${pt.y}`).join(" ") +
        " Z"
      );
    }

    const medianPath = toLinePath(
      points.map((p) => ({ x: round(x(p.year)), y: round(y(p.p50)) })),
    );

    const baselineY = round(y(points[0]?.p50 ?? 0));

    return (
      <svg
        ref={ref}
        role="img"
        aria-label="net worth projection fan chart"
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className={cn("text-muted-foreground", className)}
        data-testid="fan-chart"
        data-points={points.length}
        {...props}
      >
        {/* Today's net worth reference line. */}
        <line
          x1={m.left}
          x2={width - m.right}
          y1={baselineY}
          y2={baselineY}
          stroke="var(--color-chart-grid)"
          strokeWidth={1}
          strokeDasharray="4 4"
          data-testid="fan-baseline"
        />
        {BANDS.map((spec) => (
          <path
            key={spec.testId}
            d={bandPath(spec)}
            fill="var(--color-chart-1)"
            fillOpacity={spec.opacity}
            stroke="none"
            data-testid={spec.testId}
          />
        ))}
        <path
          d={medianPath}
          fill="none"
          stroke="var(--color-chart-1)"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          data-testid="fan-median"
        />
        {points.map((p) => (
          <text
            key={`x-${p.year}`}
            x={round(x(p.year))}
            y={height - 6}
            textAnchor="middle"
            className="fill-muted-foreground text-[10px]"
          >
            {p.year === 0 ? "now" : `${p.year}y`}
          </text>
        ))}
      </svg>
    );
  },
);
FanChart.displayName = "FanChart";

export default FanChart;
