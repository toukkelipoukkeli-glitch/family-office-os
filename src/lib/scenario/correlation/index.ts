/**
 * Scenario correlation: a documented, assumption-based cross-asset correlation
 * matrix plus the structural checks (symmetry, in-range, positive
 * semi-definiteness) that any correlation matrix used in scenario / stress
 * analysis must satisfy.
 *
 * Pure, deterministic, offline. READ-ONLY product: assumptions and analytics
 * only — nothing here moves money or places trades.
 */
export * from "./matrix";
export * from "./assumptions";
