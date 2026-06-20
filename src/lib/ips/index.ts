/**
 * IPS / mandate compliance.
 *
 * A governed {@link InvestmentPolicy} model ({@link ./policy}) generalizing the
 * m7 alert rules into a formal Investment Policy Statement: named constraints
 * (asset-class min/max bands, a single-position concentration cap, a liquidity
 * floor, per-currency caps) plus a policy-benchmark reference. The pure,
 * deterministic engine ({@link ./engine}) evaluates the policy against a
 * portfolio's allocation breakdowns and reports every breach; the history
 * helper ({@link ./history}) diffs successive evaluations into a governance log
 * of opened / persisting / resolved breaches.
 *
 * READ-ONLY product: an IPS describes the mandate and the engine reports
 * compliance for a human to act on; nothing here moves money or places trades.
 */
export * from "./policy";
export * from "./engine";
export * from "./history";
export * from "./format";
export {
  ipsPortfolio,
  ipsRateTable,
  sampleIps,
  rebalancedPortfolio,
  ipsAsOf1,
  ipsAsOf2,
} from "./fixtures";
