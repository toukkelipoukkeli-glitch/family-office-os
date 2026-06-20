import type { Commitment, LedgerEntry } from "@/lib/privatemarkets";

import type { OneOffFlow } from "./engine";

/**
 * Bridge from the **m9-pe-lifecycle** commitment ledger to the cashflow
 * engine's one-off flow grid.
 *
 * A private-markets capital **call** is cash the household must *pay in* — an
 * **outflow** that drains liquidity. A **distribution** is cash *returned* — an
 * **inflow**. This module maps each dated ledger entry onto the projection's
 * 0-based month grid (relative to a horizon start month) so the household's
 * cash position is projected net of its PE pacing.
 *
 * Pure, deterministic, offline, READ-ONLY.
 */

const ISO_MONTH = /^\d{4}-\d{2}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Number of whole months from `startPeriod` (`YYYY-MM`) to a `YYYY-MM-DD` date. */
function monthOffset(startPeriod: string, isoDate: string): number {
  if (!ISO_MONTH.test(startPeriod)) {
    throw new Error(
      `cashflow: startPeriod must be ISO YYYY-MM, got ${JSON.stringify(startPeriod)}`,
    );
  }
  if (!ISO_DATE.test(isoDate)) {
    throw new Error(
      `cashflow: ledger date must be ISO YYYY-MM-DD, got ${JSON.stringify(isoDate)}`,
    );
  }
  const [sy, sm] = startPeriod.split("-").map(Number);
  const [dy, dm] = isoDate.split("-").map(Number);
  return (dy * 12 + (dm - 1)) - (sy * 12 + (sm - 1));
}

/** Inputs to {@link peScheduleFlows}. */
export interface PeScheduleInput {
  /** ISO `YYYY-MM` of the projection's first month (month index 0). */
  readonly startPeriod: string;
  /** Number of months in the horizon; flows outside `[0, horizon)` are dropped. */
  readonly horizonMonths: number;
}

/**
 * Convert a commitment's dated call/distribution ledger into {@link OneOffFlow}s
 * on the projection grid. A call becomes an `outflow`, a distribution an
 * `inflow`. Entries whose date falls outside the horizon window are dropped
 * (they cannot affect the projected balance). Stable, in ledger order.
 */
export function peScheduleFlows(
  commitment: Commitment,
  input: PeScheduleInput,
): OneOffFlow[] {
  const flows: OneOffFlow[] = [];
  commitment.ledger.forEach((entry: LedgerEntry, i) => {
    const month = monthOffset(input.startPeriod, entry.date);
    if (month < 0 || month >= input.horizonMonths) return;
    if (entry.kind !== "call" && entry.kind !== "distribution") {
      throw new Error(
        `cashflow: unknown ledger kind ${JSON.stringify(entry.kind)}`,
      );
    }
    const isCall = entry.kind === "call";
    flows.push({
      id: `${commitment.id}-${entry.kind}-${i}`,
      label:
        entry.label ??
        `${commitment.name} ${isCall ? "capital call" : "distribution"}`,
      category: isCall ? "pe-call" : "pe-distribution",
      direction: isCall ? "outflow" : "inflow",
      amount: entry.amount,
      month,
    });
  });
  return flows;
}

/**
 * Flatten a whole sleeve of commitments into one combined one-off flow list on
 * the projection grid — the household's full PE liquidity schedule.
 */
export function sleeveScheduleFlows(
  commitments: readonly Commitment[],
  input: PeScheduleInput,
): OneOffFlow[] {
  return commitments.flatMap((c) => peScheduleFlows(c, input));
}
