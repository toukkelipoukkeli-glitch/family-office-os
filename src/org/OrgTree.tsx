import * as React from "react";

import {
  buildOrgForest,
  entityKindLabel,
  layoutOrg,
  type Entity,
  type LayoutNode,
} from "@/lib/org";
import { cn } from "@/lib/utils";

import { formatNav, formatPct, kindColor } from "./org-format";

export interface OrgTreeProps {
  entities: readonly Entity[];
  /** Currently selected entity id (highlighted). */
  selectedId?: string | null;
  /** Called with the entity id when a node is clicked. */
  onSelect?: (id: string) => void;
  className?: string;
}

/**
 * Org-hierarchy / subsidiary tree as a pure SVG tidy-tree. Nodes are coloured
 * by entity kind, edges are labelled with the ownership percentage, and the
 * whole thing is laid out deterministically via {@link layoutOrg} so it is
 * stable across renders and machine-checkable.
 */
export function OrgTree({
  entities,
  selectedId,
  onSelect,
  className,
}: OrgTreeProps) {
  const { layout } = React.useMemo(() => {
    const forest = buildOrgForest(entities);
    return { layout: layoutOrg(forest) };
  }, [entities]);

  return (
    <div className={cn("w-full overflow-x-auto", className)} data-testid="org-tree">
      <svg
        role="group"
        aria-label="Subsidiary ownership tree"
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        width={layout.width}
        height={layout.height}
        data-node-count={layout.nodes.length}
        data-edge-count={layout.edges.length}
        className="max-w-none"
      >
        {/* Connector edges drawn first so nodes sit on top. */}
        <g data-testid="org-edges">
          {layout.edges.map((edge) => {
            const midY = (edge.y1 + edge.y2) / 2;
            const path = `M ${edge.x1} ${edge.y1} C ${edge.x1} ${midY}, ${edge.x2} ${midY}, ${edge.x2} ${edge.y2}`;
            return (
              <g key={`${edge.fromId}->${edge.toId}`} data-testid="org-edge">
                <path
                  d={path}
                  fill="none"
                  stroke="var(--color-border)"
                  strokeWidth={1.5}
                />
                <rect
                  x={(edge.x1 + edge.x2) / 2 - 20}
                  y={midY - 9}
                  width={40}
                  height={18}
                  rx={9}
                  fill="var(--color-muted)"
                />
                <text
                  x={(edge.x1 + edge.x2) / 2}
                  y={midY + 4}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[10px] font-medium tabular-nums"
                  data-testid="org-edge-label"
                >
                  {formatPct(edge.pct)}
                </text>
              </g>
            );
          })}
        </g>

        {/* Entity nodes. */}
        <g data-testid="org-nodes">
          {layout.nodes.map((ln) => (
            <OrgNodeBox
              key={ln.id}
              ln={ln}
              selected={ln.node.entity.id === selectedId}
              onSelect={onSelect}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}

interface OrgNodeBoxProps {
  ln: LayoutNode;
  selected: boolean;
  onSelect?: (id: string) => void;
}

function OrgNodeBox({ ln, selected, onSelect }: OrgNodeBoxProps) {
  const { entity } = ln.node;
  const x = ln.x - ln.width / 2;
  const nav = formatNav(entity.nav);
  const fill = kindColor(entity.kind);

  return (
    <g
      data-testid="org-node"
      data-entity-id={entity.id}
      data-kind={entity.kind}
      data-selected={selected ? "true" : "false"}
      transform={`translate(${x}, ${ln.y})`}
      onClick={onSelect ? () => onSelect(entity.id) : undefined}
      className={onSelect ? "cursor-pointer" : undefined}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      aria-pressed={onSelect ? selected : undefined}
      aria-label={`${entity.name}, ${entityKindLabel(entity.kind)}`}
      onKeyDown={
        onSelect
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(entity.id);
              }
            }
          : undefined
      }
    >
      <rect
        width={ln.width}
        height={ln.height}
        rx={10}
        fill="var(--color-card)"
        stroke={selected ? "var(--color-ring)" : "var(--color-border)"}
        strokeWidth={selected ? 2.5 : 1}
      />
      {/* Kind accent stripe on the left. */}
      <rect width={6} height={ln.height} rx={3} fill={fill} />
      <circle cx={20} cy={20} r={5} fill={fill} />
      <text
        x={34}
        y={24}
        className="fill-foreground text-[13px] font-semibold"
        data-testid="org-node-name"
      >
        {truncate(entity.name, 20)}
      </text>
      <text x={20} y={42} className="fill-muted-foreground text-[10px]">
        {entityKindLabel(entity.kind)}
      </text>
      {nav && (
        <text
          x={ln.width - 12}
          y={42}
          textAnchor="end"
          className="fill-foreground text-[11px] font-medium tabular-nums"
          data-testid="org-node-nav"
        >
          {nav}
        </text>
      )}
      {entity.jurisdiction && (
        <text x={20} y={56} className="fill-muted-foreground text-[9px]">
          {truncate(entity.jurisdiction, 24)}
        </text>
      )}
    </g>
  );
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export default OrgTree;
