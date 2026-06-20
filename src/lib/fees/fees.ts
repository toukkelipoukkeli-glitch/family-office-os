/**
 * Fee & total-cost-of-ownership (TCO) engine.
 *
 * This module is the *oracle* behind the m7-fees page. It turns a set of
 * fund / mandate **fee schedules** plus the capital invested in each into a
 * deterministic, plain-data view model: the all-in annual cost of every
 * position, the blended cost of the whole book, and the long-run **fee drag**
 * on compounded returns.
 *
 * Every fee component a family office actually pays is modelled:
 *
 *  - **Management fee** — an annual percentage of assets (AUM).
 *  - **Fund expenses** — the fund's own operating costs / TER above the
 *    headline management fee (admin, custody, audit), also a % of AUM.
 *  - **Performance fee / carry** — a share of profit above a hurdle, only
 *    charged on the gain (and only when the gain clears the hurdle).
 *
 * All money is exact {@link Decimal} (see AGENTS.md: never floating-point
 * currency). The engine is pure, deterministic and offline — it reports what a
 * structure costs; it is READ-ONLY and never moves money.
 */

import { Decimal } from "decimal.js";

/** Thrown when fee inputs are structurally invalid. */
export class FeeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeeError";
  }
}

/** A single percentage component of a fee schedule, expressed as a fraction (0.01 = 1%). */
export type Rate = Decimal.Value;

/**
 * The fee schedule for one fund / mandate / vehicle. Rates are annual
 * fractions of AUM except {@link FeeSchedule.carry}, which is a fraction of
 * profit above {@link FeeSchedule.hurdle}.
 */
export interface FeeSchedule {
  /** Stable id. */
  readonly id: string;
  /** Display name of the fund / mandate. */
  readonly name: string;
  /** Asset-class / strategy bucket (free-form, used only for grouping & display). */
  readonly category: string;
  /** Annual management fee, as a fraction of AUM (0.02 = 2%). */
  readonly managementFee: Rate;
  /** Fund operating expenses above the management fee, as a fraction of AUM. */
  readonly fundExpenses: Rate;
  /** Performance fee / carry, as a fraction of profit above the hurdle (0.20 = 20%). */
  readonly carry: Rate;
  /** Annual hurdle rate the carry is charged above, as a fraction (0.08 = 8%). Default 0. */
  readonly hurdle?: Rate;
}

/** A held position: capital invested in a vehicle with a known fee schedule. */
export interface Position {
  /** The fee schedule this position pays. */
  readonly schedule: FeeSchedule;
  /** Capital currently invested (AUM the fees are charged on). */
  readonly invested: Decimal.Value;
  /** Assumed gross annual return for this position, as a fraction (0.10 = 10%). */
  readonly grossReturn: Decimal.Value;
}

/** The all-in annual cost breakdown for a single position, in currency units. */
export interface PositionCost {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  /** Capital invested. */
  readonly invested: Decimal;
  /** Annual management fee in currency. */
  readonly managementCost: Decimal;
  /** Annual fund-expense cost in currency. */
  readonly fundExpenseCost: Decimal;
  /** Annual performance fee / carry in currency (0 when the gain is below the hurdle). */
  readonly performanceCost: Decimal;
  /** Sum of all annual costs in currency. */
  readonly totalCost: Decimal;
  /**
   * All-in cost as a fraction of invested capital — the position's effective
   * expense ratio for the year (management + expenses + realised carry).
   */
  readonly effectiveRate: Decimal;
}

function dec(value: Decimal.Value, label: string): Decimal {
  let d: Decimal;
  try {
    d = new Decimal(value);
  } catch {
    throw new FeeError(`Invalid ${label}: ${JSON.stringify(value)}`);
  }
  if (!d.isFinite()) {
    throw new FeeError(`${label} must be finite`);
  }
  return d;
}

function nonNegRate(value: Decimal.Value, label: string): Decimal {
  const d = dec(value, label);
  if (d.isNegative()) {
    throw new FeeError(`${label} must be non-negative`);
  }
  return d;
}

/**
 * The performance fee charged on a position for one year.
 *
 * Carry applies to the **profit above the hurdle**, not the whole gain: if the
 * gross gain clears the hurdle the manager takes `carry` of the *excess* over
 * the hurdle amount; below the hurdle no carry is owed. Returns currency.
 */
export function performanceFee(
  invested: Decimal,
  grossReturn: Decimal,
  carry: Decimal,
  hurdle: Decimal,
): Decimal {
  const gain = invested.times(grossReturn);
  const hurdleAmount = invested.times(hurdle);
  const excess = gain.minus(hurdleAmount);
  if (excess.lessThanOrEqualTo(0) || carry.isZero()) {
    return new Decimal(0);
  }
  return excess.times(carry);
}

/** Compute the all-in annual cost breakdown for a single {@link Position}. */
export function positionCost(position: Position): PositionCost {
  const { schedule } = position;
  const invested = dec(position.invested, "invested");
  if (invested.isNegative()) {
    throw new FeeError("invested must be non-negative");
  }
  const grossReturn = dec(position.grossReturn, "grossReturn");
  const mgmt = nonNegRate(schedule.managementFee, "managementFee");
  const expenses = nonNegRate(schedule.fundExpenses, "fundExpenses");
  const carry = nonNegRate(schedule.carry, "carry");
  const hurdle = nonNegRate(schedule.hurdle ?? 0, "hurdle");

  const managementCost = invested.times(mgmt);
  const fundExpenseCost = invested.times(expenses);
  const performanceCost = performanceFee(invested, grossReturn, carry, hurdle);
  const totalCost = managementCost.plus(fundExpenseCost).plus(performanceCost);
  const effectiveRate = invested.isZero()
    ? new Decimal(0)
    : totalCost.div(invested);

  return {
    id: schedule.id,
    name: schedule.name,
    category: schedule.category,
    invested,
    managementCost,
    fundExpenseCost,
    performanceCost,
    totalCost,
    effectiveRate,
  };
}

