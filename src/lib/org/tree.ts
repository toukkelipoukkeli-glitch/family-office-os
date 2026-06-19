import type { Entity } from "./entity";

/**
 * Derivations over an org-hierarchy of {@link Entity} records: building the
 * subsidiary tree, validating referential integrity, detecting ownership
 * cycles, and rolling up effective ownership and value.
 *
 * All pure and deterministic so the structure math is unit-testable in
 * isolation from React.
 */

/** A node in the rendered subsidiary tree. */
export interface OrgTreeNode {
  entity: Entity;
  /**
   * Fraction (in [0, 1]) of *this* node held by its parent in the tree — the
   * ownership of the specific edge we descended. Roots are 1.
   */
  edgePct: number;
  /**
   * Effective ownership of this node by the *root* of its tree, in [0, 1].
   * The product of edge fractions along the path from the root. Roots are 1.
   */
  effectivePct: number;
  /** Depth from the root (root = 0). */
  depth: number;
  /** Child subsidiaries, in input order. */
  children: OrgTreeNode[];
}

export interface OrgValidationIssue {
  code:
    | "dangling-parent"
    | "duplicate-id"
    | "cycle"
    | "empty";
  message: string;
  /** Entity ids involved, when applicable. */
  entityIds: string[];
}

export interface OrgValidationResult {
  ok: boolean;
  issues: OrgValidationIssue[];
}

/** Index entities by id. Throws on duplicate ids. */
function indexById(entities: readonly Entity[]): Map<string, Entity> {
  const map = new Map<string, Entity>();
  for (const e of entities) map.set(e.id, e);
  return map;
}

/**
 * Validate an entity list for tree-building: no duplicate ids, every referenced
 * parent exists, and the ownership graph is acyclic. Returns all issues found
 * (does not throw) so a UI can surface them.
 */
export function validateOrg(entities: readonly Entity[]): OrgValidationResult {
  const issues: OrgValidationIssue[] = [];

  if (entities.length === 0) {
    issues.push({
      code: "empty",
      message: "no entities provided",
      entityIds: [],
    });
    return { ok: false, issues };
  }

  // Duplicate ids.
  const seen = new Set<string>();
  for (const e of entities) {
    if (seen.has(e.id)) {
      issues.push({
        code: "duplicate-id",
        message: `duplicate entity id: ${e.id}`,
        entityIds: [e.id],
      });
    }
    seen.add(e.id);
  }

  const byId = indexById(entities);

  // Dangling parent references.
  for (const e of entities) {
    for (const edge of e.owners) {
      if (!byId.has(edge.parentId)) {
        issues.push({
          code: "dangling-parent",
          message: `entity ${e.id} references unknown parent ${edge.parentId}`,
          entityIds: [e.id, edge.parentId],
        });
      }
    }
  }

  // Cycle detection over the ownership graph (edge: parent -> child).
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const e of entities) color.set(e.id, WHITE);

  const childrenOf = new Map<string, string[]>();
  for (const e of entities) {
    for (const edge of e.owners) {
      if (byId.has(edge.parentId)) {
        const arr = childrenOf.get(edge.parentId) ?? [];
        arr.push(e.id);
        childrenOf.set(edge.parentId, arr);
      }
    }
  }

  const cycleReported = new Set<string>();
  const stack: string[] = [];
  const visit = (id: string): void => {
    color.set(id, GRAY);
    stack.push(id);
    for (const child of childrenOf.get(id) ?? []) {
      const c = color.get(child);
      if (c === GRAY) {
        // Found a back-edge: extract the cycle from the stack. Record it but
        // keep scanning so DFS state is always unwound cleanly below.
        const start = stack.indexOf(child);
        const cycle = stack.slice(start);
        const key = [...cycle].sort().join(",");
        if (!cycleReported.has(key)) {
          cycleReported.add(key);
          issues.push({
            code: "cycle",
            message: `ownership cycle: ${cycle.join(" -> ")} -> ${child}`,
            entityIds: cycle,
          });
        }
        continue;
      }
      if (c === WHITE) visit(child);
    }
    stack.pop();
    color.set(id, BLACK);
  };

  for (const e of entities) {
    if (color.get(e.id) === WHITE) visit(e.id);
  }

  return { ok: issues.length === 0, issues };
}

