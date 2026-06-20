import { Decimal } from "decimal.js";

/**
 * m9-cashflow — Household / entity cashflow projection engine.
 *
 * A deterministic, offline projection of a household's (or any entity's) cash
 * position over a monthly horizon. It folds together three kinds of flows:
 *
 *  - **Recurring inflows**  — dividends, coupons, rent, salary, …
 *  - **Recurring outflows** — living expenses, taxes, fees, …
 *  - **One-off dated flows** — most importantly a private-markets capital-call /
 *    distribution schedule (the calls drain cash, the distributions top it up),
 *    so the household's liquidity is projected *net of* its PE pacing.
 *
 * The output is a month-by-month series of opening balance, inflows, outflows,
 * net flow and closing balance, plus headline summary stats (ending balance,
 * minimum balance and the first month — if any — the balance goes negative).
 *
 * Everything is exact ({@link Decimal}); nothing is floating-point currency.
 * Pure, deterministic and READ-ONLY: it *projects* cash, it never moves money.
 */

const ZERO = new Decimal(0);

/** Fail fast on a malformed flow direction rather than silently mis-signing it. */
function assertDirection(direction: FlowDirection, context: string): void {
  if (direction !== "inflow" && direction !== "outflow") {
    throw new Error(
      `cashflow: ${context} direction must be "inflow" or "outflow", got ${JSON.stringify(direction)}`,
    );
  }
}

/** How often a recurring flow repeats. */
export type Frequency = "monthly" | "quarterly" | "annual";

/** Number of months between occurrences of each {@link Frequency}. */
const FREQUENCY_MONTHS: Record<Frequency, number> = {
  monthly: 1,
  quarterly: 3,
  annual: 12,
};

/** Whether a flow adds to (inflow) or subtracts from (outflow) cash. */
export type FlowDirection = "inflow" | "outflow";

/**
 * A recurring cashflow line item. The `amount` is always a **positive
 * magnitude**; {@link RecurringFlow.direction} carries the sign.
 *
 * Occurrences land on `startMonth` and then every `FREQUENCY_MONTHS[frequency]`
 * months thereafter, up to (and including) the optional `endMonth`. Months are
 * 0-based offsets from the start of the projection horizon (month 0 is the first
 * projected month).
 */
export interface RecurringFlow {
  /** Stable identifier. */
  readonly id: string;
  /** Human label, e.g. "Salary", "Property tax". */
  readonly label: string;
  /** Category bucket, e.g. "salary", "dividends", "living", "tax", "fees". */
  readonly category: string;
  /** Inflow or outflow. */
  readonly direction: FlowDirection;
  /** Positive magnitude per occurrence. */
  readonly amount: Decimal.Value;
  /** How often it repeats. */
  readonly frequency: Frequency;
  /** First month it occurs (0-based offset into the horizon). Defaults to 0. */
  readonly startMonth?: number;
  /**
   * Last month it may occur (inclusive, 0-based offset). When omitted the flow
   * runs for the whole horizon.
   */
  readonly endMonth?: number;
}

/**
 * A single dated, one-off cashflow — e.g. a private-markets capital call or
 * distribution mapped onto the projection's month grid. `amount` is a positive
 * magnitude; {@link OneOffFlow.direction} carries the sign.
 */
export interface OneOffFlow {
  readonly id: string;
  readonly label: string;
  readonly category: string;
  readonly direction: FlowDirection;
  readonly amount: Decimal.Value;
  /** Month it lands on (0-based offset into the horizon). */
  readonly month: number;
}

/** Inputs to {@link projectCashflow}. */
export interface CashflowInput {
  /** Opening cash balance at the start of month 0. */
  readonly openingBalance: Decimal.Value;
  /** Number of months to project (must be a positive integer). */
  readonly horizonMonths: number;
  /** 3-letter ISO currency code (carried through; not converted). */
  readonly currency: string;
  /**
   * ISO `YYYY-MM` of the first projected month. Used purely to label each
   * month's `period`; the math is offset-based. Defaults to `"2024-01"`.
   */
  readonly startPeriod?: string;
  /** Recurring inflow / outflow line items. */
  readonly recurring?: readonly RecurringFlow[];
  /** One-off dated flows (e.g. a PE call/distribution schedule). */
  readonly oneOff?: readonly OneOffFlow[];
}

