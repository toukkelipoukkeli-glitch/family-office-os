// Ops cockpit data model.
//
// The /ops page renders a *deterministic snapshot* of the autonomous-build
// harness state (backlog units + their lifecycle status). The snapshot is now
// derived from the committed harness-state JSON (`harness/state/backlog.json` +
// `tasks.json`) at build time — see `harness-state.ts` — so the cockpit tracks
// reality instead of a hand-maintained fixture. Because the JSON is bundled at
// build time, the page still renders offline with no live file reads or network
// calls, which keeps it testable and screenshot-stable.

import { buildSnapshot, liveBacklog, liveTasks } from "./harness-state";

/** Lifecycle status of a single build unit. */
export type UnitStatus = "backlog" | "active" | "merged" | "blocked";

/** A single buildable unit of work, mirroring `harness/state/backlog.json`. */
export interface OpsUnit {
  id: string;
  title: string;
  /** What kind of machine check gates this unit (oracle rule). */
  oracle: string;
  /** Unit ids this unit depends on. */
  deps: string[];
  status: UnitStatus;
  /** Optional PR reference, e.g. "#12", once a PR is opened. */
  pr?: string;
  /** Optional human-readable note (e.g. why it is blocked). */
  note?: string;
}

/** A milestone groups related units. */
export interface OpsMilestone {
  id: string;
  title: string;
  units: OpsUnit[];
}

/** The full harness snapshot rendered by the /ops page. */
export interface OpsSnapshot {
  /** Build generation counter from `tasks.json`. */
  generation: number;
  /** ISO-ish date the snapshot was last updated. */
  updatedAt: string;
  /** Current harness phase, e.g. "feature-build". */
  phase: string;
  /** Last heartbeat timestamp (when the loop last ran). */
  heartbeat: string;
  milestones: OpsMilestone[];
}

/**
 * Live snapshot of harness state, derived deterministically from the committed
 * `harness/state/backlog.json` + `tasks.json` at build time. See
 * `harness-state.ts` for the derivation. This replaces the previous
 * hand-maintained fixture, which QA flagged for drifting out of date.
 */
export const opsSnapshot: OpsSnapshot = buildSnapshot(liveBacklog, liveTasks);
