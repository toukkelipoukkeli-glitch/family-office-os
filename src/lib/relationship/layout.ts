import type {
  RelationshipEdge,
  RelationshipGraphData,
  RelationshipNode,
  RelationshipNodeKind,
} from "./relationship-graph";

/**
 * Deterministic, dependency-free layout for the relationship graph.
 *
 * We avoid a force-directed simulation (non-deterministic, hard to snapshot)
 * in favour of a stable *layered* layout: each node kind occupies its own
 * horizontal band, and nodes are spread evenly across the width within their
 * band in input order. This is fully reproducible — which keeps the Playwright
 * visual check meaningful — and avoids the overlap a radial layout produces
 * once several nodes share a small inner ring.
 */

/** A node placed at a concrete (x, y) coordinate with a draw radius. */
export interface PositionedNode extends RelationshipNode {
  x: number;
  y: number;
  /** Circle radius for drawing this node. */
  r: number;
}

/** An edge resolved to the coordinates of its endpoints. */
export interface PositionedEdge extends RelationshipEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface RelationshipLayout {
  width: number;
  height: number;
  nodes: PositionedNode[];
  edges: PositionedEdge[];
}

export interface LayoutOptions {
  width?: number;
  height?: number;
  /** Draw radius for a node circle. */
  nodeRadius?: number;
  /** Padding from the viewport edge to the outermost band. */
  padding?: number;
}

/**
 * Band ordering, top to bottom: people at the top (the principals), the
 * entities they own beneath them, then the deals those entities pursue, and
 * the founders/investors behind each deal on the bottom band. Any unknown kind
 * falls back to the bottom band.
 */
const BAND_ORDER: RelationshipNodeKind[] = [
  "person",
  "company",
  "deal",
  "contact",
];

function bandIndex(kind: RelationshipNodeKind): number {
  const i = BAND_ORDER.indexOf(kind);
  return i === -1 ? BAND_ORDER.length - 1 : i;
}

/**
 * Compute a deterministic layered layout for a graph.
 *
 * Coordinates are rounded to 2 decimals so serialised output (and DOM
 * attributes) are byte-stable across runs and platforms.
 */
export function layoutRelationshipGraph(
  graph: RelationshipGraphData,
  options: LayoutOptions = {},
): RelationshipLayout {
  const width = options.width ?? 760;
  const height = options.height ?? 600;
  const nodeRadius = options.nodeRadius ?? 24;
  const padding = options.padding ?? 56;

  const round = (v: number) => Math.round(v * 100) / 100;

  // Which bands are actually populated, top-to-bottom.
  const bandsUsed = [
    ...new Set(graph.nodes.map((n) => bandIndex(n.kind))),
  ].sort((a, b) => a - b);
  const bandRank = new Map<number, number>();
  bandsUsed.forEach((band, rank) => bandRank.set(band, rank));
  const bandCount = bandsUsed.length;

  // Group nodes by band, preserving input order within each band.
  const byBand = new Map<number, RelationshipNode[]>();
  for (const n of graph.nodes) {
    const band = bandIndex(n.kind);
    const list = byBand.get(band) ?? [];
    list.push(n);
    byBand.set(band, list);
  }

  const top = padding;
  const bottom = height - padding;
  const usableHeight = Math.max(0, bottom - top);

  const positions = new Map<string, { x: number; y: number }>();
  const positioned: PositionedNode[] = [];

  for (const [band, members] of byBand) {
    const rank = bandRank.get(band) ?? 0;
    // Vertically: evenly space bands between top and bottom. A single band
    // sits in the vertical centre.
    const y =
      bandCount <= 1
        ? round(height / 2)
        : round(top + (usableHeight * rank) / (bandCount - 1));

    // Horizontally: spread members evenly across the usable width. The half-
    // step inset keeps the first/last node off the very edge and staggers
    // adjacent bands so vertical edges aren't perfectly collinear.
    const count = members.length;
    const left = padding;
    const usableWidth = Math.max(0, width - padding * 2);
    members.forEach((node, i) => {
      const x =
        count <= 1
          ? round(width / 2)
          : round(left + (usableWidth * (i + 0.5)) / count);
      positions.set(node.id, { x, y });
      positioned.push({ ...node, x, y, r: nodeRadius });
    });
  }

  const positionedEdges: PositionedEdge[] = [];
  for (const e of graph.edges) {
    const a = positions.get(e.source);
    const b = positions.get(e.target);
    if (!a || !b) continue; // skip dangling edges defensively
    positionedEdges.push({ ...e, x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  }

  return { width, height, nodes: positioned, edges: positionedEdges };
}
