import { describe, expect, it } from "vitest";

import backlogJson from "../../harness/state/backlog.json";
import tasksJson from "../../harness/state/tasks.json";

import { allUnits, countByStatus } from "./ops-selectors";
import {
  buildSnapshot,
  liveBacklog,
  liveTasks,
  type BacklogState,
  type TasksState,
} from "./harness-state";
import { opsSnapshot } from "./ops-data";

// A small, controlled backlog + tasks pair so the derivation rules can be
// asserted in isolation (no dependency on the live committed state, which
// changes as the build advances).
const backlog: BacklogState = {
  milestones: [
    {
      id: "ma",
      title: "Alpha",
      units: [
        { id: "ma-1", title: "One", oracle: "unit", deps: [] },
        { id: "ma-2", title: "Two", oracle: "unit", deps: ["ma-1"] },
      ],
    },
    {
      id: "mb",
      title: "Beta",
      units: [{ id: "mb-1", title: "Three", oracle: "e2e", deps: [] }],
    },
  ],
};

describe("buildSnapshot — gen-1 status derivation", () => {
  it("marks every backlog unit merged once generation 1 is complete", () => {
    const tasks: TasksState = {
      updatedAt: "2026-06-20",
      generation: 1,
      phase: "gen-1 complete",
      gen1: { status: "complete", merged: "3/3" },
    };
    const snap = buildSnapshot(backlog, tasks);
    const counts = countByStatus(snap);
    expect(counts.merged).toBe(3);
    expect(counts.total).toBe(3);
    expect(counts.backlog).toBe(0);
  });

  it("leaves backlog units in backlog while gen-1 is still running", () => {
    const tasks: TasksState = {
      updatedAt: "2026-06-19",
      generation: 1,
      phase: "feature-build",
      gen1: { status: "in-progress", merged: "1/3" },
    };
    const snap = buildSnapshot(backlog, tasks);
    const counts = countByStatus(snap);
    expect(counts.backlog).toBe(3);
    expect(counts.merged).toBe(0);
  });

  it("does not treat an 'incomplete' gen-1 status as complete", () => {
    // Guards the word-boundary check in isGenerationComplete: a naive substring
    // match would let "incomplete" satisfy "complete" and wrongly mark every
    // gen-1 unit as merged.
    const tasks: TasksState = {
      updatedAt: "2026-06-20",
      generation: 1,
      phase: "feature-build",
      gen1: { status: "incomplete", merged: "1/3" },
    };
    const snap = buildSnapshot(backlog, tasks);
    const counts = countByStatus(snap);
    expect(counts.merged).toBe(0);
    expect(counts.backlog).toBe(3);
  });

  it("respects an explicit blocked list over the merged default", () => {
    const tasks: TasksState = {
      updatedAt: "2026-06-20",
      generation: 1,
      phase: "gen-1 complete",
      gen1: { status: "complete", merged: "3/3" },
      blocked: ["mb-1"],
    };
    const snap = buildSnapshot(backlog, tasks);
    const blocked = allUnits(snap).filter((u) => u.status === "blocked");
    expect(blocked.map((u) => u.id)).toEqual(["mb-1"]);
  });

  it("marks backlog units merged from the consolidated gens_1_7 rollup (no gen1)", () => {
    // After the numbered backlog ships, the loop drops the per-generation `gen1`
    // field and records a single consolidated rollup with a named generation.
    // Every gen-1 unit must still read merged.
    const tasks: TasksState = {
      updatedAt: "2026-06-21",
      generation: "hardening-v1",
      phase: "DEPLOYED + hardening building",
      gens_1_7: "complete — 73 feature units across 7 generations + polish layer",
    };
    const snap = buildSnapshot(backlog, tasks);
    expect(snap.generation).toBe("hardening-v1");
    const counts = countByStatus(snap);
    expect(counts.merged).toBe(3);
    expect(counts.backlog).toBe(0);
  });

  it("does not mark units merged when gens_1_7 is absent or not complete", () => {
    const stillBuilding: TasksState = {
      updatedAt: "2026-06-21",
      generation: "hardening-v1",
      phase: "building",
      gens_1_7: "in progress — gen 5 of 7",
    };
    expect(countByStatus(buildSnapshot(backlog, stillBuilding)).backlog).toBe(3);

    const none: TasksState = {
      updatedAt: "2026-06-21",
      generation: 1,
      phase: "early",
    };
    expect(countByStatus(buildSnapshot(backlog, none)).backlog).toBe(3);

    // A negated rollup must not be read as complete (anchored-start guard).
    const negated: TasksState = {
      updatedAt: "2026-06-21",
      generation: "hardening-v1",
      phase: "blocked",
      gens_1_7: "not complete — awaiting a human decision on gen 6",
    };
    expect(countByStatus(buildSnapshot(backlog, negated)).backlog).toBe(3);
  });

  it("still honours the blocked list under the consolidated rollup", () => {
    const tasks: TasksState = {
      updatedAt: "2026-06-21",
      generation: "hardening-v1",
      phase: "hardening",
      gens_1_7: "complete — all generations shipped",
      blocked: ["mb-1"],
    };
    const snap = buildSnapshot(backlog, tasks);
    const byId = Object.fromEntries(allUnits(snap).map((u) => [u.id, u.status]));
    expect(byId["mb-1"]).toBe("blocked");
    expect(byId["ma-1"]).toBe("merged");
  });
});

