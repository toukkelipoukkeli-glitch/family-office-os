/**
 * Multi-period cashflow & liquidity-runway forecast.
 *
 * Where the m3 liquidity module answers a single point-in-time question — "can
 * we cover *this* call right now?" — this module projects the family office's
 * **cash balance forward through time**. It rolls a recurring schedule of
 *
 *   - **commitments** — capital calls / drawdowns that *consume* cash (outflow),
 *   - **distributions** — fund distributions, coupons, rents that *add* cash
 *     (inflow),
 *   - **expenses** — recurring operating costs, fees, lifestyle burn (outflow),
 *
 * across a sequence of equal-length periods (typically months) and reports, for
 * each period, the opening balance, the signed net flow, and the closing
 * balance. From that path it derives the **runway**: the number of whole periods
 * the office can sustain before its liquid cash balance first goes negative —
 * the moment it would be forced to raise liquidity or sell an asset.
 *
 * All money is {@link Money} (exact {@link Decimal}); the forecast is pure,
 * deterministic and offline. READ-ONLY product: this *projects* cash, it never
 * moves it, places a trade, or funds a call.
 */

import { Money, sumMoney } from "@/lib/money";
import { Decimal } from "decimal.js";

/** Thrown when cashflow-forecast inputs are structurally invalid. */
export class CashflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CashflowError";
  }
}

/** The three kinds of scheduled cashflow line item. */
export const FLOW_KINDS = ["commitment", "distribution", "expense"] as const;
export type FlowKind = (typeof FLOW_KINDS)[number];

/** Whether a kind adds to (inflow) or drains (outflow) the cash balance. */
export const FLOW_DIRECTION: Record<FlowKind, "inflow" | "outflow"> = {
  commitment: "outflow",
  distribution: "inflow",
  expense: "outflow",
};

/** Human-readable labels for each {@link FlowKind}. */
export const FLOW_KIND_LABELS: Record<FlowKind, string> = {
  commitment: "Commitments",
  distribution: "Distributions",
  expense: "Operating expenses",
};

/**
 * How a flow repeats across the forecast horizon.
 *
 *  - `once`     — a single event in period {@link FlowItem.start}.
 *  - `monthly`  — recurs every period from `start`.
 *  - `quarterly`— recurs every 3rd period from `start`.
 *  - `annual`   — recurs every 12th period from `start`.
 */
export const FLOW_FREQUENCIES = ["once", "monthly", "quarterly", "annual"] as const;
export type FlowFrequency = (typeof FLOW_FREQUENCIES)[number];

const FREQUENCY_STRIDE: Record<FlowFrequency, number> = {
  once: 0,
  monthly: 1,
  quarterly: 3,
  annual: 12,
};

/**
 * A single scheduled cashflow line item. The {@link amount} is always a
 * *magnitude* (non-negative); the sign applied to the balance is decided by the
 * item's {@link kind} via {@link FLOW_DIRECTION}, so callers never have to
 * remember to negate an expense.
 */
export interface FlowItem {
  /** Stable identifier (unique within an input). */
  id: string;
  /** Display label, e.g. "Growth Fund III call" or "Office lease". */
  label: string;
  kind: FlowKind;
  frequency: FlowFrequency;
  /** Magnitude of each occurrence (non-negative), in the base currency. */
  amount: Money;
  /** Zero-based period index of the first occurrence. */
  start: number;
  /**
   * Optional zero-based period index of the last period in which the item may
   * occur (inclusive). Omitted ⇒ runs to the end of the horizon.
   */
  end?: number;
}

/** Inputs to a cashflow / runway forecast. */
export interface CashflowForecastInput {
  /** Base currency every amount must be expressed in. */
  baseCurrency: string;
  /** Liquid cash on hand at the start of period 0. */
  openingCash: Money;
  /** Number of periods to project (must be a positive integer). */
  periods: number;
  /** The recurring schedule. */
  items: readonly FlowItem[];
}

