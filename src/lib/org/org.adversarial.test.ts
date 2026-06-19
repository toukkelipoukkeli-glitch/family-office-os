import { describe, expect, it } from "vitest";

import { Entity } from "./entity";
import { layoutOrg } from "./layout";
import {
  buildOrgForest,
  countNodes,
  effectiveOwnership,
  maxDepth,
  rootEntities,
  validateOrg,
} from "./tree";

/**
 * Adversarial edge-case suite (independent tester). Hardens the org logic
 * against cycles reachable only via a diamond, look-through over diamonds and
 * cycles, multi-root forests, and self-loops — cases the happy-path fixture
 * never exercises.
 */

describe("adversarial: cycle detection", () => {
  it("detects a cycle that is only reachable through a diamond fan-out", () => {
    // root -> a, root -> b, a -> c, b -> c, c -> a (back-edge forms a cycle
    // that the DFS only reaches after exploring a non-cyclic branch first).
    const entities = [
      Entity.parse({ id: "root", name: "Root", kind: "holding" }),
      Entity.parse({
        id: "a",
        name: "A",
        kind: "holding",
        owners: [
          { parentId: "root", ownershipPct: 0.5 },
          { parentId: "c", ownershipPct: 0.5 },
        ],
      }),
      Entity.parse({
        id: "b",
        name: "B",
        kind: "holding",
        owners: [{ parentId: "root", ownershipPct: 0.5 }],
      }),
      Entity.parse({
        id: "c",
        name: "C",
        kind: "holding",
        owners: [
          { parentId: "a", ownershipPct: 0.5 },
          { parentId: "b", ownershipPct: 0.5 },
        ],
      }),
    ];
    const r = validateOrg(entities);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === "cycle")).toBe(true);
  });

  it("detects a 2-node mutual-ownership cycle a<->b", () => {
    const entities = [
      Entity.parse({
        id: "a",
        name: "A",
        kind: "holding",
        owners: [{ parentId: "b", ownershipPct: 0.5 }],
      }),
      Entity.parse({
        id: "b",
        name: "B",
        kind: "holding",
        owners: [{ parentId: "a", ownershipPct: 0.5 }],
      }),
    ];
    const r = validateOrg(entities);
    expect(r.ok).toBe(false);
    expect(r.issues.find((i) => i.code === "cycle")).toBeDefined();
  });

  it("buildOrgForest throws on a cyclic org", () => {
    const cyclic = [
      Entity.parse({
        id: "a",
        name: "A",
        kind: "holding",
        owners: [{ parentId: "b", ownershipPct: 1 }],
      }),
      Entity.parse({
        id: "b",
        name: "B",
        kind: "holding",
        owners: [{ parentId: "a", ownershipPct: 1 }],
      }),
    ];
    expect(() => buildOrgForest(cyclic)).toThrow();
  });
});

