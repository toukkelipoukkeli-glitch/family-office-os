import { describe, expect, it } from "vitest";

import { Entity, entityKindLabel, ENTITY_KINDS } from "./entity";
import { ORG_FIXTURE } from "./fixtures";
import { layoutOrg } from "./layout";
import {
  buildOrgForest,
  countNodes,
  effectiveOwnership,
  maxDepth,
  rootEntities,
  validateOrg,
} from "./tree";

describe("Entity schema", () => {
  it("parses every fixture entity", () => {
    expect(ORG_FIXTURE).toHaveLength(8);
    for (const e of ORG_FIXTURE) {
      expect(typeof e.id).toBe("string");
    }
  });

  it("rejects self-ownership", () => {
    const result = Entity.safeParse({
      id: "x",
      name: "X",
      kind: "holding",
      owners: [{ parentId: "x", ownershipPct: 1 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate owner edges", () => {
    const result = Entity.safeParse({
      id: "x",
      name: "X",
      kind: "holding",
      owners: [
        { parentId: "p", ownershipPct: 0.5 },
        { parentId: "p", ownershipPct: 0.5 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects ownership summing above 100%", () => {
    const result = Entity.safeParse({
      id: "x",
      name: "X",
      kind: "holding",
      owners: [
        { parentId: "a", ownershipPct: 0.7 },
        { parentId: "b", ownershipPct: 0.5 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("accepts ownership summing to exactly 100% across owners", () => {
    const result = Entity.safeParse({
      id: "x",
      name: "X",
      kind: "fund",
      owners: [
        { parentId: "a", ownershipPct: 0.5 },
        { parentId: "b", ownershipPct: 0.5 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("has a label for every kind", () => {
    for (const kind of ENTITY_KINDS) {
      expect(entityKindLabel(kind)).toMatch(/\S/);
    }
  });
});

describe("validateOrg", () => {
  it("passes the clean fixture", () => {
    expect(validateOrg(ORG_FIXTURE)).toEqual({ ok: true, issues: [] });
  });

  it("flags an empty list", () => {
    const r = validateOrg([]);
    expect(r.ok).toBe(false);
    expect(r.issues[0].code).toBe("empty");
  });

  it("flags a dangling parent reference", () => {
    const bad = [
      Entity.parse({ id: "root", name: "Root", kind: "trust" }),
      Entity.parse({
        id: "child",
        name: "Child",
        kind: "operating",
        owners: [{ parentId: "ghost", ownershipPct: 1 }],
      }),
    ];
    const r = validateOrg(bad);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === "dangling-parent")).toBe(true);
  });

  it("detects an ownership cycle", () => {
    // a -> b -> c -> a
    const cyclic = [
      Entity.parse({
        id: "a",
        name: "A",
        kind: "holding",
        owners: [{ parentId: "c", ownershipPct: 1 }],
      }),
      Entity.parse({
        id: "b",
        name: "B",
        kind: "holding",
        owners: [{ parentId: "a", ownershipPct: 1 }],
      }),
      Entity.parse({
        id: "c",
        name: "C",
        kind: "holding",
        owners: [{ parentId: "b", ownershipPct: 1 }],
      }),
    ];
    const r = validateOrg(cyclic);
    expect(r.ok).toBe(false);
    const cycle = r.issues.find((i) => i.code === "cycle");
    expect(cycle).toBeDefined();
    expect(cycle!.entityIds.sort()).toEqual(["a", "b", "c"]);
  });

  it("flags duplicate ids", () => {
    const dup = [
      Entity.parse({ id: "a", name: "A", kind: "trust" }),
      Entity.parse({ id: "a", name: "A2", kind: "trust" }),
    ];
    const r = validateOrg(dup);
    expect(r.issues.some((i) => i.code === "duplicate-id")).toBe(true);
  });
});

describe("rootEntities", () => {
  it("finds the single trust root in the fixture", () => {
    const roots = rootEntities(ORG_FIXTURE);
    expect(roots.map((r) => r.id)).toEqual(["trust"]);
  });
});

describe("buildOrgForest", () => {
  it("builds a forest with one root from the fixture", () => {
    const forest = buildOrgForest(ORG_FIXTURE);
    expect(forest).toHaveLength(1);
    expect(forest[0].entity.id).toBe("trust");
    expect(forest[0].depth).toBe(0);
    expect(forest[0].effectivePct).toBe(1);
  });

  it("nests subsidiaries correctly", () => {
    const forest = buildOrgForest(ORG_FIXTURE);
    const holdco = forest[0].children[0];
    expect(holdco.entity.id).toBe("holdco");
    const childIds = holdco.children.map((c) => c.entity.id).sort();
    expect(childIds).toEqual(["aurora", "harbor", "meridian"]);
  });

  it("counts all nodes and computes max depth", () => {
    const forest = buildOrgForest(ORG_FIXTURE);
    expect(countNodes(forest)).toBe(8);
    // trust(0) -> holdco(1) -> meridian(2) -> meridian-spv(3)
    expect(maxDepth(forest)).toBe(3);
  });

  it("computes effective ownership along the path", () => {
    const forest = buildOrgForest(ORG_FIXTURE);
    const holdco = forest[0].children[0];
    const harbor = holdco.children.find((c) => c.entity.id === "harbor")!;
    // trust 100% -> holdco 100% -> harbor 60%
    expect(harbor.edgePct).toBeCloseTo(0.6, 10);
    expect(harbor.effectivePct).toBeCloseTo(0.6, 10);
    const pier9 = harbor.children.find((c) => c.entity.id === "pier9")!;
    // ... -> harbor 60% -> pier9 100% = 60%
    expect(pier9.effectivePct).toBeCloseTo(0.6, 10);
    const aurora = holdco.children.find((c) => c.entity.id === "aurora")!;
    const auroraClimate = aurora.children[0];
    // holdco -> aurora 75% -> climate 50% = 37.5%
    expect(auroraClimate.effectivePct).toBeCloseTo(0.375, 10);
  });

  it("throws on an invalid org", () => {
    expect(() => buildOrgForest([])).toThrow();
  });
});

describe("effectiveOwnership look-through", () => {
  it("is 1 for self", () => {
    expect(effectiveOwnership(ORG_FIXTURE, "holdco", "holdco")).toBe(1);
  });

  it("returns 0 when no path exists", () => {
    expect(effectiveOwnership(ORG_FIXTURE, "meridian", "harbor")).toBe(0);
  });

  it("multiplies fractions along a single path", () => {
    // holdco -> aurora 75% -> climate 50% = 37.5%
    expect(
      effectiveOwnership(ORG_FIXTURE, "holdco", "aurora-climate"),
    ).toBeCloseTo(0.375, 10);
  });

  it("sums across multiple ownership paths", () => {
    // Two owners both rolling up to the same root.
    const entities = [
      Entity.parse({ id: "root", name: "Root", kind: "holding" }),
      Entity.parse({
        id: "mid1",
        name: "Mid1",
        kind: "holding",
        owners: [{ parentId: "root", ownershipPct: 0.5 }],
      }),
      Entity.parse({
        id: "mid2",
        name: "Mid2",
        kind: "holding",
        owners: [{ parentId: "root", ownershipPct: 0.5 }],
      }),
      Entity.parse({
        id: "target",
        name: "Target",
        kind: "operating",
        owners: [
          { parentId: "mid1", ownershipPct: 0.4 },
          { parentId: "mid2", ownershipPct: 0.4 },
        ],
      }),
    ];
    // 0.5*0.4 + 0.5*0.4 = 0.4
    expect(effectiveOwnership(entities, "root", "target")).toBeCloseTo(0.4, 10);
  });
});

describe("layoutOrg", () => {
  it("produces a node per tree node and an edge per parent-child", () => {
    const forest = buildOrgForest(ORG_FIXTURE);
    const layout = layoutOrg(forest);
    expect(layout.nodes).toHaveLength(countNodes(forest));
    // edges = nodes - roots
    expect(layout.edges).toHaveLength(countNodes(forest) - forest.length);
  });

  it("places deeper nodes lower on the canvas", () => {
    const forest = buildOrgForest(ORG_FIXTURE);
    const layout = layoutOrg(forest);
    const root = layout.nodes.find((n) => n.node.depth === 0)!;
    const deepest = layout.nodes.reduce((a, b) =>
      b.node.depth > a.node.depth ? b : a,
    );
    expect(deepest.y).toBeGreaterThan(root.y);
  });

  it("keeps all nodes within the reported canvas bounds", () => {
    const forest = buildOrgForest(ORG_FIXTURE);
    const layout = layoutOrg(forest);
    for (const n of layout.nodes) {
      expect(n.x - n.width / 2).toBeGreaterThanOrEqual(0);
      expect(n.x + n.width / 2).toBeLessThanOrEqual(layout.width + 0.01);
      expect(n.y + n.height).toBeLessThanOrEqual(layout.height + 0.01);
    }
  });

  it("centers a parent over its children", () => {
    const forest = buildOrgForest(ORG_FIXTURE);
    const layout = layoutOrg(forest);
    const holdco = layout.nodes.find((n) => n.node.entity.id === "holdco")!;
    const childXs = layout.edges
      .filter((e) => e.fromId === holdco.id)
      .map((e) => e.x2);
    expect(childXs.length).toBe(3);
    const min = Math.min(...childXs);
    const max = Math.max(...childXs);
    expect(holdco.x).toBeGreaterThanOrEqual(min - 0.01);
    expect(holdco.x).toBeLessThanOrEqual(max + 0.01);
  });

  it("carries the edge ownership fraction on each edge", () => {
    const forest = buildOrgForest(ORG_FIXTURE);
    const layout = layoutOrg(forest);
    const harborEdge = layout.edges.find((e) => e.toId.endsWith("/harbor"))!;
    expect(harborEdge.pct).toBeCloseTo(0.6, 10);
  });
});
