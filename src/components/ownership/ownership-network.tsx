import * as React from "react";

import type { Company } from "@/lib/company";
import {
  layoutOwnership,
  OwnershipGraph,
  type LayoutEdge,
  type LayoutNode,
  type LayoutOptions,
} from "@/lib/company";
import { cn } from "@/lib/utils";

import { entityTypeLabel } from "./entity-type-label";

const NODE_WIDTH = 148;
const NODE_HEIGHT = 56;

/** Per-entity-type accent colour, sourced from the chart palette CSS vars. */
const ENTITY_COLOR: Record<Company["entityType"], string> = {
  holding_company: "var(--color-chart-1)",
  corporation: "var(--color-chart-2)",
  llc: "var(--color-chart-3)",
  partnership: "var(--color-chart-4)",
  fund: "var(--color-chart-5)",
  trust: "var(--color-chart-1)",
  foundation: "var(--color-chart-2)",
  other: "var(--color-chart-3)",
};

export interface OwnershipNetworkProps
  extends Omit<React.SVGProps<SVGSVGElement>, "onSelect"> {
  /** Company nodes to render (or a prebuilt graph). */
  companies: Company[] | OwnershipGraph;
  /** Layout tuning passed through to {@link layoutOwnership}. */
  layoutOptions?: LayoutOptions;
  /** Currently selected company id (highlights it and its edges). */
  selectedId?: string | null;
  /** Called with a company id when a node is clicked. */
  onSelect?: (id: string) => void;
}

function nodeFill(node: LayoutNode): string {
  return ENTITY_COLOR[node.entityType] ?? "var(--color-chart-3)";
}

function edgePath(edge: LayoutEdge): string {
  const { source, target } = edge;
  // A vertical cubic bezier: leaves the bottom of the parent, enters the top of
  // the child, bowing through the vertical mid-point for a clean org-chart look.
  const sy = source.y + NODE_HEIGHT / 2;
  const ty = target.y - NODE_HEIGHT / 2;
  const midY = (sy + ty) / 2;
  return `M ${source.x} ${sy} C ${source.x} ${midY}, ${target.x} ${midY}, ${target.x} ${ty}`;
}

/**
 * Cross-holding ownership network graph in pure SVG.
 *
 * Renders the family-office ownership structure as a layered directed graph:
 * companies are boxes, subsidiary relationships are downward edges labelled with
 * the direct stake percentage, and the whole thing is positioned by the
 * deterministic {@link layoutOwnership} oracle. Clicking a node selects it,
 * highlighting the node and the edges touching it.
 *
 * READ-ONLY: this only visualizes structure; nothing here moves money.
 */
export const OwnershipNetwork = React.forwardRef<
  SVGSVGElement,
  OwnershipNetworkProps
>(
  (
    { companies, layoutOptions, selectedId, onSelect, className, ...props },
    ref,
  ) => {
    const layout = React.useMemo(
      () => layoutOwnership(companies, layoutOptions),
      [companies, layoutOptions],
    );

    const isEdgeActive = (e: LayoutEdge) =>
      selectedId != null &&
      (e.parentId === selectedId || e.childId === selectedId);

    return (
      <svg
        ref={ref}
        role="img"
        aria-label="Ownership network graph"
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        width={layout.width}
        height={layout.height}
        className={cn("max-w-full", className)}
        data-testid="ownership-network"
        data-node-count={layout.nodes.length}
        data-edge-count={layout.edges.length}
        data-rank-count={layout.rankCount}
        {...props}
      >
        <defs>
          <marker
            id="ownership-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-muted-foreground" />
          </marker>
        </defs>

        {/* Edges first so nodes paint on top. */}
        <g data-testid="ownership-edges">
          {layout.edges.map((e) => {
            const active = isEdgeActive(e);
            const midX = (e.source.x + e.target.x) / 2;
            const midY = (e.source.y + e.target.y) / 2;
            return (
              <g
                key={e.id}
                data-testid="ownership-edge"
                data-edge-id={e.id}
                data-parent={e.parentId}
                data-child={e.childId}
                data-percentage={e.percentage}
                data-active={active}
              >
                <path
                  d={edgePath(e)}
                  fill="none"
                  className={cn(
                    "transition-colors",
                    active ? "stroke-foreground" : "stroke-border",
                  )}
                  strokeWidth={active ? 2.5 : 1.5}
                  markerEnd="url(#ownership-arrow)"
                />
                <g transform={`translate(${midX}, ${midY})`}>
                  <rect
                    x={-22}
                    y={-11}
                    width={44}
                    height={22}
                    rx={11}
                    className="fill-background stroke-border"
                    strokeWidth={1}
                  />
                  <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="fill-foreground text-[11px] font-medium tabular-nums"
                  >
                    {e.percentage}%
                  </text>
                </g>
              </g>
            );
          })}
        </g>

        {/* Nodes. */}
        <g data-testid="ownership-nodes">
          {layout.nodes.map((n) => {
            const selected = n.id === selectedId;
            return (
              <g
                key={n.id}
                data-testid="ownership-node"
                data-node-id={n.id}
                data-rank={n.rank}
                data-root={n.isRoot}
                data-selected={selected}
                transform={`translate(${n.x - NODE_WIDTH / 2}, ${n.y - NODE_HEIGHT / 2})`}
                className={onSelect ? "cursor-pointer" : undefined}
                role={onSelect ? "button" : undefined}
                tabIndex={onSelect ? 0 : undefined}
                aria-label={`${n.name} (${entityTypeLabel(n.entityType)}, ${n.jurisdiction})`}
                onClick={onSelect ? () => onSelect(n.id) : undefined}
                onKeyDown={
                  onSelect
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onSelect(n.id);
                        }
                      }
                    : undefined
                }
              >
                <rect
                  width={NODE_WIDTH}
                  height={NODE_HEIGHT}
                  rx={10}
                  className={cn(
                    "fill-card transition-all",
                    selected ? "stroke-foreground" : "stroke-border",
                  )}
                  strokeWidth={selected ? 2.5 : 1.5}
                />
                {/* Accent stripe coloured by entity type. */}
                <rect
                  width={5}
                  height={NODE_HEIGHT}
                  rx={2.5}
                  fill={nodeFill(n)}
                  data-testid="ownership-node-accent"
                />
                <text
                  x={14}
                  y={22}
                  className="fill-card-foreground text-[12px] font-semibold"
                >
                  {n.name.length > 18 ? `${n.name.slice(0, 17)}…` : n.name}
                </text>
                <text
                  x={14}
                  y={40}
                  className="fill-muted-foreground text-[10px]"
                >
                  {entityTypeLabel(n.entityType)} · {n.jurisdiction}
                  {n.isRoot ? " · root" : ""}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    );
  },
);
OwnershipNetwork.displayName = "OwnershipNetwork";

export default OwnershipNetwork;
