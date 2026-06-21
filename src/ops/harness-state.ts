// Live harness-state ingestion for the /ops cockpit.
//
// The autonomous build's single source of truth lives in committed JSON under
// `harness/state/`:
//
//   - `backlog.json` — every milestone + its units (id, title, oracle, deps).
//   - `tasks.json`   — the loop's running state: generation, phase, which
//                      generations are complete, how many units merged, the
//                      currently-launching generation + its unit ids, and any
//                      blocked units.
//
// Previously the page rendered a hand-maintained static snapshot that drifted
// out of date (QA flagged it as stale). This module derives the snapshot from
// the committed state files instead, so the cockpit reflects reality while
// staying fully deterministic and offline: the JSON is bundled at build time,
// so there are no live file reads or network calls at runtime, and tests can
// feed fixtures to `buildSnapshot` directly.

import backlogJson from "../../harness/state/backlog.json";
import tasksJson from "../../harness/state/tasks.json";

import type {
  OpsMilestone,
  OpsSnapshot,
  OpsUnit,
  UnitStatus,
} from "./ops-data";

/** Shape of a single unit in `harness/state/backlog.json`. */
export interface BacklogUnit {
  id: string;
  title: string;
  oracle: string;
  deps: string[];
}

/** Shape of a milestone in `harness/state/backlog.json`. */
export interface BacklogMilestone {
  id: string;
  title: string;
  units: BacklogUnit[];
}

/** Shape of `harness/state/backlog.json`. */
export interface BacklogState {
  milestones: BacklogMilestone[];
}

/** Per-generation rollup recorded in `tasks.json`. */
export interface GenerationState {
  status: string;
  /** e.g. "35/35"; the count of merged units. */
  merged?: string;
  /** Unit ids that make up the generation (gen-2+ list this explicitly). */
  units?: string[];
  note?: string;
}

/** Shape of `harness/state/tasks.json` (the fields the cockpit reads). */
export interface TasksState {
  updatedAt: string;
  /**
   * The loop's current generation marker. Early generations are plain counters
   * (`1`, `2`, …); once the numbered backlog is exhausted the harness advances
   * into named phases (e.g. `"hardening-v1"`), so this is `number | string`. The
   * cockpit renders it as text either way.
   */
  generation: number | string;
  phase: string;
  gen1?: GenerationState;
  gen2?: GenerationState;
  /**
   * Consolidated rollup written once the early numbered generations have all
   * shipped (e.g. `"complete — 73 feature units across 7 generations…"`). When
   * present and reading complete, every backlog (gen-1) unit is treated as
   * merged even though the per-generation `gen1` field is no longer carried.
   */
  gens_1_7?: string;
  /**
   * The v1-handoff rollup overwrote `gens_1_7` with a richer shape: a
   * sentence-style `phase`/`generation` marker plus a per-generation count map.
   * The `gen1-spine` entry reads e.g. `"35/35"` once generation 1 fully shipped.
   * Carried so the cockpit keeps reporting gen-1 units as merged after handoff.
   */
  generations?: Record<string, string>;
  blocked?: string[];
}

/**
 * True when a generation count string (e.g. `"35/35"`) reports every unit
 * merged — the numerator equals a non-zero denominator. A partial count
 * (`"8/10"`) or a malformed value reads as not-complete.
 */
function genCountComplete(count: string | undefined): boolean {
  const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(count ?? "");
  if (!m) return false;
  const done = Number(m[1]);
  const total = Number(m[2]);
  return total > 0 && done === total;
}

/**
 * True when the consolidated gens-1..7 rollup reads complete/done/shipped.
 *
 * Two rollup shapes are recognised:
 *  - the legacy `gens_1_7` sentence string (e.g. `"complete — 73 feature units…"`),
 *    anchored to the leading state word so a `"not complete — …"` rollup does
 *    NOT mark backlog units merged; and
 *  - the v1-handoff `generation`/`phase` markers (`"v1 COMPLETE"` / `"DONE — …"`)
 *    together with a `generations["gen1-spine"]` count that reads fully merged
 *    (e.g. `"35/35"`).
 */
function gensConsolidatedComplete(tasks: TasksState): boolean {
  const rollup = tasks.gens_1_7;
  if (typeof rollup === "string" && /^\s*(complete|done|shipped)\b/i.test(rollup)) {
    return true;
  }
  // v1-handoff shape: the numbered backlog (generation 1 / the spine) is merged
  // when its count map entry reads fully shipped and the overall phase is done.
  const phaseDone =
    /\b(complete|done|shipped)\b/i.test(String(tasks.generation ?? "")) ||
    /^\s*(complete|done|shipped)\b/i.test(String(tasks.phase ?? ""));
  return phaseDone && genCountComplete(tasks.generations?.["gen1-spine"]);
}