/** One month of the projected cash series. All amounts are {@link Decimal}. */
export interface MonthProjection {
  /** 0-based month offset into the horizon. */
  readonly index: number;
  /** ISO `YYYY-MM` label for the month. */
  readonly period: string;
  /** Cash on hand at the start of the month. */
  readonly openingBalance: Decimal;
  /** Total inflows credited during the month. */
  readonly inflows: Decimal;
  /** Total outflows debited during the month. */
  readonly outflows: Decimal;
  /** Net flow = inflows − outflows. */
  readonly netFlow: Decimal;
  /** Cash on hand at the end of the month (carried into the next month). */
  readonly closingBalance: Decimal;
}

/** Headline summary stats for a projection. */
export interface CashflowSummary {
  /** Closing balance of the final projected month. */
  readonly endingBalance: Decimal;
  /** Lowest closing balance reached across the horizon. */
  readonly minBalance: Decimal;
  /** Month index of the {@link CashflowSummary.minBalance} (first occurrence). */
  readonly minBalanceMonth: number;
  /**
   * First month index whose closing balance is negative, or `null` if the
   * household never runs out of cash over the horizon. This is the liquidity
   * early-warning signal.
   */
  readonly firstShortfallMonth: number | null;
  /** Sum of all inflows over the horizon. */
  readonly totalInflows: Decimal;
  /** Sum of all outflows over the horizon. */
  readonly totalOutflows: Decimal;
}

/** The full projection: the monthly series plus summary stats. */
export interface CashflowProjection {
  readonly currency: string;
  readonly months: readonly MonthProjection[];
  readonly summary: CashflowSummary;
}

function toDecimal(value: Decimal.Value, context: string): Decimal {
  const dec = value instanceof Decimal ? value : new Decimal(value);
  if (!dec.isFinite()) {
    throw new Error(`cashflow: non-finite ${context}`);
  }
  return dec;
}

const ISO_MONTH = /^\d{4}-\d{2}$/;

/** Validate an ISO `YYYY-MM` period string and a real calendar month. */
function assertIsoMonth(period: string, context: string): string {
  if (!ISO_MONTH.test(period)) {
    throw new Error(
      `cashflow: ${context} must be ISO YYYY-MM, got ${JSON.stringify(period)}`,
    );
  }
  const month = Number(period.split("-")[1]);
  if (month < 1 || month > 12) {
    throw new Error(
      `cashflow: ${context} is not a real calendar month: ${JSON.stringify(period)}`,
    );
  }
  return period;
}

/**
 * Advance an ISO `YYYY-MM` period by `delta` whole months (delta >= 0),
 * rolling the year over as needed.
 */
export function addMonths(period: string, delta: number): string {
  const [y, m] = period.split("-").map(Number);
  // Convert to a 0-based absolute month count, add, convert back.
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = total - ny * 12 + 1;
  return `${String(ny).padStart(4, "0")}-${String(nm).padStart(2, "0")}`;
}

function assertPositiveInteger(value: number, context: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`cashflow: ${context} must be a positive integer`);
  }
  return value;
}

function assertNonNegativeInteger(value: number, context: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`cashflow: ${context} must be a non-negative integer`);
  }
  return value;
}

/**
 * Does a recurring flow occur in month `index`? True when `index` is on or after
 * the flow's start, on or before its end, and an exact multiple of the flow's
 * period away from the start.
 */
function occursIn(flow: RecurringFlow, index: number): boolean {
  const start = flow.startMonth ?? 0;
  if (index < start) return false;
  if (flow.endMonth !== undefined && index > flow.endMonth) return false;
  const step = FREQUENCY_MONTHS[flow.frequency];
  return (index - start) % step === 0;
}