describe("buildSnapshot — launching (gen-2) units", () => {
  const tasks: TasksState = {
    updatedAt: "2026-06-20",
    generation: 1,
    phase: "launching gen-2",
    gen1: { status: "complete", merged: "3/3" },
    gen2: {
      status: "launching",
      units: ["mc-first", "mc-second", "md-only"],
      note: "deepen things",
    },
  };

  it("appends launching units grouped into synthetic milestones by prefix", () => {
    const snap = buildSnapshot(backlog, tasks);
    const ids = snap.milestones.map((m) => m.id);
    expect(ids).toContain("mc");
    expect(ids).toContain("md");
    const mc = snap.milestones.find((m) => m.id === "mc");
    expect(mc?.units.map((u) => u.id)).toEqual(["mc-first", "mc-second"]);
  });

  it("marks the first non-blocked launching unit active, the rest backlog", () => {
    const snap = buildSnapshot(backlog, tasks);
    const launching = allUnits(snap).filter((u) =>
      u.id.startsWith("mc-") || u.id.startsWith("md-"),
    );
    const active = launching.filter((u) => u.status === "active");
    expect(active.map((u) => u.id)).toEqual(["mc-first"]);
    expect(
      launching.filter((u) => u.status === "backlog").map((u) => u.id),
    ).toEqual(["mc-second", "md-only"]);
  });

  it("does not duplicate a launching unit that is already in the backlog", () => {
    const overlap: TasksState = {
      ...tasks,
      gen2: { status: "launching", units: ["ma-1", "mc-new"] },
    };
    const snap = buildSnapshot(backlog, overlap);
    const ids = allUnits(snap).map((u) => u.id);
    // ma-1 appears once (from the backlog milestone), not re-added.
    expect(ids.filter((id) => id === "ma-1")).toHaveLength(1);
    expect(ids).toContain("mc-new");
  });

  it("skips the launching section entirely when there are no gen-2 units", () => {
    const noGen2: TasksState = {
      updatedAt: "2026-06-20",
      generation: 1,
      phase: "gen-1 complete",
      gen1: { status: "complete", merged: "3/3" },
    };
    const snap = buildSnapshot(backlog, noGen2);
    expect(snap.milestones.map((m) => m.id)).toEqual(["ma", "mb"]);
  });

  it("marks no launching unit active when every gen-2 unit is blocked", () => {
    const allBlocked: TasksState = {
      ...tasks,
      gen2: { status: "launching", units: ["mc-a", "mc-b"] },
      blocked: ["mc-a", "mc-b"],
    };
    const snap = buildSnapshot(backlog, allBlocked);
    const launching = allUnits(snap).filter((u) => u.id.startsWith("mc-"));
    expect(launching.map((u) => u.status)).toEqual(["blocked", "blocked"]);
    expect(launching.some((u) => u.status === "active")).toBe(false);
  });

  it("treats an empty gen-2 units array like no launching section", () => {
    const emptyUnits: TasksState = {
      ...tasks,
      gen2: { status: "launching", units: [] },
    };
    const snap = buildSnapshot(backlog, emptyUnits);
    expect(snap.milestones.map((m) => m.id)).toEqual(["ma", "mb"]);
  });

  it("labels the synthetic milestone 'launching' when gen-2 has no note", () => {
    const noNote: TasksState = {
      ...tasks,
      gen2: { status: "launching", units: ["mc-x"] },
    };
    const snap = buildSnapshot(backlog, noNote);
    const mc = snap.milestones.find((m) => m.id === "mc");
    expect(mc?.title).toMatch(/launching/i);
  });
});