/** One kind's contribution within a single period (signed against the balance). */
export interface PeriodKindFlow {
  kind: FlowKind;
  /** Signed amount applied to the balance this period (outflows are negative). */
  signed: Money;
}

/** A single projected period of the forecast. */
export interface PeriodFlow {
  /** Zero-based period index. */
  period: number;
  /** Cash balance at the start of the period. */
  opening: Money;
  /** Total inflows this period (>= 0). */
  inflow: Money;
  /** Total outflows this period (>= 0, reported as a magnitude). */
  outflow: Money;
  /** Net change this period (`inflow - outflow`; may be negative). */
  net: Money;
  /** Cash balance at the end of the period (`opening + net`). */
  closing: Money;
  /** Per-kind signed breakdown for the period (commitment, distribution, expense). */
  byKind: PeriodKindFlow[];
}

/** Full result of a cashflow / runway forecast. */
export interface CashflowForecast {
  baseCurrency: string;
  openingCash: Money;
  periods: number;
  /** The projected periods, ordered 0..periods-1. */
  series: PeriodFlow[];
  /** Total inflow across the whole horizon. */
  totalInflow: Money;
  /** Total outflow across the whole horizon (magnitude). */
  totalOutflow: Money;
  /** Net change across the whole horizon (`totalInflow - totalOutflow`). */
  netChange: Money;
  /** Closing balance at the end of the final period. */
  endingCash: Money;
  /** The lowest closing balance reached over the horizon (the "trough"). */
  lowestBalance: Money;
  /** The period index at which {@link lowestBalance} first occurs. */
  lowestBalancePeriod: number;
  /**
   * Runway: the number of whole periods the office stays cash-positive before
   * its **closing** balance first goes negative. If period 0 already closes
   * negative the runway is 0; if the balance never goes negative across the
   * horizon the runway is {@link periods} (and {@link runwayExhausted} is false).
   */
  runwayPeriods: number;
  /** True when the balance goes negative at some point within the horizon. */
  runwayExhausted: boolean;
  /**
   * The first period index whose closing balance is negative, or `null` if the
   * balance never goes negative within the horizon.
   */
  depletionPeriod: number | null;
}

function assertNonNegativeMagnitude(amount: Money, ctx: string): void {
  if (amount.isNegative()) {
    throw new CashflowError(
      `${ctx} must be a non-negative magnitude, got ${amount.toString()}`,
    );
  }
}

/** Does a `once`/recurring item occur in `period`? */
export function itemOccursIn(item: FlowItem, period: number): boolean {
  if (period < item.start) return false;
  if (item.end !== undefined && period > item.end) return false;
  const stride = FREQUENCY_STRIDE[item.frequency];
  if (item.frequency === "once") {
    return period === item.start;
  }
  return (period - item.start) % stride === 0;
}

/**
 * Project a cashflow / liquidity-runway forecast. See the module doc.
 *
 * Deterministic and pure. Throws {@link CashflowError} on a currency mismatch,
 * a non-positive / non-integer horizon, a negative amount magnitude, or an
 * out-of-range / inverted item window.
 */
