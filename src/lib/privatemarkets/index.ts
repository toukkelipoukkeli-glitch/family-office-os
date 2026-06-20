/**
 * m9-pe-lifecycle — private-markets commitment lifecycle engine for the
 * read-only family office OS. Import the pure functions to compute
 * TVPI/DPI/RVPI/MOIC, unfunded commitment, PE IRR, and the J-curve pacing
 * series for a closed-end private fund, and the fixtures as deterministic
 * sample data.
 */
export {
  computeLifecycle,
  peIrr,
  type DecimalInput,
  type CashflowKind,
  type CashflowEntry,
  type Commitment,
  type FundPosition,
  type JCurvePoint,
  type LifecycleMetrics,
} from "./privatemarkets";
export { sampleFund, realizedVentureFund } from "./fixtures";
