import * as React from "react";

import { cn } from "@/lib/utils";
import { seriesColor } from "./palette";
import { treemapLayout, type TreemapNode } from "./chart-utils";

export interface TreemapDatum extends TreemapNode {
  label: string;
  color?: string;
}

export interface TreemapProps
  extends Omit<React.SVGProps<SVGSVGElement>, "values"> {
  data: readonly TreemapDatum[];
  width?: number;
  height?: number;
  /** Gap in px drawn between tiles (via inset). */
  padding?: number;
  /** Hide labels on tiles smaller than this area (px^2). */
  minLabelArea?: number;
}

/**
 * Treemap (slice-and-dice) in pure SVG. Tile area is proportional to value.
 * Negative values are clamped to zero. Deterministic and theme-aware.
 */
export const Treemap = React.forwardRef<SVGSVGElement, TreemapProps>(
  (
    {
      data,
      width = 480,
      height = 300,
      padding = 2,
      minLabelArea = 2400,
      className,
      ...props
    },
    ref,
  ) => {
    const tiles = treemapLayout(data, width, height);

    return (
      <svg
        ref={ref}
        role="img"
        aria-label={`treemap: ${data.map((d) => d.label).join(", ")}`}
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className={cn("h-auto max-w-full", className)}
        data-testid="treemap"
        data-tiles={tiles.length}
        {...props}
      >
        {tiles.map((t, i) => {
          const innerX = t.x + padding / 2;
          const innerY = t.y + padding / 2;
          const innerW = Math.max(0, t.width - padding);
          const innerH = Math.max(0, t.height - padding);
          const area = innerW * innerH;
          const showLabel = area >= minLabelArea;
          return (
            <g key={`tile-${i}`} data-testid="treemap-tile" data-label={data[i].label}>
              <rect
                x={innerX}
                y={innerY}
                width={innerW}
                height={innerH}
                rx={3}
                ry={3}
                fill={data[i].color ?? seriesColor(i)}
              />
              {showLabel && (
                <text
                  x={innerX + 8}
                  y={innerY + 18}
                  className="fill-background text-xs font-medium"
                  data-testid="treemap-label"
                >
                  {data[i].label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    );
  },
);
Treemap.displayName = "Treemap";

export default Treemap;
