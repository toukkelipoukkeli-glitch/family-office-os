import { describe, expect, it } from "vitest";

import { Company } from "./company";
import {
  crossHoldingCompanies,
  opCo,
  realEstateCo,
  sampleCompanies,
  topco,
  venturesCo,
} from "./fixtures";
import { OwnershipGraph } from "./ownership-graph";
import { computeRanks, layoutOwnership } from "./ownership-layout";

describe("layoutOwnership", () => {
  it("places every company exactly once", () => {
    const layout = layoutOwnership(sampleCompanies);
    expect(layout.nodes).toHaveLength(sampleCompanies.length);
    const ids = layout.nodes.map((n) => n.id).sort();
    expect(ids).toEqual(
      ["co-opco", "co-realestate", "co-topco", "co-ventures"].sort(),
    );
  });

  it("ranks the top holding company as the only root at rank 0", () => {
    const layout = layoutOwnership(sampleCompanies);
    const roots = layout.nodes.filter((n) => n.isRoot);
    expect(roots.map((n) => n.id)).toEqual(["co-topco"]);
    expect(roots[0].rank).toBe(0);
  });

  it("ranks children strictly below their owners (longest path)", () => {
    const layout = layoutOwnership(sampleCompanies);
    const rank = new Map(layout.nodes.map((n) => [n.id, n.rank] as const));
    expect(rank.get("co-topco")).toBe(0);
    expect(rank.get("co-ventures")).toBe(1);
    expect(rank.get("co-realestate")).toBe(1);
    // opco is below ventures.
    expect(rank.get("co-opco")).toBe(2);
    expect(rank.get("co-opco")!).toBeGreaterThan(rank.get("co-ventures")!);
  });

  it("derives one edge per subsidiary relationship with the right percentage", () => {
    const layout = layoutOwnership(sampleCompanies);
    const edge = (id: string) => layout.edges.find((e) => e.id === id);
    expect(layout.edges).toHaveLength(3);
    expect(edge("sub-realestate")).toMatchObject({
      parentId: "co-topco",
      childId: "co-realestate",
      percentage: 100,
    });
    expect(edge("sub-ventures")).toMatchObject({
      parentId: "co-topco",
      childId: "co-ventures",
      percentage: 75,
    });
    expect(edge("sub-opco")).toMatchObject({
      parentId: "co-ventures",
      childId: "co-opco",
      percentage: 50,
    });
  });

  it("points every edge downward (source above target)", () => {
    const layout = layoutOwnership(sampleCompanies);
    for (const e of layout.edges) {
      expect(e.target.y).toBeGreaterThan(e.source.y);
    }
  });

  it("aligns edge endpoints with node centres", () => {
    const layout = layoutOwnership(sampleCompanies);
    const pos = new Map(
      layout.nodes.map((n) => [n.id, { x: n.x, y: n.y }] as const),
    );
    for (const e of layout.edges) {
      expect(e.source).toEqual(pos.get(e.parentId));
      expect(e.target).toEqual(pos.get(e.childId));
    }
  });

  it("is deterministic: identical input yields identical layout", () => {
    const a = layoutOwnership(sampleCompanies);
    const b = layoutOwnership(sampleCompanies);
    expect(b).toEqual(a);
  });

  it("produces positive, padded dimensions", () => {
    const layout = layoutOwnership(sampleCompanies, { padding: 60 });
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);
    // Every node sits within the bounds.
    for (const n of layout.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.x).toBeLessThanOrEqual(layout.width);
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeLessThanOrEqual(layout.height);
    }
  });

  it("respects spacing options", () => {
    const layout = layoutOwnership(sampleCompanies, {
      nodeSpacingX: 100,
      rankSpacingY: 100,
      padding: 10,
    });
    // 3 ranks => height = 2 * 100 + 2*10 = 220.
    expect(layout.rankCount).toBe(3);
    expect(layout.height).toBe(2 * 100 + 2 * 10);
  });

  it("centres each rank row about the layout mid-line", () => {
    const layout = layoutOwnership(sampleCompanies);
    const mid = layout.width / 2;
    // The single root and single leaf should be horizontally centred.
    const root = layout.nodes.find((n) => n.id === "co-topco")!;
    const leaf = layout.nodes.find((n) => n.id === "co-opco")!;
    expect(root.x).toBeCloseTo(mid, 9);
    expect(leaf.x).toBeCloseTo(mid, 9);
  });

  it("renders a cross-holding as two incoming edges on the shared child", () => {
    const layout = layoutOwnership(crossHoldingCompanies);
    const intoOpco = layout.edges.filter((e) => e.childId === "co-opco");
    expect(intoOpco).toHaveLength(2);
    expect(intoOpco.map((e) => e.parentId).sort()).toEqual(
      ["co-realestate", "co-ventures"].sort(),
    );
    // opco must rank below BOTH parents (longest path => rank 2).
    const opco = layout.nodes.find((n) => n.id === "co-opco")!;
    expect(opco.rank).toBe(2);
  });

  it("accepts a prebuilt OwnershipGraph as input", () => {
    const graph = OwnershipGraph.from(sampleCompanies);
    const layout = layoutOwnership(graph);
    expect(layout.nodes).toHaveLength(4);
  });

  it("skips edges that dangle to companies outside the graph", () => {
    // venturesCo references co-opco, but we omit opCo from the node set.
    const layout = layoutOwnership([topco, realEstateCo, venturesCo]);
    expect(layout.nodes).toHaveLength(3);
    expect(layout.edges.some((e) => e.childId === "co-opco")).toBe(false);
  });

  it("handles an empty graph without throwing", () => {
    const layout = layoutOwnership([]);
    expect(layout.nodes).toEqual([]);
    expect(layout.edges).toEqual([]);
    expect(layout.rankCount).toBe(1);
  });

  it("keeps the leaf operating company childless", () => {
    const layout = layoutOwnership(sampleCompanies);
    expect(layout.edges.some((e) => e.parentId === "co-opco")).toBe(false);
    expect(opCo.subsidiaries).toEqual([]);
  });
});

