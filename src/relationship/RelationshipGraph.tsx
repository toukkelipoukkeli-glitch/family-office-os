import * as React from "react";

import { cn } from "@/lib/utils";
import {
  layoutRelationshipGraph,
  type LayoutOptions,
} from "@/lib/relationship/layout";
import {
  neighbors,
  type RelationshipGraphData,
} from "@/lib/relationship/relationship-graph";

import { KIND_COLOR } from "./kind-style";

export interface RelationshipGraphProps {
  graph: RelationshipGraphData;
  width?: number;
  height?: number;
  layoutOptions?: LayoutOptions;
  /** Currently selected node id (controlled). */
  selectedId?: string | null;
  /** Called when a node is clicked. */
  onSelect?: (id: string) => void;
  className?: string;
}

/** Truncate a label so it fits under a node without overflowing. */
function truncate(label: string, max = 16): string {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

/**
 * Pure-SVG relationship graph. Deterministic concentric-ring layout (see
 * {@link layoutRelationshipGraph}); nodes are coloured by kind and clickable.
 * Selecting a node dims everything outside its neighbourhood so the family can
 * trace who is connected to whom.
 */
export function RelationshipGraph({
  graph,
  width = 760,
  height = 600,
  layoutOptions,
  selectedId,
  onSelect,
  className,
}: RelationshipGraphProps) {
  const layout = React.useMemo(
    () => layoutRelationshipGraph(graph, { width, height, ...layoutOptions }),
    [graph, width, height, layoutOptions],
  );

  const highlighted = React.useMemo(() => {
    if (!selectedId) return null;
    const set = new Set<string>([selectedId, ...neighbors(graph, selectedId)]);
    return set;
  }, [graph, selectedId]);

  const isDimmed = (id: string) =>
    highlighted !== null && !highlighted.has(id);

  return (
    <svg
      role="img"
      aria-label="founder and investor relationship graph"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={cn("h-auto w-full", className)}
      style={{ minWidth: 560 }}
      data-testid="relationship-graph"
      data-node-count={layout.nodes.length}
      data-edge-count={layout.edges.length}
    >
      {/* Edges first so nodes draw on top. */}
      <g data-testid="relationship-edges">
        {layout.edges.map((e) => {
          const dim = isDimmed(e.source) || isDimmed(e.target);
          const mx = (e.x1 + e.x2) / 2;
          const my = (e.y1 + e.y2) / 2;
          return (
            <g
              key={e.id}
              data-testid="relationship-edge"
              data-edge-kind={e.kind}
              opacity={dim ? 0.12 : 1}
            >
              <line
                x1={e.x1}
                y1={e.y1}
                x2={e.x2}
                y2={e.y2}
                stroke="var(--color-chart-grid)"
                strokeWidth={e.kind === "subsidiary" ? 2 : 1.5}
                strokeDasharray={
                  e.kind === "owns" || e.kind === "subsidiary"
                    ? undefined
                    : "4 3"
                }
              />
              {e.label && (
                <text
                  x={mx}
                  y={my}
                  dy={-3}
                  textAnchor="middle"
                  className="fill-muted-foreground"
                  style={{ fontSize: 9 }}
                >
                  {e.label}
                </text>
              )}
            </g>
          );
        })}
      </g>

      {/* Nodes. */}
      <g data-testid="relationship-nodes">
        {layout.nodes.map((n) => {
          const dim = isDimmed(n.id);
          const selected = n.id === selectedId;
          return (
            <g
              key={n.id}
              data-testid="relationship-node"
              data-node-id={n.id}
              data-node-kind={n.kind}
              data-selected={selected ? "true" : "false"}
              transform={`translate(${n.x}, ${n.y})`}
              opacity={dim ? 0.25 : 1}
              style={{ cursor: onSelect ? "pointer" : "default" }}
              onClick={onSelect ? () => onSelect(n.id) : undefined}
            >
              <circle
                r={n.r}
                fill={KIND_COLOR[n.kind]}
                stroke={
                  selected ? "var(--color-foreground)" : "var(--color-card)"
                }
                strokeWidth={selected ? 3 : 2}
              />
              <text
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-card font-semibold"
                style={{ fontSize: 10 }}
              >
                {n.label
                  .split(/\s+/)
                  .map((w) => w[0])
                  .join("")
                  .slice(0, 3)
                  .toUpperCase()}
              </text>
              <text
                y={n.r + 12}
                textAnchor="middle"
                className="fill-foreground"
                style={{ fontSize: 11, fontWeight: 500 }}
              >
                {truncate(n.label)}
              </text>
              {n.sublabel && (
                <text
                  y={n.r + 24}
                  textAnchor="middle"
                  className="fill-muted-foreground"
                  style={{ fontSize: 9 }}
                >
                  {truncate(n.sublabel, 22)}
                </text>
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
}

export default RelationshipGraph;
