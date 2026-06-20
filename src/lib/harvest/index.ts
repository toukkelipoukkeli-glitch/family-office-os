/**
 * m7-harvest — tax-loss-harvesting finder for the read-only family office OS.
 *
 * Import {@link findHarvestCandidates} to scan a ledger for underwater open lots
 * and flag wash-sale (±30-day) risk, {@link washSaleConflicts} for the raw
 * window check, and the fixtures as deterministic sample data.
 */
export * from "./harvest";
export * from "./fixtures";
