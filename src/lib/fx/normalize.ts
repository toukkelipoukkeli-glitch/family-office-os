import { Money, sumMoney } from "../money";
import { CurrencyCode } from "../model/primitives";
import { RateTable } from "./rates";

/**
 * Multi-currency normalization helpers built on a {@link RateTable}.
 *
 * These take amounts denominated in many currencies and roll them up into a
 * single base currency for reporting — the core of valuing a multi-currency
 * portfolio. READ-ONLY: this reports a converted total, it never moves money.
 */

/** One converted line: the original amount and its value in the base currency. */
export interface NormalizedAmount {
  /** The amount as originally denominated. */
  readonly original: Money;
  /** The same value expressed in the target base currency (exact, unrounded). */
  readonly converted: Money;
}

/**
 * Convert every amount in `amounts` into `baseCurrency` using `table`, keeping
 * both the original and converted figures. Amounts already in the base currency
 * pass through unchanged. Throws if the table lacks a needed rate.
 */
export function normalizeAmounts(
  amounts: readonly Money[],
  table: RateTable,
  baseCurrency: string,
): NormalizedAmount[] {
  const base = CurrencyCode.parse(baseCurrency);
  return amounts.map((original) => ({
    original,
    converted: table.convert(original, base),
  }));
}

/**
 * Sum a list of multi-currency amounts into a single {@link Money} in
 * `baseCurrency`. The result is exact (unrounded) — round for display via
 * {@link Money.round}. An empty list yields zero in the base currency.
 */
export function totalInBase(
  amounts: readonly Money[],
  table: RateTable,
  baseCurrency: string,
): Money {
  const base = CurrencyCode.parse(baseCurrency);
  const converted = amounts.map((a) => table.convert(a, base));
  return sumMoney(converted, base);
}
