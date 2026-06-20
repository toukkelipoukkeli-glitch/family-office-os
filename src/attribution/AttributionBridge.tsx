import * as React from "react";

import {
  extent,
  linearScale,
  round,
  type Margin,
} from "@/components/charts/chart-utils";
import { cn } from "@/lib/utils";
import type { AttributionView } from "@/lib/attribution/view";

export interface AttributionBridgeProps
  extends Omit<React.SVGProps<SVGSVGElement>, "children"> {
  view: AttributionView;
  width?: number;
  height?: number;
  margin?: Margin;
  /** Formats a return value (decimal) for the labels, e.g. `+0.45%`. */
  formatValue: (value: number) => string;
}

const BRIDGE_MARGIN: Margin = { top: 24, right: 12, bottom: 40, left: 12 };

interface Step {
  testId: string;
  label: string;
  /** Top and bottom of the floating bar (in return units). */
  top: number;
  bottom: number;
  kind: "total" | "allocation" | "selection" | "interaction";
  delta?: number;
}

/**
 * Active-return **bridge** (waterfall) in pure SVG.
 *
 * Starts at the benchmark return, then steps by the total allocation, selection
 * and interaction effects, landing exactly on the portfolio return — so the eye
 * sees how each decision built the active return. Two solid "total" columns
 * (benchmark, portfolio) bracket the three floating effect steps. Deterministic
 * and theme-aware.
 */
export const AttributionBridge = React.forwardRef<
  SVGSVGElement,
  AttributionBridgeProps
>(
  (
    {
      view,
      width = 720,
      height = 300,
      margin = BRIDGE_MARGIN,
      formatValue,
      className,
      ...props
    },
    ref,
  ) => {
    const m = margin;

    const b = view.benchmarkReturn;
    const afterAlloc = b + view.totalAllocation;
    const afterSelect = afterAlloc + view.totalSelection;
    const afterInteract = afterSelect + view.totalInteraction;

    const steps: Step[] = [
      {
        testId: "bridge-col-benchmark",
        label: "Benchmark",
        top: b,
        bottom: 0,
        kind: "total",
      },
      {
        testId: "bridge-col-allocation",
        label: "Allocation",
        top: Math.max(b, afterAlloc),
        bottom: Math.min(b, afterAlloc),
        kind: "allocation",
        delta: view.totalAllocation,
      },
      {
        testId: "bridge-col-selection",
        label: "Selection",
        top: Math.max(afterAlloc, afterSelect),
        bottom: Math.min(afterAlloc, afterSelect),
        kind: "selection",
        delta: view.totalSelection,
      },
      {
        testId: "bridge-col-interaction",
        label: "Interaction",
        top: Math.max(afterSelect, afterInteract),
        bottom: Math.min(afterSelect, afterInteract),
        kind: "interaction",
        delta: view.totalInteraction,
      },
      {
        testId: "bridge-col-portfolio",
        label: "Portfolio",
        top: view.portfolioReturn,
        bottom: 0,
        kind: "total",
      },
    ];

    const innerW = Math.max(0, width - m.left - m.right);
    const innerH = Math.max(0, height - m.top - m.bottom);

    const edges = steps.flatMap((s) => [s.top, s.bottom]);
    const dom = extent([0, ...edges]);
    const pad = (dom.max - dom.min) * 0.12 || 1;
    const y = linearScale(
      { min: dom.min - (dom.min < 0 ? pad : 0), max: dom.max + pad },
      m.top + innerH,
      m.top,
    );

    const slot = innerW / steps.length;
    const barW = round(slot * 0.6);
    const offset = (slot - barW) / 2;

    function colColor(step: Step): string {
      if (step.kind === "total") return "var(--color-chart-1)";
      const sign = (step.delta ?? 0) < 0;
      return sign ? "var(--color-chart-down)" : "var(--color-chart-up)";
    }

    return (
      <svg
        ref={ref}
        role="img"
        aria-label="active-return bridge from benchmark to portfolio"
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className={cn("text-foreground", className)}
        data-testid="attribution-bridge"
        data-active={round(view.activeReturn, 8)}
        {...props}
      >
        <line
          x1={m.left}
          x2={width - m.right}
          y1={round(y(0))}
          y2={round(y(0))}
          stroke="var(--color-chart-grid)"
          strokeWidth={1}
        />
        {steps.map((s, i) => {
          const x = round(m.left + i * slot + offset);
          const yTop = round(y(s.top));
          const yBottom = round(y(s.bottom));
          const h = Math.max(2, round(yBottom - yTop));
          const cxText = round(x + barW / 2);
          // Connector from the previous running level.
          const prev = steps[i - 1];
          const connectY =
            i === 0
              ? null
              : s.kind === "total"
                ? prev.kind === "total"
                  ? prev.top
                  : (prev.delta ?? 0) < 0
                    ? prev.bottom
                    : prev.top
                : (s.delta ?? 0) < 0
                  ? s.top
                  : s.bottom;
          return (
            <g key={s.testId} data-testid={s.testId} data-kind={s.kind}>
              {connectY !== null && (
                <line
                  x1={round(m.left + (i - 1) * slot + offset + barW)}
                  x2={x}
                  y1={round(y(connectY))}
                  y2={round(y(connectY))}
                  stroke="var(--color-chart-grid)"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
              )}
              <rect
                x={x}
                y={yTop}
                width={barW}
                height={h}
                rx={2}
                fill={colColor(s)}
                data-testid="bridge-bar"
                data-delta={s.delta ?? ""}
              />
              <text
                x={cxText}
                y={yTop - 5}
                textAnchor="middle"
                className="fill-muted-foreground text-[10px] tabular-nums"
              >
                {s.kind === "total"
                  ? formatValue(s.top)
                  : `${(s.delta ?? 0) < 0 ? "−" : "+"}${formatValue(Math.abs(s.delta ?? 0))}`}
              </text>
              <text
                x={cxText}
                y={height - 18}
                textAnchor="middle"
                className="fill-foreground text-[10px]"
              >
                {s.label}
              </text>
            </g>
          );
        })}
      </svg>
    );
  },
);
AttributionBridge.displayName = "AttributionBridge";

export default AttributionBridge;
