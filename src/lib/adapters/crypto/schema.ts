import * as z from "zod";

/**
 * Wire schemas for the CoinGecko crypto price adapter.
 *
 * These validate the raw JSON returned by CoinGecko's keyless public API so a
 * malformed or partial response is rejected at the boundary rather than
 * silently producing wrong prices. Numbers arrive as JSON numbers; we keep the
 * raw shape here and convert to exact {@link Money}/{@link Decimal} values in
 * the parser (see `parse.ts`).
 *
 * READ-ONLY product: this adapter only reads market prices for reporting; it
 * never moves money or places trades.
 */

/** A lowercase, non-empty CoinGecko coin id (e.g. `"bitcoin"`). */
export const CoinId = z
  .string()
  .trim()
  .min(1, "coin id must not be empty")
  .transform((s) => s.toLowerCase());
export type CoinId = z.infer<typeof CoinId>;

/**
 * A `vs_currency` code as accepted by CoinGecko: a lowercase alphanumeric
 * token. CoinGecko supports both fiat (`usd`, `eur`) and crypto (`btc`, `eth`)
 * quote currencies, so we do not restrict to ISO-4217.
 */
export const VsCurrency = z
  .string()
  .trim()
  .min(1, "vs_currency must not be empty")
  .regex(/^[a-z0-9]+$/i, "vs_currency must be alphanumeric")
  .transform((s) => s.toLowerCase());
export type VsCurrency = z.infer<typeof VsCurrency>;

/**
 * One coin's entry in a `/simple/price` response. Keys are dynamic
 * (`<vs_currency>`, `<vs_currency>_market_cap`, `<vs_currency>_24h_change`,
 * `last_updated_at`), so we model it as a record of finite numbers and pull the
 * structured fields out in the parser.
 */
export const SimplePriceEntry = z.record(
  z.string(),
  z.number().refine((n) => Number.isFinite(n), "price values must be finite"),
);
export type SimplePriceEntry = z.infer<typeof SimplePriceEntry>;

/**
 * Raw `/simple/price` response: `{ "<coin-id>": { "<vs>": 123.45, ... }, ... }`.
 */
export const SimplePriceResponse = z.record(z.string(), SimplePriceEntry);
export type SimplePriceResponse = z.infer<typeof SimplePriceResponse>;
