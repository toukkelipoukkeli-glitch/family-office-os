/**
 * FX adapter + multi-currency normalization for a read-only family office OS.
 *
 * - {@link FxAdapter} fetches reference rates from frankfurter.dev (network is
 *   injectable, so tests run fully offline against fixtures).
 * - {@link RateTable} models a base-anchored set of rates and converts amounts
 *   with exact {@link Decimal} arithmetic (never floating-point currency).
 * - {@link normalizeAmounts} / {@link totalInBase} roll multi-currency amounts
 *   up into a single reporting base currency.
 *
 * Nothing here moves money or executes a real currency exchange — it only
 * reports converted values.
 */
export * from "./primitives";
export * from "./rates";
export * from "./adapter";
export * from "./normalize";
