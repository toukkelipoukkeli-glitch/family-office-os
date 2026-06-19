import * as z from "zod";

import { CurrencyCode, IsoDate } from "../model/primitives";

/**
 * Shared schemas for the FX (foreign-exchange) adapter.
 *
 * This is a READ-ONLY product: these schemas describe and validate exchange
 * rates used to *report* multi-currency holdings in a single base currency.
 * Nothing here moves money or executes a conversion of real funds.
 */

/** Re-export the shared currency-code schema so FX consumers have one import. */
export { CurrencyCode, IsoDate };

/**
 * A positive exchange-rate factor expressed as a string to avoid floating-point
 * loss (see AGENTS.md: "Money is `Decimal`. Never floating-point currency.").
 * A rate is the price of one unit of the *base* currency in the *quote*
 * currency, so it must be strictly greater than zero.
 *
 * Note: the frankfurter.dev wire format delivers rates as JSON numbers, so
 * {@link FrankfurterResponse} below decodes them with `z.number()`; those values
 * are immediately lifted into exact {@link Decimal}s in `RateTable.fromFrankfurter`
 * before any arithmetic, so no float math is ever performed on money. This schema
 * is the string-input guard used when rates are supplied as text (e.g. config,
 * caller-provided overrides) rather than off the wire.
 */
export const RateString = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/, "rate must be a non-negative decimal string")
  .refine((s) => Number(s) > 0, "rate must be strictly positive");
export type RateString = z.infer<typeof RateString>;

/**
 * Raw response shape returned by the frankfurter.dev `/latest` and
 * `/{date}` endpoints, e.g.
 *
 * ```json
 * { "amount": 1, "base": "EUR", "date": "2026-06-18",
 *   "rates": { "USD": 1.0837, "GBP": 0.8542 } }
 * ```
 *
 * We validate the wire payload with this schema before trusting it, so a
 * malformed or partial upstream response fails loudly at the boundary rather
 * than silently producing wrong conversions.
 */
export const FrankfurterResponse = z
  .object({
    amount: z.number().positive(),
    base: CurrencyCode,
    date: IsoDate,
    rates: z.record(
      CurrencyCode,
      z.number().positive("rate must be strictly positive"),
    ),
  })
  .strict();
export type FrankfurterResponse = z.infer<typeof FrankfurterResponse>;