describe("computeRanks", () => {
  function ranksFor(companies: Company[]) {
    const graph = OwnershipGraph.from(companies);
    const ids = [...graph.ids()].sort();
    const owned = new Set<string>();
    for (const id of ids) {
      const c = graph.get(id);
      if (!c) continue;
      for (const sub of c.subsidiaries) {
        if (graph.get(sub.companyId)) owned.add(sub.companyId);
      }
    }
    return computeRanks(graph, ids, owned);
  }

  it("assigns root rank 0 and uses longest path for the rest", () => {
    const ranks = ranksFor(sampleCompanies);
    expect(ranks.get("co-topco")).toBe(0);
    expect(ranks.get("co-ventures")).toBe(1);
    expect(ranks.get("co-opco")).toBe(2);
  });

  it("terminates on a cyclic graph instead of looping forever", () => {
    const a = Company.parse({
      id: "a",
      name: "A",
      entityType: "corporation",
      jurisdiction: "FI",
      currency: "EUR",
      subsidiaries: [{ id: "ab", companyId: "b", percentage: "50" }],
    });
    const b = Company.parse({
      id: "b",
      name: "B",
      entityType: "corporation",
      jurisdiction: "FI",
      currency: "EUR",
      subsidiaries: [{ id: "ba", companyId: "a", percentage: "50" }],
    });
    const ranks = ranksFor([a, b]);
    // Pure cycle: seeded from the first id, both still get a finite rank.
    expect(ranks.get("a")).toBeTypeOf("number");
    expect(ranks.get("b")).toBeTypeOf("number");
  });

  it("ranks a diamond child by its longest path from the root", () => {
    const root = Company.parse({
      id: "r",
      name: "R",
      entityType: "holding_company",
      jurisdiction: "FI",
      currency: "EUR",
      subsidiaries: [
        { id: "r-a", companyId: "a", percentage: "100" },
        { id: "r-t", companyId: "t", percentage: "10" },
      ],
    });
    const a = Company.parse({
      id: "a",
      name: "A",
      entityType: "corporation",
      jurisdiction: "FI",
      currency: "EUR",
      subsidiaries: [{ id: "a-t", companyId: "t", percentage: "90" }],
    });
    const t = Company.parse({
      id: "t",
      name: "T",
      entityType: "corporation",
      jurisdiction: "FI",
      currency: "EUR",
    });
    const ranks = ranksFor([root, a, t]);
    // t reachable directly (depth 1) and via a (depth 2) => longest path 2.
    expect(ranks.get("t")).toBe(2);
  });
});