/**
 * Project a household / entity cash position month-by-month over a horizon.
 *
 * For each month it accumulates every recurring occurrence and every one-off
 * flow landing that month, splits them into inflows / outflows, rolls the
 * balance forward, and tracks the running minimum and first shortfall.
 *
 * Pure and deterministic — same input always yields the same series.
 */
export function projectCashflow(input: CashflowInput): CashflowProjection {
  const horizon = assertPositiveInteger(input.horizonMonths, "horizonMonths");
  const opening = toDecimal(input.openingBalance, "openingBalance");
  const startPeriod = assertIsoMonth(
    input.startPeriod ?? "2024-01",
    "startPeriod",
  );

  const recurring = (input.recurring ?? []).map((flow, i) => {
    const amount = toDecimal(flow.amount, `recurring amount at index ${i}`);
    if (amount.isNegative()) {
      throw new Error(
        `cashflow: recurring amounts must be non-negative magnitudes (index ${i})`,
      );
    }
    if (!(flow.frequency in FREQUENCY_MONTHS)) {
      throw new Error(
        `cashflow: unknown frequency ${JSON.stringify(flow.frequency)}`,
      );
    }
    assertDirection(flow.direction, `recurring (${flow.id})`);
    if (flow.startMonth !== undefined) {
      assertNonNegativeInteger(
        flow.startMonth,
        `recurring startMonth (${flow.id})`,
      );
    }
    if (flow.endMonth !== undefined) {
      assertNonNegativeInteger(flow.endMonth, `recurring endMonth (${flow.id})`);
      const start = flow.startMonth ?? 0;
      if (flow.endMonth < start) {
        throw new Error(
          `cashflow: recurring endMonth before startMonth (${flow.id})`,
        );
      }
    }
    return { flow, amount };
  });

  const oneOff = (input.oneOff ?? []).map((flow, i) => {
    const amount = toDecimal(flow.amount, `oneOff amount at index ${i}`);
    if (amount.isNegative()) {
      throw new Error(
        `cashflow: oneOff amounts must be non-negative magnitudes (index ${i})`,
      );
    }
    assertNonNegativeInteger(flow.month, `oneOff month (${flow.id})`);
    assertDirection(flow.direction, `oneOff (${flow.id})`);
    return { flow, amount };
  });

  const months: MonthProjection[] = [];
  let balance = opening;
  let minBalance = opening;
  let minBalanceMonth = 0;
  let firstShortfallMonth: number | null = null;
  let totalInflows = ZERO;
  let totalOutflows = ZERO;

  for (let index = 0; index < horizon; index++) {
    let inflows = ZERO;
    let outflows = ZERO;

    for (const { flow, amount } of recurring) {
      if (!occursIn(flow, index)) continue;
      if (flow.direction === "inflow") inflows = inflows.plus(amount);
      else outflows = outflows.plus(amount);
    }
    for (const { flow, amount } of oneOff) {
      if (flow.month !== index) continue;
      if (flow.direction === "inflow") inflows = inflows.plus(amount);
      else outflows = outflows.plus(amount);
    }

    const netFlow = inflows.minus(outflows);
    const openingBalance = balance;
    const closingBalance = openingBalance.plus(netFlow);

    months.push({
      index,
      period: addMonths(startPeriod, index),
      openingBalance,
      inflows,
      outflows,
      netFlow,
      closingBalance,
    });

    totalInflows = totalInflows.plus(inflows);
    totalOutflows = totalOutflows.plus(outflows);

    if (closingBalance.lessThan(minBalance)) {
      minBalance = closingBalance;
      minBalanceMonth = index;
    }
    if (firstShortfallMonth === null && closingBalance.isNegative()) {
      firstShortfallMonth = index;
    }

    balance = closingBalance;
  }

  const summary: CashflowSummary = {
    endingBalance: balance,
    minBalance,
    minBalanceMonth,
    firstShortfallMonth,
    totalInflows,
    totalOutflows,
  };

  return { currency: input.currency, months, summary };
}
