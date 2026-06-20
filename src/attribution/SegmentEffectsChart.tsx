import * as React from "react";

import { linearScale, round } from "@/components/charts/chart-utils";
import { cn } from "@/lib/utils";
import type { SegmentRow } from "@/lib/attribution/view";

export interface SegmentEffectsChartProps
  extends Omit<React.SVGProps<SVGSVGElement>, "children"> {
  segments: SegmentRow[];
  width?: number;
  /** Row height per segment group (px). */
  rowHeight?: number;
  formatValue: (value: number) => string;
}

const EFFECTS = [
  { key: "allocation", label: "Allocation", color: "var(--color-chart-1)" },
  { key: "selection", label: "Selection", color: "var(--color-chart-2)" },
  { key: "interaction", label: "Interaction", color: "var(--color-chart-3)" },
] as const;

const LEFT = 132; // label gutter
const RIGHT = 12;
const TOP = 8;
const BOTTOM = 8;

/**
 * Diverging horizontal grouped bars: for each segment, three sub-bars
 * (allocation / selection / interaction) growing right for positive and left
 * for negative effects from a shared zero axis. Pure SVG, deterministic, and
 * theme-aware. The single source of "which decision helped where".
 */
export const SegmentEffectsChart = React.forwardRef<
  SVGSVGElement,
  SegmentEffectsChartProps
>(
  (
    { segments, width = 640, rowHeight = 56, formatValue, className, ...props },
    ref,
  ) => {
    const innerW = Math.max(0, width - LEFT - RIGHT);
    const height = TOP + BOTTOM + segments.length * rowHeight;

    // Symmetric domain around zero so positive/negative bars are comparable.
    // Pad by 35% so the longest bar stops short of the plot edge, leaving room
    // for its value label (which sits just beyond the bar's end).
    const rawMax =
      segments.reduce(
        (mx, s) =>
          Math.max(
            mx,
            Math.abs(s.allocation),
            Math.abs(s.selection),
            Math.abs(s.interaction),
          ),
        0,
      ) || 1;
    const maxAbs = rawMax * 1.35;
    const x = linearScale(
      { min: -maxAbs, max: maxAbs },
      LEFT,
      LEFT + innerW,
    );
    const zeroX = round(x(0));

    const subH = (rowHeight - 16) / EFFECTS.length;

    return (
      <svg
        ref={ref}
        role="img"
        aria-label="per-segment allocation, selection and interaction effects"
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className={cn("text-foreground", className)}
        data-testid="segment-effects-chart"
        data-segments={segments.length}
        {...props}
      >
        {/* Zero axis */}
        <line
          x1={zeroX}
          x2={zeroX}
          y1={TOP}
          y2={height - BOTTOM}
          stroke="var(--color-chart-grid)"
          strokeWidth={1}
        />
        {segments.map((seg, si) => {
          const rowY = TOP + si * rowHeight;
          return (
            <g
              key={seg.id}
              data-testid="effect-row"
              data-segment={seg.id}
              data-total={round(seg.total, 8)}
            >
              {/* Segment label */}
              <text
                x={LEFT - 10}
                y={rowY + rowHeight / 2}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-foreground text-[11px]"
              >
                {seg.label}
              </text>
              {EFFECTS.map((eff, ei) => {
                const v = seg[eff.key];
                const barY = round(rowY + 8 + ei * subH);
                const vx = round(x(v));
                const bx = Math.min(zeroX, vx);
                const bw = Math.max(1, Math.abs(vx - zeroX));
                const h = Math.max(2, round(subH - 3));
                return (
                  <g
                    key={eff.key}
                    data-testid="effect-bar"
                    data-effect={eff.key}
                    data-value={round(v, 8)}
                  >
                    <rect
                      x={bx}
                      y={barY}
                      width={bw}
                      height={h}
                      rx={1.5}
                      fill={eff.color}
                    />
                    <text
                      x={v >= 0 ? bx + bw + 4 : bx - 4}
                      y={round(barY + h / 2)}
                      textAnchor={v >= 0 ? "start" : "end"}
                      dominantBaseline="middle"
                      className="fill-muted-foreground text-[9px] tabular-nums"
                    >
                      {formatValue(v)}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    );
  },
);
SegmentEffectsChart.displayName = "SegmentEffectsChart";

export default SegmentEffectsChart;
