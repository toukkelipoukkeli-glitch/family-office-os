import { Decimal } from "decimal.js";

import { xirr, type DatedCashflow } from "./xirr";

/**
 * Money-weighted return (MWR).
 *
 * MWR is the internal rate of return of an investor's actual cashflows: the
 * single rate that makes the net present value of every contribution,
 * withdrawal, and the terminal portfolio value equal to zero. Unlike
 * {@link timeWeightedReturn}, MWR *is* sensitive to the size and timing of
 * cashflows — it answers "what return did this investor actually earn on the
 * dollars they had invested?".
 *
 * We model MWR as an XIRR over the dated external cashflows plus a terminal
 * "redemption" of the ending market value:
 *
 *  - The opening market value is an *outflow* (money the investor put to work):
 *    recorded as a **negative** cashflow.
 *  - Each external deposit is a further outflow (negative); each withdrawal is
 *    an inflow (positive). (Sign convention matches {@link DatedCashflow}:
 *    money *into* the investor is positive.)
 *  - The ending market value is the terminal inflow (positive), as if the
 *    investor liquidated.
 *
 * This is a READ-ONLY product: MWR *reports* a return; it never moves money.
 */

/**
 * A dated portfolio flow from the investor's perspective.
 *
 *  - `contribution > 0` is money the investor *put in* (deposit).
 *  - `contribution < 0` is money the investor *took out* (withdrawal).
 *
 * Internally a contribution becomes a negative cashflow (outflow from the
 * investor) and a withdrawal becomes a positive one, matching XIRR's sign
 * convention.
 */
export interface PortfolioFlow {
  /** Date of the flow (ISO YYYY-MM-DD or `Date`). */
  date: string | Date;
  /** Investor contribution: deposit > 0, withdrawal < 0. */
  contribution: Decimal.Value;
}

export interface MwrInput {
  /** Opening market value and its date. */
  openingValue: Decimal.Value;
  openingDate: string | Date;
  /** External contributions/withdrawals between open and close. */
  flows?: PortfolioFlow[];
  /** Ending market value and its date. */
  endingValue: Decimal.Value;
  endingDate: string | Date;
}

export interface MwrOptions {
  /** Initial guess passed through to the solver. */
  guess?: number;
  tolerance?: number;
  maxIterations?: number;
}

/**
 * Compute the annualized money-weighted return (the XIRR of the investor's
 * dated cashflows including opening and terminal market values).
 *
 * Returns the annual rate as a `Decimal` (e.g. `0.0834` = 8.34%).
 */
export function moneyWeightedReturn(
  input: MwrInput,
  options: MwrOptions = {},
): Decimal {
  const opening = new Decimal(input.openingValue);
  const ending = new Decimal(input.endingValue);
  if (opening.isNegative()) {
    throw new Error("mwr: openingValue must be non-negative");
  }
  if (ending.isNegative()) {
    throw new Error("mwr: endingValue must be non-negative");
  }

  const cashflows: DatedCashflow[] = [];
  // Opening value: money put to work => outflow from the investor => negative.
  cashflows.push({ date: input.openingDate, amount: opening.negated() });

  for (const flow of input.flows ?? []) {
    // contribution > 0 (deposit) => outflow => negative amount.
    const amount = new Decimal(flow.contribution).negated();
    cashflows.push({ date: flow.date, amount });
  }

  // Terminal liquidation: ending value is an inflow to the investor.
  cashflows.push({ date: input.endingDate, amount: ending });

  return xirr(cashflows, options);
}
