/**
 * Crypto price adapter (CoinGecko, keyless).
 *
 * A read-only adapter over CoinGecko's free public price API. The network call
 * is injectable so the parser is unit-tested against offline fixtures and never
 * hits the live API (AGENTS.md). Prices are converted to exact
 * {@link import("../../money").Money}/`Decimal` values, never floating-point.
 *
 * READ-ONLY product: reports market prices for valuation; never moves money.
 */
export * from "./schema";
export * from "./parse";
export * from "./client";
// NOTE: `./fixtures` is intentionally NOT re-exported here. Those are static
// test snapshots with no runtime use; re-exporting them would pull them into
// every production bundle that imports this adapter. Tests import the fixtures
// directly from "./fixtures".