/** Aggregate cost across a whole book of positions. */
export interface PortfolioCost {
  /** Per-position breakdown, in input order. */
  readonly positions: readonly PositionCost[];
  /** Total capital invested across the book. */
  readonly totalInvested: Decimal;
  /** Total annual management cost in currency. */
  readonly totalManagement: Decimal;
  /** Total annual fund-expense cost in currency. */
  readonly totalFundExpenses: Decimal;
  /** Total annual performance / carry cost in currency. */
  readonly totalPerformance: Decimal;
  /** Total all-in annual cost in currency. */
  readonly totalCost: Decimal;
  /**
   * Capital-weighted blended cost across the book as a fraction of invested
   * capital — the family's effective all-in expense ratio.
   */
  readonly blendedRate: Decimal;
}

/** Compute the aggregate {@link PortfolioCost} for a book of positions. */
export function portfolioCost(positions: readonly Position[]): PortfolioCost {
  const breakdown = positions.map(positionCost);

  const zero = new Decimal(0);
  const totalInvested = breakdown.reduce((a, p) => a.plus(p.invested), zero);
  const totalManagement = breakdown.reduce(
    (a, p) => a.plus(p.managementCost),
    zero,
  );
  const totalFundExpenses = breakdown.reduce(
    (a, p) => a.plus(p.fundExpenseCost),
    zero,
  );
  const totalPerformance = breakdown.reduce(
    (a, p) => a.plus(p.performanceCost),
    zero,
  );
  const totalCost = totalManagement
    .plus(totalFundExpenses)
    .plus(totalPerformance);
  const blendedRate = totalInvested.isZero()
    ? zero
    : totalCost.div(totalInvested);

  return {
    positions: breakdown,
    totalInvested,
    totalManagement,
    totalFundExpenses,
    totalPerformance,
    totalCost,
    blendedRate,
  };
}

/** One year on the fee-drag projection: gross vs. net wealth. */
export interface FeeDragPoint {
  /** Years from today (0 = now). */
  readonly year: number;
  /** Wealth compounding at the gross return, ignoring fees. */
  readonly gross: Decimal;
  /** Wealth compounding at the gross return net of the all-in fee each year. */
  readonly net: Decimal;
  /** Cumulative wealth lost to fees by this year (gross − net). */
  readonly drag: Decimal;
}

/** Result of a fee-drag projection. */
export interface FeeDrag {
  /** Per-year gross / net / drag series, length `years + 1` (year 0 included). */
  readonly points: readonly FeeDragPoint[];
  /** Starting capital. */
  readonly initial: Decimal;
  /** Annual gross return fraction used. */
  readonly grossReturn: Decimal;
  /** Annual all-in fee fraction used (drag per year). */
  readonly feeRate: Decimal;
  /** Terminal gross wealth. */
  readonly terminalGross: Decimal;
  /** Terminal net wealth. */
  readonly terminalNet: Decimal;
  /** Total wealth lost to fees over the horizon (terminalGross − terminalNet). */
  readonly totalDrag: Decimal;
  /**
   * Fraction of the *gross profit* consumed by fees over the horizon — the
   * headline "fees ate X% of your gains" number. 0 when there is no gross gain.
   */
  readonly dragShareOfProfit: Decimal;
}

/**
 * Project the long-run **fee drag**: how much compounded wealth is lost to an
 * annual fee, by growing the same capital at the gross return with and without
 * the fee deducted each year.
 *
 * Net growth compounds at `(1 + grossReturn) * (1 - feeRate)` per year, the
 * standard model for an annual expense charged on end-of-year assets. Pure and
 * deterministic.
 *
 * @param initial starting capital (>= 0)
 * @param grossReturn annual gross return fraction (may be negative)
 * @param feeRate annual all-in fee fraction (0..1)
 * @param years whole-number horizon (>= 1)
 */
export function projectFeeDrag(
  initial: Decimal.Value,
  grossReturn: Decimal.Value,
  feeRate: Decimal.Value,
  years: number,
): FeeDrag {
  const initialD = dec(initial, "initial");
  if (initialD.isNegative()) {
    throw new FeeError("initial must be non-negative");
  }
  const grossR = dec(grossReturn, "grossReturn");
  const fee = dec(feeRate, "feeRate");
  if (fee.isNegative() || fee.greaterThan(1)) {
    throw new FeeError("feeRate must be between 0 and 1");
  }
  if (!Number.isInteger(years) || years < 1) {
    throw new FeeError("years must be a positive integer");
  }

  const grossFactor = grossR.plus(1);
  const netFactor = grossFactor.times(new Decimal(1).minus(fee));

  const points: FeeDragPoint[] = [];
  for (let y = 0; y <= years; y++) {
    const gross = initialD.times(grossFactor.pow(y));
    const net = initialD.times(netFactor.pow(y));
    points.push({ year: y, gross, net, drag: gross.minus(net) });
  }

  const terminalGross = points[years].gross;
  const terminalNet = points[years].net;
  const totalDrag = terminalGross.minus(terminalNet);
  const grossProfit = terminalGross.minus(initialD);
  const dragShareOfProfit = grossProfit.greaterThan(0)
    ? totalDrag.div(grossProfit)
    : new Decimal(0);

  return {
    points,
    initial: initialD,
    grossReturn: grossR,
    feeRate: fee,
    terminalGross,
    terminalNet,
    totalDrag,
    dragShareOfProfit,
  };
}
