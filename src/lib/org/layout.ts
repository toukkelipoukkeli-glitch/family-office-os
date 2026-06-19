import type { OrgTreeNode } from "./tree";

/**
 * Deterministic tidy-tree layout for an org forest. Produces absolute pixel
 * positions for nodes and connector edges so the SVG renderer (and tests) get
 * stable, machine-checkable coordinates with no DOM/measuring involved.
 *
 * The algorithm is a simple "leaf-packed" tidy layout: leaves are placed at
 * sequential horizontal slots, internal nodes are centered over their children,
 * and depth maps to the vertical axis (top-down org chart).
 */

export interface LayoutNode {
  id: string;
  /** The tree node this layout entry positions. */
  node: OrgTreeNode;
  /** Center x of the node box. */
  x: number;
  /** Top y of the node box. */
  y: number;
  width: number;
  height: number;
}

export interface LayoutEdge {
  fromId: string;
  toId: string;
  /** Center-bottom of the parent box. */
  x1: number;
  y1: number;
  /** Center-top of the child box. */
  x2: number;
  y2: number;
  /** Edge ownership fraction (the child's edgePct), in [0, 1]. */
  pct: number;
}

export interface OrgLayout {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
}

export interface LayoutOptions {
  nodeWidth?: number;
  nodeHeight?: number;
  /** Horizontal gap between adjacent leaf slots. */
  hGap?: number;
  /** Vertical gap between depth levels. */
  vGap?: number;
  /** Outer padding around the whole layout. */
  padding?: number;
}

const DEFAULTS: Required<LayoutOptions> = {
  nodeWidth: 168,
  nodeHeight: 64,
  hGap: 28,
  vGap: 56,
  padding: 16,
};

/** Stable per-node key so repeated entities (multi-parent) get distinct ids. */
function nodeKey(node: OrgTreeNode, path: string): string {
  return path === "" ? node.entity.id : `${path}/${node.entity.id}`;
}

/**
 * Compute a layout for an org forest. Multiple roots are laid out left-to-right
 * in the same coordinate space.
 */
export function layoutOrg(
  forest: readonly OrgTreeNode[],
  options: LayoutOptions = {},
): OrgLayout {
  const opt = { ...DEFAULTS, ...options };
  const slotWidth = opt.nodeWidth + opt.hGap;
  const rowHeight = opt.nodeHeight + opt.vGap;

  const nodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];

  // First pass: assign each subtree a horizontal slot range, depth-first.
  let nextLeafSlot = 0;

  interface Placed {
    key: string;
    centerSlot: number;
  }

  const place = (
    node: OrgTreeNode,
    parentKey: string,
    parentCenterX: number | null,
    parentBottomY: number | null,
  ): Placed => {
    const key = nodeKey(node, parentKey);

    let centerSlot: number;
    if (node.children.length === 0) {
      centerSlot = nextLeafSlot;
      nextLeafSlot += 1;
    } else {
      const childCenters = node.children.map((child) =>
        place(child, key, null, null),
      );
      const first = childCenters[0].centerSlot;
      const last = childCenters[childCenters.length - 1].centerSlot;
      centerSlot = (first + last) / 2;
    }

    const x = opt.padding + centerSlot * slotWidth + opt.nodeWidth / 2;
    const y = opt.padding + node.depth * rowHeight;

    nodes.push({
      id: key,
      node,
      x,
      y,
      width: opt.nodeWidth,
      height: opt.nodeHeight,
    });

    if (parentCenterX !== null && parentBottomY !== null) {
      edges.push({
        fromId: parentKey,
        toId: key,
        x1: parentCenterX,
        y1: parentBottomY,
        x2: x,
        y2: y,
        pct: node.edgePct,
      });
    }

    return { key, centerSlot };
  };

  // We need parent coordinates known before drawing edges; do a second pass to
  // wire edges using the placed node map.
  for (const root of forest) {
    place(root, "", null, null);
  }

  // Build edges from the nodes map (parent center-bottom -> child center-top).
  edges.length = 0;
  const byKey = new Map(nodes.map((n) => [n.id, n]));
  const wire = (node: OrgTreeNode, parentKey: string) => {
    const key = nodeKey(node, parentKey);
    const self = byKey.get(key)!;
    for (const child of node.children) {
      const childKey = nodeKey(child, key);
      const childLayout = byKey.get(childKey)!;
      edges.push({
        fromId: key,
        toId: childKey,
        x1: self.x,
        y1: self.y + self.height,
        x2: childLayout.x,
        y2: childLayout.y,
        pct: child.edgePct,
      });
      wire(child, key);
    }
  };
  for (const root of forest) wire(root, "");

  const maxRight =
    nodes.reduce((m, n) => Math.max(m, n.x + n.width / 2), 0) + opt.padding;
  const maxBottom =
    nodes.reduce((m, n) => Math.max(m, n.y + n.height), 0) + opt.padding;

  return {
    nodes,
    edges,
    width: Math.max(maxRight, opt.padding * 2 + opt.nodeWidth),
    height: Math.max(maxBottom, opt.padding * 2 + opt.nodeHeight),
  };
}
