/**
 * Returns engine for a read-only family office OS.
 *
 *  - {@link timeWeightedReturn} (TWR) — manager/strategy skill, cashflow-neutral.
 *  - {@link moneyWeightedReturn} (MWR) — investor's actual dollar-weighted IRR.
 *  - {@link xirr} — internal rate of return over irregularly-dated cashflows.
 *
 * All amounts are {@link Decimal} values; nothing here moves money or trades.
 */
export {
  timeWeightedReturn,
  annualizeReturn,
  type ValuationPoint,
  type TwrResult,
} from "./twr";
export {
  moneyWeightedReturn,
  type PortfolioFlow,
  type MwrInput,
  type MwrOptions,
} from "./mwr";
export {
  xirr,
  xnpv,
  type DatedCashflow,
  type XirrOptions,
} from "./xirr";
