/**
 * m8-estate — Estate & succession planning: an entity-flow + liquidity-at-death
 * model for the read-only family office OS.
 *
 * Import {@link analyzeEstate} to derive the estate tax, the liquidity-at-death
 * coverage and funding waterfall, per-beneficiary net inheritance, and the
 * entity → beneficiary succession flow from an {@link EstatePlan}. The
 * {@link seededEstatePlan} fixture is deterministic sample data for tests and
 * the UI. Everything is pure, offline and Decimal-backed.
 */
export * from "./estate";
export * from "./fixtures";
