// Pure derivations over an OpsSnapshot. Kept separate from React so the build
// math (counts, progress, ordering) is unit-testable in isolation.

import type {
  OpsMilestone,
  OpsSnapshot,
  OpsUnit,
  UnitStatus,
} from "./ops-data";

/** Tally of units per lifecycle status, plus the total. */
export interface StatusCounts {
  backlog: number;
  active: number;
  merged: number;
  blocked: number;
  total: number;
}

/** Stable display order for the status columns. */
export const STATUS_ORDER: UnitStatus[] = [
  "backlog",
  "active",
  "merged",
  "blocked",
];

/** Human-readable label for a status. */
export function statusLabel(status: UnitStatus): string {
  switch (status) {
    case "backlog":
      return "Backlog";
    case "active":
      return "In progress";
    case "merged":
      return "Merged";
    case "blocked":
      return "Blocked";
  }
}

/** Flatten every unit across all milestones, preserving order. */
export function allUnits(snapshot: OpsSnapshot): OpsUnit[] {
  return snapshot.milestones.flatMap((m) => m.units);
}

/** Count units by status across the whole snapshot. */
export function countByStatus(snapshot: OpsSnapshot): StatusCounts {
  const counts: StatusCounts = {
    backlog: 0,
    active: 0,
    merged: 0,
    blocked: 0,
    total: 0,
  };
  for (const unit of allUnits(snapshot)) {
    counts[unit.status] += 1;
    counts.total += 1;
  }
  return counts;
}

/**
 * Build progress as a percentage of *merged* units over the total, rounded to
 * the nearest integer. Returns 0 for an empty snapshot (no division by zero).
 */
export function progressPercent(snapshot: OpsSnapshot): number {
  const { merged, total } = countByStatus(snapshot);
  if (total === 0) return 0;
  return Math.round((merged / total) * 100);
}

/** All units with a given status, in snapshot order. */
export function unitsByStatus(
  snapshot: OpsSnapshot,
  status: UnitStatus,
): OpsUnit[] {
  return allUnits(snapshot).filter((u) => u.status === status);
}

/** Per-milestone progress (merged / total of that milestone's units). */
export interface MilestoneProgress {
  milestone: OpsMilestone;
  counts: StatusCounts;
  percent: number;
}

export function milestoneProgress(snapshot: OpsSnapshot): MilestoneProgress[] {
  return snapshot.milestones.map((milestone) => {
    const counts: StatusCounts = {
      backlog: 0,
      active: 0,
      merged: 0,
      blocked: 0,
      total: 0,
    };
    for (const unit of milestone.units) {
      counts[unit.status] += 1;
      counts.total += 1;
    }
    const percent =
      counts.total === 0 ? 0 : Math.round((counts.merged / counts.total) * 100);
    return { milestone, counts, percent };
  });
}

/** One flat export row per unit, tagged with its milestone (snapshot order). */
export interface OpsExportRow {
  milestoneId: string;
  milestoneTitle: string;
  id: string;
  title: string;
  status: UnitStatus;
  oracle: string;
  deps: string;
  pr: string;
  note: string;
}

/**
 * Flatten the snapshot into one deterministic row per build unit, tagged with
 * its owning milestone. This is the primary table the /ops cockpit exports:
 * pure, ordered, and free of `undefined` (optional fields collapse to `""`) so
 * CSV/JSON serialization stays byte-stable.
 */
export function opsExportRows(snapshot: OpsSnapshot): OpsExportRow[] {
  return snapshot.milestones.flatMap((milestone) =>
    milestone.units.map((unit) => ({
      milestoneId: milestone.id,
      milestoneTitle: milestone.title,
      id: unit.id,
      title: unit.title,
      status: unit.status,
      oracle: unit.oracle,
      deps: unit.deps.join(" "),
      pr: unit.pr ?? "",
      note: unit.note ?? "",
    })),
  );
}
