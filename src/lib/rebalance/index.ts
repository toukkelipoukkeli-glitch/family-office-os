/**
 * m10-rebalance — tax-aware rebalancing *proposal* for the read-only family
 * office OS.
 *
 * Import {@link proposeRebalance} to turn a portfolio + target asset-class
 * allocation + tax rate schedule into the BUY / SELL trades that move the book
 * back toward target while **minimizing realized tax** (HIFO lot selection from
 * `../taxlots`), with the incremental tax estimated via `../taxestimate` and
 * the tax saved versus FIFO reported. The fixtures are deterministic sample
 * data.
 *
 * READ-ONLY product: this is a proposal a human reviews — it never executes a
 * trade or moves money.
 */
export * from "./rebalance";
export {
  rebalancePortfolio,
  rebalanceRateTable,
  rebalancePrices,
  rebalanceTargets,
  rebalanceSchedule,
  rebalanceAsOf,
  rebalanceYear,
  rebalanceEquity,
  rebalanceEtf,
  rebalanceCash,
} from "./fixtures";
