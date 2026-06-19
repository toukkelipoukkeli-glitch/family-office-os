/**
 * m5-captable — share-level cap table model + dilution math for the read-only
 * family office OS. Import the schemas to validate untrusted input at
 * boundaries, the pure functions to derive ownership/dilution, and the fixtures
 * as deterministic sample data.
 */
export * from "./captable";
export * from "./dilution";
export * from "./fixtures";