// Cast the bundled JSON to our typed views. The casts are validated by the
// `harness-state.test.ts` invariants (ids unique, deps resolve, statuses known).
export const liveBacklog = backlogJson as BacklogState;
export const liveTasks = tasksJson as TasksState;

/** A generation is "shipped" once its rollup status reads complete/done. */
function isGenerationComplete(gen: GenerationState | undefined): boolean {
  if (!gen) return false;
  // Match whole status words only — a substring match would let "incomplete"
  // satisfy "complete" and wrongly mark every gen-1 unit as merged.
  return /\b(complete|done|shipped)\b/i.test(gen.status);
}

/**
 * Decide the lifecycle status of a backlog unit (gen-1 milestones) from the
 * running `tasks.json` state.
 *
 * - If the unit is listed in `tasks.blocked`, it is blocked.
 * - If generation 1 is complete, every gen-1 unit is merged (the whole
 *   generation shipped on `main`).
 * - Otherwise it falls back to backlog.
 */
function backlogUnitStatus(
  unitId: string,
  tasks: TasksState,
): UnitStatus {
  if (tasks.blocked?.includes(unitId)) return "blocked";
  // Merged once gen-1 completes, or once the consolidated gens-1..7 rollup
  // (written after the numbered backlog shipped) reports completion.
  if (isGenerationComplete(tasks.gen1) || gensConsolidatedComplete(tasks)) {
    return "merged";
  }
  return "backlog";
}

/**
 * Decide the status of a unit that only exists in the *launching* generation
 * list (e.g. gen-2 units named in `tasks.json` but not yet in `backlog.json`).
 *
 * The first not-yet-blocked unit in the list is the one currently being built
 * (active); the rest are backlog. Blocked ids always win.
 */
function launchingUnitStatus(
  unitId: string,
  index: number,
  firstActiveIndex: number,
  tasks: TasksState,
): UnitStatus {
  if (tasks.blocked?.includes(unitId)) return "blocked";
  if (index === firstActiveIndex) return "active";
  return "backlog";
}

/** Title-case a unit id (e.g. "m7-ops-live" -> "m7 ops live") as a fallback. */
function humanizeId(id: string): string {
  return id
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Milestone id prefix for a unit id, e.g. "m7-ops-live" -> "m7". */
function milestonePrefix(id: string): string {
  const dash = id.indexOf("-");
  return dash === -1 ? id : id.slice(0, dash);
}

/**
 * Build a deterministic {@link OpsSnapshot} from the committed harness state.
 *
 * @param backlog gen-1 milestones + units (from `backlog.json`).
 * @param tasks   the running loop state (from `tasks.json`).
 */
export function buildSnapshot(
  backlog: BacklogState,
  tasks: TasksState,
): OpsSnapshot {
  const knownIds = new Set(
    backlog.milestones.flatMap((m) => m.units.map((u) => u.id)),
  );

  // Gen-1 (and any other backlog) milestones, with statuses derived from tasks.
  const milestones: OpsMilestone[] = backlog.milestones.map((m) => ({
    id: m.id,
    title: m.title,
    units: m.units.map<OpsUnit>((u) => ({
      id: u.id,
      title: u.title,
      oracle: u.oracle,
      deps: u.deps,
      status: backlogUnitStatus(u.id, tasks),
    })),
  }));

  // Units named only in the launching generation (gen-2) that are not yet in
  // the backlog milestones. Group them into synthetic milestones by id prefix
  // so the cockpit shows the in-flight work, not just shipped generations.
  const launchingUnits = (tasks.gen2?.units ?? []).filter(
    (id) => !knownIds.has(id),
  );
  if (launchingUnits.length > 0) {
    const firstActiveIndex = launchingUnits.findIndex(
      (id) => !tasks.blocked?.includes(id),
    );

    const byPrefix = new Map<string, OpsUnit[]>();
    launchingUnits.forEach((id, index) => {
      const unit: OpsUnit = {
        id,
        title: humanizeId(id),
        oracle: "unit",
        deps: [],
        status: launchingUnitStatus(id, index, firstActiveIndex, tasks),
      };
      const prefix = milestonePrefix(id);
      const bucket = byPrefix.get(prefix);
      if (bucket) {
        bucket.push(unit);
      } else {
        byPrefix.set(prefix, [unit]);
      }
    });

    for (const [prefix, units] of byPrefix) {
      milestones.push({
        id: prefix,
        title: `${prefix.toUpperCase()} — ${tasks.gen2?.note ? "in flight" : "launching"}`,
        units,
      });
    }
  }

  return {
    generation: tasks.generation,
    updatedAt: tasks.updatedAt,
    phase: tasks.phase,
    // The loop records its last activity via `updatedAt`; surface it as the
    // heartbeat so the cockpit shows when the harness last advanced.
    heartbeat: tasks.updatedAt,
    milestones,
  };
}
