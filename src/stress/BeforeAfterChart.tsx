import * as React from "react";

import { linearScale, round, type Margin } from "@/components/charts/chart-utils";
import { cn } from "@/lib/utils";
import type { StressResult } from "@/lib/stress";

export interface BeforeAfterChartProps
  extends Omit<React.SVGProps<SVGSVGElement>, "children"> {
  /** The historical-scenario results to plot, in display order. */
  results: readonly StressResult[];
  width?: number;
  height?: number;
  margin?: Margin;
  /** Net worth today (the shared "before" value across every scenario). */
  netWorthToday: number;
  /** Formats a net-worth value for the column labels. */
  formatValue: (value: number) => string;
  /** Formats a percentage drawdown for the per-scenario label. */
  formatPct: (value: number) => string;
}

const BA_MARGIN: Margin = { top: 24, right: 12, bottom: 44, left: 12 };

/**
 * Before/after net-worth comparison in pure SVG.
 *
 * One grouped pair of bars per historical scenario: a muted "before" bar at
 * today's net worth and a coloured "after" bar at the shocked net worth, with
 * the drawdown percentage labelled above each pair. A dashed reference line
 * marks today's net worth so the eye reads the gap each crisis would open.
 * Deterministic and theme-aware.
 */
export const BeforeAfterChart = React.forwardRef<
  SVGSVGElement,
  BeforeAfterChartProps
>(
  (
    {
      results,
      width = 720,
      height = 320,
      margin = BA_MARGIN,
      netWorthToday,
      formatValue,
      formatPct,
      className,
      ...props
    },
    ref,
  ) => {
    const m = margin;
    const innerW = Math.max(0, width - m.left - m.right);
    const innerH = Math.max(0, height - m.top - m.bottom);

    // Domain runs from 0 up to today's net worth (the tallest bar is the
    // shared "before"). Pad the top so labels above the bars are not clipped.
    const top = netWorthToday * 1.04 || 1;
    const y = linearScale({ min: 0, max: top }, m.top + innerH, m.top);
    const baseY = round(y(0));
    const todayY = round(y(netWorthToday));

    const n = Math.max(1, results.length);
    const slot = innerW / n;
    // Two bars per group with a small inner gap.
    const groupW = slot * 0.62;
    const barGap = groupW * 0.12;
    const barW = (groupW - barGap) / 2;
    const groupOffset = (slot - groupW) / 2;

    return (
      <svg
        ref={ref}
        role="img"
        aria-label="before and after net worth under each historical stress scenario"
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className={cn("text-foreground", className)}
        data-testid="before-after-chart"
        data-scenarios={results.length}
        {...props}
      >
        {/* Today's net worth reference line. */}
        <line
          x1={m.left}
          x2={width - m.right}
          y1={todayY}
          y2={todayY}
          stroke="var(--color-chart-grid)"
          strokeWidth={1}
          strokeDasharray="4 4"
        />
        <text
          x={width - m.right}
          y={todayY - 4}
          textAnchor="end"
          className="fill-muted-foreground text-[10px] tabular-nums"
        >
          Today {formatValue(netWorthToday)}
        </text>

        {results.map((r, i) => {
          const gx = round(m.left + i * slot + groupOffset);
          const beforeX = gx;
          const afterX = round(gx + barW + barGap);
          const afterTopY = round(y(r.netWorthAfter));
          const beforeH = Math.max(2, baseY - todayY);
          const afterH = Math.max(2, baseY - afterTopY);
          const cx = round(gx + groupW / 2);
          return (
            <g
              key={r.scenario.id}
              data-testid="before-after-group"
              data-scenario={r.scenario.id}
            >
              {/* Before bar (today's net worth) — muted. */}
              <rect
                x={beforeX}
                y={todayY}
                width={round(barW)}
                height={round(beforeH)}
                rx={2}
                fill="var(--color-chart-1)"
                opacity={0.28}
                data-testid="ba-bar-before"
              />
              {/* After bar (shocked net worth) — drawdown colour. */}
              <rect
                x={afterX}
                y={afterTopY}
                width={round(barW)}
                height={round(afterH)}
                rx={2}
                fill="var(--color-chart-down)"
                data-testid="ba-bar-after"
                data-after={round(r.netWorthAfter)}
              />
              {/* Drawdown % above the group. */}
              <text
                x={cx}
                y={afterTopY - 6}
                textAnchor="middle"
                className="fill-[var(--color-chart-down)] text-[11px] font-semibold tabular-nums"
              >
                {formatPct(r.drawdownPct)}
              </text>
              {/* Period label below the axis. */}
              <text
                x={cx}
                y={height - 24}
                textAnchor="middle"
                className="fill-foreground text-[11px] font-medium"
              >
                {r.scenario.period}
              </text>
              <text
                x={cx}
                y={height - 10}
                textAnchor="middle"
                className="fill-muted-foreground text-[9px] tabular-nums"
              >
                {formatValue(r.netWorthAfter)}
              </text>
            </g>
          );
        })}
      </svg>
    );
  },
);
BeforeAfterChart.displayName = "BeforeAfterChart";

export default BeforeAfterChart;
