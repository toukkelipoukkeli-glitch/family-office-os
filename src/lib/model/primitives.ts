import * as z from "zod";

/**
 * Shared primitive schemas for the portfolio data model.
 *
 * This is a READ-ONLY product: these schemas model and validate portfolio
 * state, they never describe an operation that moves money or places a trade.
 */

/** ISO-4217-style 3-letter currency code (uppercase). */
export const CurrencyCode = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase())
  .pipe(
    z
      .string()
      .regex(/^[A-Z]{3}$/, "currency must be a 3-letter ISO-4217 code"),
  );
export type CurrencyCode = z.infer<typeof CurrencyCode>;

/**
 * An exact decimal amount, stored as a string to avoid floating-point loss
 * (see AGENTS.md: "Money is `Decimal`. Never floating-point currency.").
 * Accepts an optional leading sign and an optional fractional part.
 */
export const DecimalString = z
  .string()
  .trim()
  .regex(/^-?\d+(\.\d+)?$/, "must be a decimal number string");
export type DecimalString = z.infer<typeof DecimalString>;

/**
 * A non-negative exact decimal amount (e.g. a quantity or price), stored as a
 * string. Disallows a leading minus sign.
 */
export const NonNegativeDecimalString = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/, "must be a non-negative decimal number string");
export type NonNegativeDecimalString = z.infer<typeof NonNegativeDecimalString>;

/**
 * Money value object as serialized by {@link Money.toJSON} in `src/lib/money.ts`:
 * an exact decimal `amount` string plus a normalized `currency` code.
 */
export const MoneySchema = z
  .object({
    amount: DecimalString,
    currency: CurrencyCode,
  })
  .strict();
export type MoneyValue = z.infer<typeof MoneySchema>;

/** Same as {@link MoneySchema} but the amount must be non-negative. */
export const NonNegativeMoneySchema = z
  .object({
    amount: NonNegativeDecimalString,
    currency: CurrencyCode,
  })
  .strict();
export type NonNegativeMoneyValue = z.infer<typeof NonNegativeMoneySchema>;

/**
 * An ISO-8601 calendar date (YYYY-MM-DD). Validated for shape *and* real
 * calendar validity (e.g. `2026-02-30` is rejected).
 */
export const IsoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be an ISO date (YYYY-MM-DD)")
  .refine((s) => {
    const [y, m, d] = s.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return (
      dt.getUTCFullYear() === y &&
      dt.getUTCMonth() === m - 1 &&
      dt.getUTCDate() === d
    );
  }, "must be a real calendar date");
export type IsoDate = z.infer<typeof IsoDate>;

/** An ISO-8601 timestamp (a value parseable by `Date`, e.g. RFC-3339). */
export const IsoDateTime = z
  .string()
  .trim()
  .refine((s) => !Number.isNaN(Date.parse(s)), "must be an ISO timestamp");
export type IsoDateTime = z.infer<typeof IsoDateTime>;

/** A non-empty, trimmed identifier string. */
export const Id = z.string().trim().min(1, "id must not be empty");
export type Id = z.infer<typeof Id>;
