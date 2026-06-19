import { describe, expect, it } from "vitest";

import type { OpsSnapshot } from "./ops-data";
import { opsSnapshot } from "./ops-data";
import {
  allUnits,
  countByStatus,
  milestoneProgress,
  progressPercent,
  STATUS_ORDER,
  statusLabel,
  unitsByStatus,
} from "./ops-selectors";

const fixture: OpsSnapshot = {
  generation: 2,
  updatedAt: "2026-01-01",
  phase: "test",
  heartbeat: "2026-01-01T00:00:00Z",
  milestones: [
    {
      id: "ma",
      title: "Alpha",
      units: [
        { id: "ma-1", title: "One", oracle: "unit", deps: [], status: "merged" },
        { id: "ma-2", title: "Two", oracle: "unit", deps: ["ma-1"], status: "active" },
        { id: "ma-3", title: "Three", oracle: "unit", deps: [], status: "backlog" },
      ],
    },
    {
      id: "mb",
      title: "Beta",
      units: [
        { id: "mb-1", title: "Four", oracle: "e2e", deps: [], status: "merged" },
        { id: "mb-2", title: "Five", oracle: "unit", deps: [], status: "blocked", note: "stuck" },
      ],
    },
  ],
};

describe("countByStatus", () => {
  it("tallies every status and the total", () => {
    const c = countByStatus(fixture);
    expect(c).toEqual({
      backlog: 1,
      active: 1,
      merged: 2,
      blocked: 1,
      total: 5,
    });
  });

  it("returns all zeros for an empty snapshot", () => {
    const empty: OpsSnapshot = { ...fixture, milestones: [] };
    expect(countByStatus(empty)).toEqual({
      backlog: 0,
      active: 0,
      merged: 0,
      blocked: 0,
      total: 0,
    });
  });
});

describe("progressPercent", () => {
  it("is merged/total rounded to an integer", () => {
    // 2 merged of 5 => 40%
    expect(progressPercent(fixture)).toBe(40);
  });

  it("rounds to the nearest integer", () => {
    const odd: OpsSnapshot = {
      ...fixture,
      milestones: [
        {
          id: "m",
          title: "m",
          units: [
            { id: "1", title: "a", oracle: "unit", deps: [], status: "merged" },
            { id: "2", title: "b", oracle: "unit", deps: [], status: "backlog" },
            { id: "3", title: "c", oracle: "unit", deps: [], status: "backlog" },
          ],
        },
      ],
    };
    // 1/3 = 33.33 => 33
    expect(progressPercent(odd)).toBe(33);
  });

  it("is 0 for an empty snapshot (no division by zero)", () => {
    expect(progressPercent({ ...fixture, milestones: [] })).toBe(0);
  });

  it("is 100 when everything is merged", () => {
    const done: OpsSnapshot = {
      ...fixture,
      milestones: [
        {
          id: "m",
          title: "m",
          units: [
            { id: "1", title: "a", oracle: "unit", deps: [], status: "merged" },
            { id: "2", title: "b", oracle: "unit", deps: [], status: "merged" },
          ],
        },
      ],
    };
    expect(progressPercent(done)).toBe(100);
  });
});

describe("allUnits", () => {
  it("flattens units across milestones in order", () => {
    expect(allUnits(fixture).map((u) => u.id)).toEqual([
      "ma-1",
      "ma-2",
      "ma-3",
      "mb-1",
      "mb-2",
    ]);
  });
});

describe("unitsByStatus", () => {
  it("filters to a single status preserving order", () => {
    expect(unitsByStatus(fixture, "merged").map((u) => u.id)).toEqual([
      "ma-1",
      "mb-1",
    ]);
    expect(unitsByStatus(fixture, "blocked").map((u) => u.id)).toEqual([
      "mb-2",
    ]);
    expect(unitsByStatus(fixture, "active")).toHaveLength(1);
  });
});

describe("milestoneProgress", () => {
  it("computes per-milestone counts and percent", () => {
    const mp = milestoneProgress(fixture);
    expect(mp).toHaveLength(2);

    const [alpha, beta] = mp;
    expect(alpha.milestone.id).toBe("ma");
    expect(alpha.counts.total).toBe(3);
    expect(alpha.counts.merged).toBe(1);
    expect(alpha.percent).toBe(33); // 1/3

    expect(beta.milestone.id).toBe("mb");
    expect(beta.counts.total).toBe(2);
    expect(beta.counts.merged).toBe(1);
    expect(beta.percent).toBe(50);
  });
});

describe("statusLabel", () => {
  it("maps every status to a human label", () => {
    expect(statusLabel("backlog")).toBe("Backlog");
    expect(statusLabel("active")).toBe("In progress");
    expect(statusLabel("merged")).toBe("Merged");
    expect(statusLabel("blocked")).toBe("Blocked");
  });
});

describe("bundled opsSnapshot", () => {
  it("has unique unit ids and valid dependency references", () => {
    const units = allUnits(opsSnapshot);
    const ids = units.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);

    const idSet = new Set(ids);
    for (const u of units) {
      for (const dep of u.deps) {
        expect(idSet.has(dep)).toBe(true);
      }
    }
  });

  it("only uses statuses the UI knows how to render", () => {
    const known = new Set(STATUS_ORDER);
    for (const u of allUnits(opsSnapshot)) {
      expect(known.has(u.status)).toBe(true);
    }
  });

  it("never lists a unit as its own dependency", () => {
    for (const u of allUnits(opsSnapshot)) {
      expect(u.deps).not.toContain(u.id);
    }
  });
});

describe("count invariants", () => {
  it("per-milestone counts sum to the global counts", () => {
    const global = countByStatus(fixture);
    const summed = milestoneProgress(fixture).reduce(
      (acc, { counts }) => ({
        backlog: acc.backlog + counts.backlog,
        active: acc.active + counts.active,
        merged: acc.merged + counts.merged,
        blocked: acc.blocked + counts.blocked,
        total: acc.total + counts.total,
      }),
      { backlog: 0, active: 0, merged: 0, blocked: 0, total: 0 },
    );
    expect(summed).toEqual(global);
  });

  it("status buckets partition every unit exactly once", () => {
    const counts = countByStatus(fixture);
    const bucketed = STATUS_ORDER.reduce(
      (sum, status) => sum + unitsByStatus(fixture, status).length,
      0,
    );
    expect(bucketed).toBe(counts.total);
    expect(bucketed).toBe(allUnits(fixture).length);
  });
});