export function forecastCashflow(
  input: CashflowForecastInput,
): CashflowForecast {
  const base = input.baseCurrency.trim().toUpperCase();
  const { periods } = input;

  if (!Number.isInteger(periods) || periods <= 0) {
    throw new CashflowError(
      `periods must be a positive integer, got ${periods}`,
    );
  }
  if (input.openingCash.currency !== base) {
    throw new CashflowError(
      `openingCash currency ${input.openingCash.currency} must match base ${base}`,
    );
  }

  const seenIds = new Set<string>();
  for (const item of input.items) {
    if (seenIds.has(item.id)) {
      throw new CashflowError(`duplicate flow item id: ${item.id}`);
    }
    seenIds.add(item.id);
    if (item.amount.currency !== base) {
      throw new CashflowError(
        `item ${item.id} currency ${item.amount.currency} must match base ${base}`,
      );
    }
    assertNonNegativeMagnitude(item.amount, `item ${item.id} amount`);
    if (!Number.isInteger(item.start) || item.start < 0) {
      throw new CashflowError(
        `item ${item.id} start must be a non-negative integer, got ${item.start}`,
      );
    }
    if (item.end !== undefined) {
      if (!Number.isInteger(item.end)) {
        throw new CashflowError(
          `item ${item.id} end must be an integer, got ${item.end}`,
        );
      }
      if (item.end < item.start) {
        throw new CashflowError(
          `item ${item.id} end ${item.end} is before start ${item.start}`,
        );
      }
    }
  }

  const series: PeriodFlow[] = [];
  let balance = input.openingCash;
  let lowestBalance = input.openingCash;
  let lowestBalancePeriod = -1;
  let depletionPeriod: number | null = null;
  let totalInflow = Money.zero(base);
  let totalOutflow = Money.zero(base);

  for (let p = 0; p < periods; p++) {
    const opening = balance;

    const kindTotals = new Map<FlowKind, Money>(
      FLOW_KINDS.map((k) => [k, Money.zero(base)]),
    );
    for (const item of input.items) {
      if (!itemOccursIn(item, p)) continue;
      const prev = kindTotals.get(item.kind) ?? Money.zero(base);
      kindTotals.set(item.kind, prev.plus(item.amount));
    }

    const byKind: PeriodKindFlow[] = FLOW_KINDS.map((kind) => {
      const magnitude = kindTotals.get(kind) ?? Money.zero(base);
      const signed =
        FLOW_DIRECTION[kind] === "outflow" ? magnitude.negated() : magnitude;
      return { kind, signed };
    });

    const inflow = sumMoney(
      byKind.filter((b) => b.signed.isPositive()).map((b) => b.signed),
      base,
    );
    const outflowSigned = sumMoney(
      byKind.filter((b) => b.signed.isNegative()).map((b) => b.signed),
      base,
    );
    const outflow = outflowSigned.negated();
    const net = inflow.minus(outflow);
    const closing = opening.plus(net);

    totalInflow = totalInflow.plus(inflow);
    totalOutflow = totalOutflow.plus(outflow);

    if (closing.lessThan(lowestBalance) || lowestBalancePeriod === -1) {
      lowestBalance = closing;
      lowestBalancePeriod = p;
    }
    if (depletionPeriod === null && closing.isNegative()) {
      depletionPeriod = p;
    }

    series.push({ period: p, opening, inflow, outflow, net, closing, byKind });
    balance = closing;
  }

  const runwayExhausted = depletionPeriod !== null;
  const runwayPeriods = depletionPeriod ?? periods;

  return {
    baseCurrency: base,
    openingCash: input.openingCash,
    periods,
    series,
    totalInflow,
    totalOutflow,
    netChange: totalInflow.minus(totalOutflow),
    endingCash: balance,
    lowestBalance,
    lowestBalancePeriod,
    runwayPeriods,
    runwayExhausted,
    depletionPeriod,
  };
}

/** A short calendar-style label ("M0", "M1", …) for a zero-based period. */
export function periodLabel(period: number): string {
  return `M${period}`;
}

/**
 * The closing-balance path as a list of plain numbers (base-currency major
 * units) — handy for charting. Index 0 is the period-0 closing balance.
 */
export function closingBalances(forecast: CashflowForecast): number[] {
  return forecast.series.map((s) => s.closing.amount.toNumber());
}

/**
 * The opening cash followed by every closing balance, as plain numbers. This is
 * the full balance trajectory including the starting point, length
 * `periods + 1`, suitable for an area/line runway chart.
 */
export function balanceTrajectory(forecast: CashflowForecast): number[] {
  return [
    forecast.openingCash.amount.toNumber(),
    ...closingBalances(forecast),
  ];
}

/** Convenience: coverage ratio of total inflow to total outflow, or null if no outflow. */
export function inflowCoverageRatio(
  forecast: CashflowForecast,
): Decimal | null {
  if (forecast.totalOutflow.isZero()) return null;
  return forecast.totalInflow.amount.div(forecast.totalOutflow.amount);
}
