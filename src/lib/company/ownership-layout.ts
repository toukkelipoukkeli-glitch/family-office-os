import type { Company } from "./company";
import { OwnershipGraph } from "./ownership-graph";

/**
 * Pure, deterministic layout for the cross-holding ownership network graph.
 *
 * The math here is the testable "oracle" for the visual component: given a set
 * of {@link Company} nodes it produces fixed node positions (a layered DAG
 * layout, roots at the top) and the edges between them with their direct stake
 * percentages. It performs no rendering and has no side effects, so the exact
 * geometry can be asserted in unit tests independent of React/SVG.
 *
 * READ-ONLY product: this only describes structure for display; nothing here
 * moves money, issues shares, or places trades.
 */

/** A positioned company node in the laid-out graph. */
export interface LayoutNode {
  /** Company id. */
  id: string;
  /** Display name. */
  name: string;
  /** Legal form, used for styling/legend. */
  entityType: Company["entityType"];
  /** ISO jurisdiction (e.g. "FI"). */
  jurisdiction: string;
  /** Rank (depth from the nearest root); roots are rank 0. */
  rank: number;
  /** Centre x in layout coordinates. */
  x: number;
  /** Centre y in layout coordinates. */
  y: number;
  /** True when no other node in the graph owns this one (a top-level entity). */
  isRoot: boolean;
}

/** A directed ownership edge from a parent (owner) to a child (owned). */
export interface LayoutEdge {
  /** Stable edge id (the subsidiary edge id). */
  id: string;
  /** Owner company id (edge source). */
  parentId: string;
  /** Owned company id (edge target). */
  childId: string;
  /** Direct stake percentage held by the parent in the child. */
  percentage: number;
  /** Source centre point. */
  source: { x: number; y: number };
  /** Target centre point. */
  target: { x: number; y: number };
}

export interface OwnershipLayout {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  /** Overall layout width in coordinate units. */
  width: number;
  /** Overall layout height in coordinate units. */
  height: number;
  /** Number of horizontal ranks (layers). */
  rankCount: number;
}

export interface LayoutOptions {
  /** Horizontal spacing between node centres within a rank. */
  nodeSpacingX?: number;
  /** Vertical spacing between rank centres. */
  rankSpacingY?: number;
  /** Outer padding around the whole layout. */
  padding?: number;
}

const DEFAULTS: Required<LayoutOptions> = {
  nodeSpacingX: 200,
  rankSpacingY: 140,
  padding: 60,
};

/**
 * Compute a deterministic layered layout for an ownership graph.
 *
 * Nodes are grouped into ranks (depth from roots), each rank laid out as a
 * horizontal row centred about the layout's mid-line. Within a rank, nodes keep
 * the graph's id-sorted order so the result is fully deterministic and stable
 * across runs. Edges carry the parent's direct stake in the child.
 */
export function layoutOwnership(
  companies: Company[] | OwnershipGraph,
  options: LayoutOptions = {},
): OwnershipLayout {
  const graph =
    companies instanceof OwnershipGraph
      ? companies
      : OwnershipGraph.from(companies);
  const { nodeSpacingX, rankSpacingY, padding } = { ...DEFAULTS, ...options };

  const ids = [...graph.ids()].sort();

  // Determine roots (nodes nobody in the graph owns).
  const owned = new Set<string>();
  for (const id of ids) {
    const c = graph.get(id);
    if (!c) continue;
    for (const sub of c.subsidiaries) {
      if (graph.get(sub.companyId)) owned.add(sub.companyId);
    }
  }

  const rankMap = computeRanks(graph, ids, owned);

  // Bucket ids by rank, preserving id-sorted order within each rank.
  const byRank = new Map<number, string[]>();
  let maxRank = 0;
  for (const id of ids) {
    const r = rankMap.get(id) ?? 0;
    maxRank = Math.max(maxRank, r);
    const bucket = byRank.get(r) ?? [];
    bucket.push(id);
    byRank.set(r, bucket);
  }

  const rankCount = maxRank + 1;
  const widestRank = Math.max(
    1,
    ...Array.from(byRank.values(), (b) => b.length),
  );
  const contentWidth = (widestRank - 1) * nodeSpacingX;
  const width = contentWidth + padding * 2;
  const height = (rankCount - 1) * rankSpacingY + padding * 2;

  const pos = new Map<string, { x: number; y: number }>();
  const nodes: LayoutNode[] = [];

  for (let r = 0; r < rankCount; r++) {
    const bucket = byRank.get(r) ?? [];
    const rowWidth = (bucket.length - 1) * nodeSpacingX;
    // Centre each row horizontally within the content area.
    const startX = padding + (contentWidth - rowWidth) / 2;
    const y = padding + r * rankSpacingY;
    bucket.forEach((id, i) => {
      const x = startX + i * nodeSpacingX;
      pos.set(id, { x, y });
      const c = graph.get(id)!;
      nodes.push({
        id,
        name: c.name,
        entityType: c.entityType,
        jurisdiction: c.jurisdiction,
        rank: r,
        x,
        y,
        isRoot: !owned.has(id),
      });
    });
  }

  const edges: LayoutEdge[] = [];
  for (const id of ids) {
    const c = graph.get(id);
    if (!c) continue;
    for (const sub of c.subsidiaries) {
      const childId = sub.companyId;
      const source = pos.get(id);
      const target = pos.get(childId);
      if (!source || !target) continue; // skip dangling references
      edges.push({
        id: sub.id,
        parentId: id,
        childId,
        percentage: Number(sub.percentage),
        source,
        target,
      });
    }
  }

  // Stable edge ordering for deterministic rendering and tests.
  edges.sort((a, b) => a.id.localeCompare(b.id));

  return { nodes, edges, width, height, rankCount };
}

/**
 * Longest-path rank assignment from roots. Extracted as a plain function so it
 * can be unit-tested directly. Cycle-safe via per-path visited sets.
 */
export function computeRanks(
  graph: OwnershipGraph,
  ids: string[],
  owned: Set<string>,
): Map<string, number> {
  const roots = ids.filter((id) => !owned.has(id));
  const rank = new Map<string, number>();

  const visit = (id: string, depth: number, onPath: Set<string>) => {
    const prev = rank.get(id);
    if (prev === undefined || depth > prev) rank.set(id, depth);
    const node = graph.get(id);
    if (!node) return;
    for (const sub of node.subsidiaries) {
      const childId = sub.companyId;
      if (!graph.get(childId)) continue;
      if (onPath.has(childId)) continue; // break cycles
      visit(childId, depth + 1, new Set(onPath).add(childId));
    }
  };

  // If there are no roots (pure cycle), seed from the first id so ranks exist.
  const seeds = roots.length > 0 ? roots : ids.slice(0, 1);
  for (const seed of seeds) visit(seed, 0, new Set([seed]));

  for (const id of ids) if (!rank.has(id)) rank.set(id, 0);

  return rank;
}
