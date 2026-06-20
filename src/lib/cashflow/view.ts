/**
 * Cashflow **view model**: turns a {@link CashflowInput} into the small,
 * fully-deterministic, plain-`number` model the React page renders — a monthly
 * balance series for the line chart, a per-category inflow/outflow breakdown for
 * the bar chart, headline summary KPIs and a per-month table.
 *
 * Keeping every derivation here (and out of the components) gives the visuals a
 * machine-checkable test surface. Pure, deterministic, offline, READ-ONLY.
 */

import { projectCashflow, type CashflowInput } from "./engine";
import { seededCashflowInput } from "./fixtures";

/** Headline KPIs for the cashflow page (plain numbers). */
export interface CashflowKpis {
  readonly openingBalance: number;
  readonly endingBalance: number;
  readonly minBalance: number;
  /** ISO `YYYY-MM` of the lowest-balance month. */
  readonly minBalancePeriod: string;
  readonly totalInflows: number;
  readonly totalOutflows: number;
  readonly netFlow: number;
  /** ISO `YYYY-MM` of the first shortfall, or `null` if cash never goes negative. */
  readonly firstShortfallPeriod: string | null;
}

/** One point on the monthly balance line chart / table. */
export interface CashflowMonthView {
  readonly index: number;
  readonly period: string;
  readonly openingBalance: number;
  readonly inflows: number;
  readonly outflows: number;
  readonly netFlow: number;
  readonly closingBalance: number;
}

/** A per-category roll-up of total inflow/outflow over the horizon. */
export interface CategoryTotal {
  readonly category: string;
  readonly direction: "inflow" | "outflow";
  readonly total: number;
}

/** The full plain-data model the cashflow page renders. */
export interface CashflowModel {
  readonly currency: string;
  readonly kpis: CashflowKpis;
  readonly months: readonly CashflowMonthView[];
  /** Per-category totals, largest absolute first. */
  readonly categories: readonly CategoryTotal[];
}

/** Inputs to {@link buildCashflowModel}; defaults to the seeded household. */
export interface CashflowModelInput {
  readonly input?: CashflowInput;
}

/**
 * Roll every recurring + one-off flow up by category over the whole horizon.
 * Recurring flows are counted per occurrence within the horizon; one-off flows
 * once. Returns totals sorted by magnitude, largest first.
 */
function categoryTotals(input: CashflowInput): CategoryTotal[] {
  const horizon = input.horizonMonths;
  const totals = new Map<string, { direction: "inflow" | "outflow"; total: number }>();

  const add = (
    category: string,
    direction: "inflow" | "outflow",
    amount: number,
  ) => {
    const key = `${direction}:${category}`;
    const cur = totals.get(key);
    if (cur) cur.total += amount;
    else totals.set(key, { direction, total: amount });
  };

  const stepFor = (frequency: string): number =>
    frequency === "annual" ? 12 : frequency === "quarterly" ? 3 : 1;

  for (const flow of input.recurring ?? []) {
    const start = flow.startMonth ?? 0;
    const end = flow.endMonth ?? horizon - 1;
    const step = stepFor(flow.frequency);
    let count = 0;
    for (let m = start; m < horizon && m <= end; m += step) count++;
    if (count === 0) continue;
    add(flow.category, flow.direction, Number(flow.amount) * count);
  }
  for (const flow of input.oneOff ?? []) {
    if (flow.month < 0 || flow.month >= horizon) continue;
    add(flow.category, flow.direction, Number(flow.amount));
  }

  return Array.from(totals.entries())
    .map(([key, v]) => ({
      category: key.slice(key.indexOf(":") + 1),
      direction: v.direction,
      total: v.total,
    }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Build the {@link CashflowModel} from a projection input. Defaults to the
 * seeded household. All money is reduced to plain `number` at the view edge.
 */
export function buildCashflowModel(modelInput: CashflowModelInput = {}): CashflowModel {
  const input = modelInput.input ?? seededCashflowInput;
  const projection = projectCashflow(input);
  const { months, summary } = projection;

  const minPeriod = months[summary.minBalanceMonth]?.period ?? months[0].period;
  const shortfall =
    summary.firstShortfallMonth === null
      ? null
      : (months[summary.firstShortfallMonth]?.period ?? null);

  const kpis: CashflowKpis = {
    openingBalance: months[0].openingBalance.toNumber(),
    endingBalance: summary.endingBalance.toNumber(),
    minBalance: summary.minBalance.toNumber(),
    minBalancePeriod: minPeriod,
    totalInflows: summary.totalInflows.toNumber(),
    totalOutflows: summary.totalOutflows.toNumber(),
    netFlow: summary.totalInflows.minus(summary.totalOutflows).toNumber(),
    firstShortfallPeriod: shortfall,
  };

  const monthViews: CashflowMonthView[] = months.map((m) => ({
    index: m.index,
    period: m.period,
    openingBalance: m.openingBalance.toNumber(),
    inflows: m.inflows.toNumber(),
    outflows: m.outflows.toNumber(),
    netFlow: m.netFlow.toNumber(),
    closingBalance: m.closingBalance.toNumber(),
  }));

  return {
    currency: input.currency,
    kpis,
    months: monthViews,
    categories: categoryTotals(input),
  };
}

/** The seeded household cashflow model used by the page and its tests. */
export const seededCashflowModel: CashflowModel = buildCashflowModel();
