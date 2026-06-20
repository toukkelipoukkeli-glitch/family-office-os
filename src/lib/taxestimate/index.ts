/**
 * m9-tax-estimate — consolidated annual tax estimator for the read-only family
 * office OS.
 *
 * Import {@link estimateTax} to roll up realized short/long-term capital gains
 * (from the tax-lot engine), banked harvested losses, ordinary income and
 * deductible fees into a single estimated tax bill under a configurable
 * progressive {@link RateSchedule}; {@link applyBrackets} for the bare
 * bracket-stacking primitive; and the fixtures as deterministic sample data.
 */
export * from "./taxestimate";
export * from "./fixtures";
