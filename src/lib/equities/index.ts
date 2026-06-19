/**
 * Equities/ETF price adapter (Alpha Vantage) for the read-only family office OS.
 *
 * Public surface: the offline parsers + URL builder (`alpha-vantage`), the typed
 * domain values they produce, and recorded response fixtures for tests/sample
 * data. The live, server-side fetch lives in `convex/equities.ts` and reuses
 * these parsers — keep network I/O out of this module so it stays unit-testable
 * offline.
 */
export * from "./alpha-vantage";
export { alphaVantageFixtures } from "./fixtures";
export type { AlphaVantageFixtureName } from "./fixtures";
