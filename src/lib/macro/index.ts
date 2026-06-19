/**
 * FRED macro adapter: read-only access to public macroeconomic series
 * (10-Year Treasury rate, CPI) for the family office OS.
 *
 * - `series` — the series catalog + domain schemas/types.
 * - `fred-response` — raw FRED wire schemas + parser into domain types.
 * - `client` — the injectable-`fetch` adapter (offline-testable).
 * - `analysis` — pure helpers (e.g. year-over-year CPI change).
 *
 * Nothing here moves money or places a trade; it only reads and validates
 * observed data. Tests run fully offline against `fixtures`.
 */
export * from "./series";
export * from "./fred-response";
export * from "./client";
export * from "./analysis";
