/**
 * m7-tax-lots — exact-decimal tax lot engine for the read-only family office
 * OS. Import the schemas to validate untrusted ledger input at boundaries, the
 * pure functions to realize gains / derive open lots under each selection
 * method (FIFO/LIFO/HIFO/spec-id), and the fixtures as deterministic sample
 * data.
 */
export * from "./taxlots";
export * from "./fixtures";
