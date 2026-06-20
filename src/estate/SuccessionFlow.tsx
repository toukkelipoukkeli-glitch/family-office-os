import * as React from "react";

import { round } from "@/components/charts/chart-utils";
import type { FlowLink, FlowNode } from "@/lib/estate";
import { cn } from "@/lib/utils";

export interface SuccessionFlowProps
  extends Omit<React.SVGProps<SVGSVGElement>, "children"> {
  nodes: FlowNode[];
  links: FlowLink[];
  width?: number;
  height?: number;
  /** Formats a flow value for the tooltips / labels. */
  formatValue: (value: number) => string;
}

const COLUMN_BY_KIND: Record<FlowNode["kind"], number> = {
  estate: 0,
  entity: 1,
  beneficiary: 2,
  tax: 2,
  settlement: 2,
};

function colorForKind(kind: FlowNode["kind"]): string {
  switch (kind) {
    case "estate":
      return "var(--color-chart-1)";
    case "entity":
      return "var(--color-chart-2)";
    case "tax":
      return "var(--color-chart-down)";
    case "settlement":
      return "var(--color-muted-foreground)";
    default:
      return "var(--color-chart-up)";
  }
}

interface PlacedNode {
  id: string;
  label: string;
  kind: FlowNode["kind"];
  x: number;
  y: number;
  w: number;
  h: number;
  /** Running offset used to stack incoming/outgoing link endpoints. */
  inCursor: number;
  outCursor: number;
  value: number;
}

/**
 * A pure-SVG Sankey-style succession flow: value runs left → right from the
 * estate, through each holding entity, to the beneficiaries (and a tax sink).
 * Node heights and ribbon widths are proportional to value, so the eye reads
 * "where does the wealth actually end up" at a glance. Deterministic layout —
 * no force simulation, no randomness — so it is fully snapshot-testable.
 */
export const SuccessionFlow = React.forwardRef<
  SVGSVGElement,
  SuccessionFlowProps
>(
  (
    { nodes, links, width = 900, height = 460, formatValue, className, ...props },
    ref,
  ) => {
    const margin = { top: 16, right: 8, bottom: 16, left: 8 };
    const innerW = Math.max(1, width - margin.left - margin.right);
    const innerH = Math.max(1, height - margin.top - margin.bottom);
    const nodeW = 14;

    // Bucket nodes by column.
    const cols: FlowNode[][] = [[], [], []];
    for (const n of nodes) cols[COLUMN_BY_KIND[n.kind]].push(n);

    // Total value through a node = max(sum of in, sum of out).
    const inSum = new Map<string, number>();
    const outSum = new Map<string, number>();
    for (const l of links) {
      const v = l.value.amount.toNumber();
      outSum.set(l.source, (outSum.get(l.source) ?? 0) + v);
      inSum.set(l.target, (inSum.get(l.target) ?? 0) + v);
    }
    const nodeValue = (id: string) =>
      Math.max(inSum.get(id) ?? 0, outSum.get(id) ?? 0);

    // One shared value→pixel scale for every column and ribbon, so equal values
    // always render at equal thickness (the Sankey "conserves value" visually).
    // The scale is bounded by the column that has the least vertical slack
    // (most inter-node gaps), so no column overflows the canvas.
    const colInnerGap = 8;
    const colValueTotals = cols.map((col) =>
      col.reduce((acc, n) => acc + nodeValue(n.id), 0),
    );
    const maxColValue = Math.max(1, ...colValueTotals);
    const minSlack = Math.min(
      ...cols.map((col) => innerH - (col.length - 1) * colInnerGap),
    );
    const sharedScale = minSlack / maxColValue;

    const placed = new Map<string, PlacedNode>();
    const colX = [
      margin.left,
      margin.left + innerW / 2 - nodeW / 2,
      margin.left + innerW - nodeW,
    ];
    cols.forEach((col, ci) => {
      const scale = sharedScale;
      const totalH =
        col.reduce((acc, n) => acc + nodeValue(n.id) * scale, 0) +
        (col.length - 1) * colInnerGap;
      let y = margin.top + (innerH - totalH) / 2;
      for (const n of col) {
        const h = Math.max(3, nodeValue(n.id) * scale);
        placed.set(n.id, {
          id: n.id,
          label: n.label,
          kind: n.kind,
          x: colX[ci],
          y,
          w: nodeW,
          h,
          inCursor: y,
          outCursor: y,
          value: nodeValue(n.id),
        });
        y += h + colInnerGap;
      }
    });

    // Build ribbons in a stable order so stacking is deterministic.
    const ordered = [...links].sort((a, b) => {
      const sa = placed.get(a.source)?.y ?? 0;
      const sb = placed.get(b.source)?.y ?? 0;
      if (sa !== sb) return sa - sb;
      return (placed.get(a.target)?.y ?? 0) - (placed.get(b.target)?.y ?? 0);
    });

    const ribbons = ordered.map((l, i) => {
      const s = placed.get(l.source);
      const t = placed.get(l.target);
      const v = l.value.amount.toNumber();
      if (!s || !t) return null;
      const w = Math.max(1, v * sharedScale);
      const y0 = s.outCursor + w / 2;
      const y1 = t.inCursor + w / 2;
      s.outCursor += w;
      t.inCursor += w;
      const x0 = s.x + s.w;
      const x1 = t.x;
      const xm = (x0 + x1) / 2;
      const d = `M${round(x0)},${round(y0)} C${round(xm)},${round(y0)} ${round(
        xm,
      )},${round(y1)} ${round(x1)},${round(y1)}`;
      return (
        <path
          key={`${l.source}->${l.target}-${i}`}
          d={d}
          fill="none"
          stroke={colorForKind(
            t.kind === "tax" || t.kind === "settlement" ? t.kind : s.kind,
          )}
          strokeWidth={round(w)}
          strokeOpacity={0.28}
          data-testid="flow-link"
          data-source={l.source}
          data-target={l.target}
        >
          <title>
            {s.label} → {t.label}: {formatValue(v)}
          </title>
        </path>
      );
    });

    return (
      <svg
        ref={ref}
        role="img"
        aria-label="estate succession flow from estate through entities to beneficiaries"
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className={cn("text-foreground", className)}
        data-testid="succession-flow"
        data-nodes={nodes.length}
        data-links={links.length}
        {...props}
      >
        {ribbons}
        {[...placed.values()].map((n) => {
          const labelLeft = n.kind === "estate";
          const labelInside = n.kind === "entity";
          return (
            <g key={n.id} data-testid="flow-node" data-kind={n.kind} data-id={n.id}>
              <rect
                x={round(n.x)}
                y={round(n.y)}
                width={n.w}
                height={round(n.h)}
                rx={2}
                fill={colorForKind(n.kind)}
              >
                <title>
                  {n.label}: {formatValue(n.value)}
                </title>
              </rect>
              <text
                x={
                  labelLeft
                    ? round(n.x + n.w + 4)
                    : labelInside
                      ? round(n.x + n.w / 2)
                      : round(n.x - 4)
                }
                y={round(n.y + n.h / 2)}
                textAnchor={labelLeft ? "start" : labelInside ? "middle" : "end"}
                dominantBaseline="middle"
                className={cn(
                  "text-[10px]",
                  labelInside ? "fill-background" : "fill-foreground",
                )}
              >
                {truncate(n.label)}
              </text>
            </g>
          );
        })}
      </svg>
    );
  },
);
SuccessionFlow.displayName = "SuccessionFlow";

function truncate(label: string, max = 22): string {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

export default SuccessionFlow;
