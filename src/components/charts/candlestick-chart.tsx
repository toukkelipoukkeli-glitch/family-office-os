import * as React from "react";

import { cn } from "@/lib/utils";
import {
  candlestickLayout,
  DEFAULT_MARGIN,
  type Candle,
  type Margin,
} from "./chart-utils";

export interface CandlestickDatum extends Candle {
  /** Optional period label (e.g. a date), surfaced as a data attribute. */
  label?: string;
}

export interface CandlestickChartProps
  extends Omit<React.SVGProps<SVGSVGElement>, "values"> {
  data: readonly CandlestickDatum[];
  width?: number;
  height?: number;
  gapRatio?: number;
  margin?: Margin;
  wickWidth?: number;
}

/**
 * OHLC candlestick chart in pure SVG. Bullish (close >= open) candles use the
 * "up" theme colour, bearish use the "down" colour. Deterministic and offline.
 */
export const CandlestickChart = React.forwardRef<
  SVGSVGElement,
  CandlestickChartProps
>(
  (
    {
      data,
      width = 480,
      height = 240,
      gapRatio = 0.3,
      margin = DEFAULT_MARGIN,
      wickWidth = 1,
      className,
      ...props
    },
    ref,
  ) => {
    const candles = candlestickLayout(data, width, height, margin, gapRatio);

    return (
      <svg
        ref={ref}
        role="img"
        aria-label="candlestick chart"
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className={cn("h-auto max-w-full", className)}
        data-testid="candlestick-chart"
        data-candles={candles.length}
        {...props}
      >
        {candles.map((c, i) => {
          const color = c.bullish
            ? "var(--color-chart-up)"
            : "var(--color-chart-down)";
          return (
            <g
              key={`candle-${i}`}
              data-testid="candle"
              data-direction={c.bullish ? "up" : "down"}
              data-label={data[i].label}
            >
              <line
                x1={c.cx}
                x2={c.cx}
                y1={c.highY}
                y2={c.lowY}
                stroke={color}
                strokeWidth={wickWidth}
                data-testid="candle-wick"
              />
              <rect
                x={c.bodyX}
                y={c.bodyY}
                width={c.bodyWidth}
                height={c.bodyHeight}
                fill={color}
                data-testid="candle-body"
              />
            </g>
          );
        })}
      </svg>
    );
  },
);
CandlestickChart.displayName = "CandlestickChart";

export default CandlestickChart;
