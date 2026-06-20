import { Decimal } from "decimal.js";

import {
  projectCashflow,
  sleeveScheduleFlows,
  type CashflowInput,
  type OneOffFlow,
} from "@/lib/cashflow";
import type { Commitment } from "@/lib/privatemarkets";

import type { Obligation } from "./engine";
import { burnObligations } from "./engine";

/**
 * Bridge from the existing **m9-pe-lifecycle** + **m9-cashflow** engines to the
 * liquidity-coverage obligation grid.
 *
 * A private-markets **capital call** is an obligation the family must fund; a
 * distribution is liquidity *returned*. For coverage we model the worst case the
 * family must be ready for — the calls — and net any **same-month** distribution
 * against them (a distribution can offset a call due that month, but we do not
 * assume future distributions bankroll earlier calls, which would be exactly the
 * timing risk this cockpit exists to surface).
 *
 * Pure, deterministic, offline, READ-ONLY.
 */

const ZERO = new Decimal(0);

/** Inputs shared by the schedule bridges. */
export interface ScheduleWindow {
  /** ISO `YYYY-MM` of the projection's first month (month index 0). */
  readonly startPeriod: string;
  /** Number of months in the horizon. */
  readonly horizonMonths: number;
}

/**
 * Convert a sleeve of PE commitments into per-month **capital-call obligations**
 * on the coverage grid, netting same-month distributions against the calls.
 * Months whose net (calls − distributions) is ≤ 0 produce no obligation.
 */
export function callObligations(
  commitments: readonly Commitment[],
  window: ScheduleWindow,
): Obligation[] {
  const flows: OneOffFlow[] = sleeveScheduleFlows(commitments, window);
  const callByMonth = new Map<number, Decimal>();
  const distByMonth = new Map<number, Decimal>();
  for (const f of flows) {
    const amount = new Decimal(f.amount);
    if (f.category === "pe-call") {
      callByMonth.set(f.month, (callByMonth.get(f.month) ?? ZERO).plus(amount));
    } else if (f.category === "pe-distribution") {
      distByMonth.set(f.month, (distByMonth.get(f.month) ?? ZERO).plus(amount));
    }
  }
  const out: Obligation[] = [];
  for (const [month, calls] of [...callByMonth.entries()].sort((a, b) => a[0] - b[0])) {
    const net = calls.minus(distByMonth.get(month) ?? ZERO);
    if (net.greaterThan(ZERO)) {
      out.push({
        id: `pe-call-${month}`,
        label: "PE capital call",
        category: "pe-call",
        amount: net,
        month,
      });
    }
  }
  return out;
}

/**
 * Derive per-month **household net-burn obligations** from a cashflow input,
 * with PE flows stripped out (those are carried separately as `pe-call`
 * obligations so they can be netted against distributions). We run the cashflow
 * engine over the recurring flows only, then turn each month's net outflow into
 * an obligation.
 */
export function householdBurnObligations(
  cashflow: CashflowInput,
): Obligation[] {
  // Project recurring flows only (drop the PE one-off schedule — the calls are
  // modelled separately and distributions are netted at the call site).
  const projection = projectCashflow({
    ...cashflow,
    openingBalance: 0,
    oneOff: [],
  });
  const netOut = projection.months.map((m) =>
    m.outflows.minus(m.inflows),
  );
  return burnObligations(netOut);
}