/** Entities that have no owners — the roots (tops) of the structure. */
export function rootEntities(entities: readonly Entity[]): Entity[] {
  return entities.filter((e) => e.owners.length === 0);
}

/**
 * Build the subsidiary forest from a flat entity list. Each root entity becomes
 * a tree; an entity owned by multiple parents appears under each owner (the
 * structure is rendered as a tree per ownership path).
 *
 * Throws if the org is invalid (cycle / dangling parent / duplicate id) — call
 * {@link validateOrg} first to surface issues gracefully.
 */
export function buildOrgForest(entities: readonly Entity[]): OrgTreeNode[] {
  const validation = validateOrg(entities);
  if (!validation.ok) {
    throw new Error(
      `cannot build org tree: ${validation.issues
        .map((i) => i.message)
        .join("; ")}`,
    );
  }

  const byId = indexById(entities);

  // Map parent -> [{ childId, ownershipPct }] in input order.
  const childEdges = new Map<string, { childId: string; pct: number }[]>();
  for (const e of entities) {
    for (const edge of e.owners) {
      const arr = childEdges.get(edge.parentId) ?? [];
      arr.push({ childId: e.id, pct: edge.ownershipPct });
      childEdges.set(edge.parentId, arr);
    }
  }

  const build = (
    id: string,
    edgePct: number,
    parentEffective: number,
    depth: number,
    ancestors: Set<string>,
  ): OrgTreeNode => {
    const entity = byId.get(id)!;
    const effectivePct = parentEffective * edgePct;
    const nextAncestors = new Set(ancestors);
    nextAncestors.add(id);
    const children = (childEdges.get(id) ?? [])
      .filter((c) => !nextAncestors.has(c.childId))
      .map((c) =>
        build(c.childId, c.pct, effectivePct, depth + 1, nextAncestors),
      );
    return { entity, edgePct, effectivePct, depth, children };
  };

  return rootEntities(entities).map((root) =>
    build(root.id, 1, 1, 0, new Set()),
  );
}

/** Total number of nodes in a forest (counting repeated entities per path). */
export function countNodes(forest: readonly OrgTreeNode[]): number {
  let n = 0;
  const walk = (node: OrgTreeNode) => {
    n += 1;
    node.children.forEach(walk);
  };
  forest.forEach(walk);
  return n;
}

/** Maximum depth (number of edges on the longest root-to-leaf path). */
export function maxDepth(forest: readonly OrgTreeNode[]): number {
  let d = 0;
  const walk = (node: OrgTreeNode) => {
    d = Math.max(d, node.depth);
    node.children.forEach(walk);
  };
  forest.forEach(walk);
  return d;
}

/**
 * Effective ownership of `targetId` by `rootId`, summed across every ownership
 * path between them. Returns a fraction in [0, 1]. 0 when no path exists.
 *
 * This is the economically meaningful "look-through" ownership: if a holdco
 * owns 60% of a midco that owns 50% of a target, the holdco's effective stake
 * in the target is 30%.
 */
export function effectiveOwnership(
  entities: readonly Entity[],
  rootId: string,
  targetId: string,
): number {
  const byId = indexById(entities);
  if (!byId.has(rootId) || !byId.has(targetId)) return 0;
  if (rootId === targetId) return 1;

  // owners-of map: childId -> [{ parentId, pct }]
  const memo = new Map<string, number>();
  const visiting = new Set<string>();

  // Fraction of `id` ultimately attributable to rootId.
  const share = (id: string): number => {
    if (id === rootId) return 1;
    if (memo.has(id)) return memo.get(id)!;
    if (visiting.has(id)) return 0; // guard against cycles
    visiting.add(id);
    const entity = byId.get(id);
    let total = 0;
    if (entity) {
      for (const edge of entity.owners) {
        total += edge.ownershipPct * share(edge.parentId);
      }
    }
    visiting.delete(id);
    memo.set(id, total);
    return total;
  };

  return share(targetId);
}
