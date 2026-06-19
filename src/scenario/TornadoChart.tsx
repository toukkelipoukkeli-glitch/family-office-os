import * as React from "react";

import { round } from "@/components/charts/chart-utils";
import { cn } from "@/lib/utils";
import type { TornadoBar } from "@/lib/scenario/cockpit";

export interface TornadoChartProps
  extends Omit<React.SVGProps<SVGSVGElement>, "children" | "height"> {
  /** Tornado bars, already ordered worst-first by the cockpit model. */
  bars: readonly TornadoBar[];
  width?: number;
  /** Maps a signed value to a short label for the magnitude annotation. */
  formatValue: (value: number) => string;
}

const ROW_HEIGHT = 40;
const TOP_PAD = 8;
const BOTTOM_PAD = 8;
const SIDE_PAD = 64;

/**
 * Horizontal diverging "tornado" bar chart of scenario impacts on mean terminal
 * net worth. Each bar grows left (loss) or right (gain) from a central zero
 * axis; the scenario name sits above each bar and the magnitude beside it, so
 * long bars never collide with the labels. Bars are drawn in the order supplied
 * (the cockpit model sorts them worst-first). Pure SVG, theme-aware,
 * deterministic.
 */
export const TornadoChart = React.forwardRef<SVGSVGElement, TornadoChartProps>(
  (
    { bars, width = 560, formatValue, className, ...props },
    ref,
  ) => {
    const height = TOP_PAD + BOTTOM_PAD + bars.length * ROW_HEIGHT;
    const plotW = Math.max(0, width - SIDE_PAD * 2);
    const half = plotW / 2;
    const zeroX = SIDE_PAD + half;

    const maxAbs = bars.reduce(
      (max, b) => Math.max(max, Math.abs(b.meanDelta)),
      1,
    );
    const scale = (v: number) => (v / maxAbs) * half;

    return (
      <svg
        ref={ref}
        role="img"
        aria-label="tornado chart of scenario impacts"
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className={cn("text-foreground", className)}
        data-testid="tornado-chart"
        data-bars={bars.length}
        {...props}
      >
        {/* Central zero axis. */}
        <line
          x1={zeroX}
          x2={zeroX}
          y1={TOP_PAD}
          y2={height - BOTTOM_PAD}
          stroke="var(--color-chart-grid)"
          strokeWidth={1}
          data-testid="tornado-axis"
        />
        {bars.map((bar, i) => {
          const rowY = TOP_PAD + i * ROW_HEIGHT;
          // Name sits on the upper half of the row, bar on the lower half.
          const nameY = rowY + 13;
          const barY = rowY + 19;
          const barH = ROW_HEIGHT - 26;
          const cyBar = barY + barH / 2;
          const len = round(Math.abs(scale(bar.meanDelta)));
          const negative = bar.meanDelta < 0;
          const barX = negative ? zeroX - len : zeroX;
          const barColor = negative
            ? "var(--color-chart-down)"
            : "var(--color-chart-up)";
          const labelX = negative ? barX - 6 : barX + len + 6;
          return (
            <g
              key={bar.scenarioId}
              data-testid="tornado-row"
              data-scenario={bar.scenarioId}
              data-mean-delta={bar.meanDelta}
            >
              <text
                x={zeroX}
                y={nameY}
                textAnchor="middle"
                className="fill-foreground text-xs"
              >
                {bar.scenarioName}
              </text>
              <rect
                x={round(barX)}
                y={round(barY)}
                width={Math.max(len, 1)}
                height={barH}
                rx={2}
                fill={barColor}
                data-testid="tornado-bar"
              />
              <text
                x={round(labelX)}
                y={cyBar}
                textAnchor={negative ? "end" : "start"}
                dominantBaseline="central"
                className="fill-muted-foreground text-[10px] tabular-nums"
              >
                {formatValue(bar.meanDelta)}
              </text>
            </g>
          );
        })}
      </svg>
    );
  },
);
TornadoChart.displayName = "TornadoChart";

export default TornadoChart;