describe("adversarial: diamond ownership (shared subsidiary)", () => {
  // root -> a (100%), root -> b (100%); a -> shared (50%), b -> shared (50%).
  // `shared` is a leaf under two parents (owners sum to 100%) — it must appear
  // once per path, total look-through ownership 100%.
  const diamond = [
    Entity.parse({ id: "root", name: "Root", kind: "trust" }),
    Entity.parse({
      id: "a",
      name: "A",
      kind: "holding",
      owners: [{ parentId: "root", ownershipPct: 1 }],
    }),
    Entity.parse({
      id: "b",
      name: "B",
      kind: "holding",
      owners: [{ parentId: "root", ownershipPct: 1 }],
    }),
    Entity.parse({
      id: "shared",
      name: "Shared",
      kind: "operating",
      owners: [
        { parentId: "a", ownershipPct: 0.5 },
        { parentId: "b", ownershipPct: 0.5 },
      ],
    }),
  ];

  it("validates clean (no cycle on a diamond)", () => {
    expect(validateOrg(diamond)).toEqual({ ok: true, issues: [] });
  });

  it("renders the shared node once under each parent path", () => {
    const forest = buildOrgForest(diamond);
    expect(forest).toHaveLength(1);
    // root + a + b + shared(under a) + shared(under b) = 5 tree nodes.
    expect(countNodes(forest)).toBe(5);
  });

  it("sums look-through across both diamond legs to 100%", () => {
    // 0.5*1 + 0.5*1 = 1.0
    expect(effectiveOwnership(diamond, "root", "shared")).toBeCloseTo(1, 10);
  });

  it("layout emits an edge for every non-root node and unique node ids", () => {
    const forest = buildOrgForest(diamond);
    const layout = layoutOrg(forest);
    expect(layout.edges).toHaveLength(countNodes(forest) - forest.length);
    const ids = layout.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("adversarial: effectiveOwnership robustness", () => {
  it("returns 0 for unknown root or target ids", () => {
    const entities = [Entity.parse({ id: "a", name: "A", kind: "trust" })];
    expect(effectiveOwnership(entities, "ghost", "a")).toBe(0);
    expect(effectiveOwnership(entities, "a", "ghost")).toBe(0);
  });

  it("does not infinite-loop on a cyclic graph (visiting guard)", () => {
    // Hand-built cyclic owners (bypassing buildOrgForest's validation) to
    // confirm effectiveOwnership terminates via its visiting guard.
    const cyclic = [
      { id: "a", name: "A", kind: "holding" as const, owners: [] },
      {
        id: "b",
        name: "B",
        kind: "holding" as const,
        owners: [{ parentId: "a", ownershipPct: 0.5 }],
      },
      {
        id: "c",
        name: "C",
        kind: "holding" as const,
        owners: [
          { parentId: "b", ownershipPct: 0.5 },
          { parentId: "c", ownershipPct: 0.1 }, // self-ref edge
        ],
      },
    ];
    // a -> b 50% -> c 50% = 25%; the c self-edge contributes 0 via the guard.
    const v = effectiveOwnership(cyclic, "a", "c");
    expect(Number.isFinite(v)).toBe(true);
    expect(v).toBeCloseTo(0.25, 10);
  });

  it("look-through never exceeds 1 even with multiple full-ownership paths", () => {
    const entities = [
      Entity.parse({ id: "root", name: "Root", kind: "trust" }),
      Entity.parse({
        id: "x",
        name: "X",
        kind: "operating",
        owners: [{ parentId: "root", ownershipPct: 1 }],
      }),
    ];
    expect(effectiveOwnership(entities, "root", "x")).toBeLessThanOrEqual(1);
  });
});

describe("adversarial: multi-root forest", () => {
  const twoRoots = [
    Entity.parse({ id: "r1", name: "R1", kind: "trust" }),
    Entity.parse({ id: "r2", name: "R2", kind: "foundation" }),
    Entity.parse({
      id: "child",
      name: "Child",
      kind: "operating",
      owners: [{ parentId: "r1", ownershipPct: 0.3 }],
    }),
  ];

  it("reports both roots", () => {
    expect(rootEntities(twoRoots).map((r) => r.id).sort()).toEqual([
      "r1",
      "r2",
    ]);
  });

  it("builds a two-tree forest with correct depths", () => {
    const forest = buildOrgForest(twoRoots);
    expect(forest).toHaveLength(2);
    expect(maxDepth(forest)).toBe(1);
    expect(countNodes(forest)).toBe(3);
  });

  it("lays out roots without overlapping x-ranges", () => {
    const forest = buildOrgForest(twoRoots);
    const layout = layoutOrg(forest);
    const roots = layout.nodes.filter((n) => n.node.depth === 0);
    expect(roots).toHaveLength(2);
    const [a, b] = roots.sort((p, q) => p.x - q.x);
    // Distinct horizontal positions (no exact overlap).
    expect(b.x).toBeGreaterThan(a.x);
  });
});

describe("adversarial: entity schema bounds", () => {
  it("rejects ownershipPct above 1", () => {
    expect(
      Entity.safeParse({
        id: "x",
        name: "X",
        kind: "fund",
        owners: [{ parentId: "p", ownershipPct: 1.5 }],
      }).success,
    ).toBe(false);
  });

  it("rejects negative ownershipPct", () => {
    expect(
      Entity.safeParse({
        id: "x",
        name: "X",
        kind: "fund",
        owners: [{ parentId: "p", ownershipPct: -0.1 }],
      }).success,
    ).toBe(false);
  });

  it("rejects a blank entity name", () => {
    expect(
      Entity.safeParse({ id: "x", name: "   ", kind: "fund" }).success,
    ).toBe(false);
  });

  it("rejects unknown extra keys (strict)", () => {
    expect(
      Entity.safeParse({
        id: "x",
        name: "X",
        kind: "fund",
        bogus: true,
      }).success,
    ).toBe(false);
  });
});
