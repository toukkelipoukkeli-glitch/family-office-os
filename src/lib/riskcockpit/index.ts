/**
 * Risk-limits cockpit (unit m9-risk-limits).
 *
 * Composes the m8 cross-entity look-through consolidation, a small governed set
 * of cross-asset risk limits (asset-class concentration caps, a liquidity floor,
 * an illiquid cap), the liquidity-tier split, and return-series risk metrics
 * into a single read-only risk picture: the family's *true* underlying
 * concentration measured against its limits.
 *
 * READ-ONLY product: the engine reports concentration and limit breaches for a
 * human to act on; nothing here moves money or places trades.
 */
export * from "./limits";
export * from "./cockpit";
export {
  RISK_ENTITIES,
  RISK_HOLDINGS,
  RISK_ROOT_ID,
  sampleRiskLimits,
  sampleReturns,
  sampleReturnsPeriodsPerYear,
  sampleRiskFreeRate,
} from "./fixtures";
