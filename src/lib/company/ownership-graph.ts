import { Company } from "./company";

/**
 * A read-only ownership graph built from a set of {@link Company} nodes keyed by
 * id. Provides pure, deterministic queries over the structure (direct owners,
 * effective look-through ownership) without ever mutating state or moving value.
 */
export class OwnershipGraph {
  private readonly byId: Map<string, Company>;

  private constructor(companies: Company[]) {
    this.byId = new Map(companies.map((c) => [c.id, c]));
  }

  /**
   * Build a graph from raw input, validating every node with the {@link Company}
   * schema first. Throws if any node is invalid or if two companies share an id.
   */
  static from(companies: unknown[]): OwnershipGraph {
    const parsed = companies.map((c) => Company.parse(c));
    const ids = new Set<string>();
    for (const c of parsed) {
      if (ids.has(c.id)) {
        throw new Error(`duplicate company id in graph: ${c.id}`);
      }
      ids.add(c.id);
    }
    return new OwnershipGraph(parsed);
  }

  /** Look up a company by id, or `undefined` if it is not in the graph. */
  get(companyId: string): Company | undefined {
    return this.byId.get(companyId);
  }

  /** All company ids in the graph. */
  ids(): string[] {
    return [...this.byId.keys()];
  }

  /**
   * The percentage of `childId` directly held by `parentId` via the parent's
   * `subsidiaries` list, summing any duplicate edges. Returns 0 if there is no
   * edge or either node is missing.
   */
  directStake(parentId: string, childId: string): number {
    const parent = this.byId.get(parentId);
    if (!parent) return 0;
    return parent.subsidiaries
      .filter((s) => s.companyId === childId)
      .reduce((sum, s) => sum + Number(s.percentage), 0);
  }

  /**
   * The effective (look-through) percentage of `targetId` owned by `rootId`,
   * following subsidiary edges and multiplying percentages along each path, then
   * summing across distinct paths.
   *
   * Cycle-safe: a node already on the current path contributes nothing further,
   * so a malformed cyclic graph terminates instead of looping forever. Returns a
   * fraction in [0, 100].
   */
  effectiveOwnership(rootId: string, targetId: string): number {
    if (rootId === targetId) return 100;

    const walk = (currentId: string, onPath: Set<string>): number => {
      const node = this.byId.get(currentId);
      if (!node) return 0;
      let total = 0;
      for (const sub of node.subsidiaries) {
        if (onPath.has(sub.companyId)) continue; // break cycles
        const edge = Number(sub.percentage) / 100;
        if (sub.companyId === targetId) {
          total += edge * 100;
        } else {
          const nextPath = new Set(onPath).add(sub.companyId);
          total += edge * walk(sub.companyId, nextPath);
        }
      }
      return total;
    };

    return walk(rootId, new Set([rootId]));
  }
}