describe("buildSnapshot — degenerate inputs", () => {
  it("returns an empty milestone list for an empty backlog and no gen-2", () => {
    const snap = buildSnapshot(
      { milestones: [] },
      {
        updatedAt: "2026-06-20",
        generation: 1,
        phase: "boot",
        gen1: { status: "in-progress" },
      },
    );
    expect(snap.milestones).toEqual([]);
    expect(countByStatus(snap).total).toBe(0);
  });

  it("does not crash when gen1 is absent (units fall back to backlog)", () => {
    const snap = buildSnapshot(backlog, {
      updatedAt: "2026-06-20",
      generation: 1,
      phase: "boot",
    });
    const counts = countByStatus(snap);
    expect(counts.backlog).toBe(3);
    expect(counts.merged).toBe(0);
  });
});

describe("buildSnapshot — header fields", () => {
  it("carries generation, phase and heartbeat from tasks state", () => {
    const tasks: TasksState = {
      updatedAt: "2026-06-20",
      generation: 2,
      phase: "the-phase",
      gen1: { status: "complete" },
    };
    const snap = buildSnapshot(backlog, tasks);
    expect(snap.generation).toBe(2);
    expect(snap.phase).toBe("the-phase");
    expect(snap.heartbeat).toBe("2026-06-20");
    expect(snap.updatedAt).toBe("2026-06-20");
  });
});

describe("live committed harness state", () => {
  it("exposes the committed JSON unchanged (single source of truth)", () => {
    // The page derives from the *same* committed files the harness writes — not
    // a hand-maintained copy. Guards against the snapshot drifting again.
    expect(liveBacklog).toEqual(backlogJson);
    expect(liveTasks).toEqual(tasksJson);
  });

  it("derives the bundled opsSnapshot from live state", () => {
    expect(opsSnapshot).toEqual(buildSnapshot(liveBacklog, liveTasks));
  });

  it("reflects gen-1 completion: every gen-1 milestone unit is merged", () => {
    const gen1Ids = new Set(
      liveBacklog.milestones.flatMap((m) => m.units.map((u) => u.id)),
    );
    const gen1Units = allUnits(opsSnapshot).filter((u) => gen1Ids.has(u.id));
    expect(gen1Units.length).toBeGreaterThan(0);
    for (const u of gen1Units) {
      expect(u.status).toBe("merged");
    }
  });

  it("surfaces the in-flight generation as live units in the cockpit", () => {
    const launchingIds = liveTasks.gen2?.units ?? [];
    const ids = new Set(allUnits(opsSnapshot).map((u) => u.id));
    for (const id of launchingIds) {
      expect(ids.has(id)).toBe(true);
    }
  });
});
