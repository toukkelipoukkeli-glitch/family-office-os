import { Decimal } from "decimal.js";

/**
 * Time-weighted return (TWR).
 *
 * TWR measures the compound growth of one unit of money invested over a
 * period, *neutralizing* the timing and size of external cashflows (deposits /
 * withdrawals). It is the standard for judging manager/strategy skill because,
 * unlike money-weighted return, it does not reward or punish for cashflow
 * timing the investor controls.
 *
 * The period is split at each cashflow into sub-periods. For each sub-period we
 * compute a Holding-Period Return (HPR), then chain them geometrically:
 *
 *   1 + TWR = Π (1 + HPRᵢ)
 *
 * This is a READ-ONLY product: TWR *reports* a return; it never moves money.
 */

/**
 * A valuation observation, optionally with an external cashflow that occurred
 * at that observation. Convention:
 *
 *  - `value` is the portfolio market value *at* the observation, **after** the
 *    cashflow on that date has settled (end-of-day convention).
 *  - `cashflow` is the external flow on that date: a deposit is **positive**,
 *    a withdrawal is **negative**. Defaults to 0.
 *
 * The first observation's `value` is the starting market value; its `cashflow`
 * is ignored (the opening value already reflects the initial capital).
 */
export interface ValuationPoint {
  /** Optional label/date for the point (not used in the math). */
  date?: string | Date;
  /** Portfolio market value at this point (after same-day cashflow). */
  value: Decimal.Value;
  /** External cashflow at this point: deposit > 0, withdrawal < 0. Default 0. */
  cashflow?: Decimal.Value;
}

/**
 * Sub-period holding-period return for the period ending at `point`, given the
 * previous point's market value `prevValue`.
 *
 * With the end-of-day convention, the period's gain is the change in value less
 * the cashflow that entered/left during the period:
 *
 *   HPR = (Vₑ − Vₛ − CFₑ) / Vₛ
 *
 * where `CFₑ` is the cashflow recorded at the end point.
 */
function holdingPeriodReturn(prevValue: Decimal, point: ValuationPoint): Decimal {
  if (prevValue.isZero()) {
    throw new Error(
      "twr: starting value of a sub-period is zero; cannot compute return",
    );
  }
  const endValue = new Decimal(point.value);
  const cashflow = new Decimal(point.cashflow ?? 0);
  return endValue.minus(prevValue).minus(cashflow).div(prevValue);
}

export interface TwrResult {
  /** Total time-weighted return over the whole period (e.g. 0.21 = 21%). */
  twr: Decimal;
  /** Geometric growth factor: 1 + twr. */
  growthFactor: Decimal;
  /** Per-sub-period holding-period returns, in order. */
  subPeriodReturns: Decimal[];
}

/**
 * Compute the time-weighted return across an ordered series of valuation
 * points. Requires at least two points (an opening value and one later value).
 */
export function timeWeightedReturn(points: ValuationPoint[]): TwrResult {
  if (points.length < 2) {
    throw new Error("twr: need at least two valuation points");
  }

  const subPeriodReturns: Decimal[] = [];
  let growth = new Decimal(1);
  let prevValue = new Decimal(points[0].value);

  for (let i = 1; i < points.length; i++) {
    const hpr = holdingPeriodReturn(prevValue, points[i]);
    subPeriodReturns.push(hpr);
    growth = growth.times(hpr.plus(1));
    prevValue = new Decimal(points[i].value);
  }

  return {
    twr: growth.minus(1),
    growthFactor: growth,
    subPeriodReturns,
  };
}

/**
 * Annualize a total return over `years` years by geometric compounding:
 *
 *   annualized = (1 + total)^(1/years) − 1
 *
 * For sub-year periods this *de-annualizes* via the same formula, which can
 * overstate volatility; pass `years < 1` only when an annualized figure is
 * genuinely wanted. Throws for non-positive `years` or a total ≤ -100%.
 */
export function annualizeReturn(
  totalReturn: Decimal.Value,
  years: number,
): Decimal {
  if (!(years > 0)) {
    throw new Error("annualizeReturn: years must be positive");
  }
  const growth = new Decimal(totalReturn).plus(1);
  if (growth.lessThanOrEqualTo(0)) {
    throw new Error("annualizeReturn: total return must be greater than -100%");
  }
  return growth.pow(new Decimal(1).div(years)).minus(1);
}
