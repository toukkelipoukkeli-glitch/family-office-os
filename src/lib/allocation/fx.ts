import { Decimal } from "decimal.js";

import { Money } from "../money";

/**
 * Minimal, deterministic FX conversion for allocation roll-ups.
 *
 * Allocation needs to express every holding's value in a single base currency.
 * Live FX retrieval is a separate concern (a different unit owns the live
 * frankfurter.dev adapter); here we take an explicit, pre-resolved table of
 * rates so allocation math stays pure, deterministic, and offline-testable.
 *
 * A {@link FxRateTable} maps a 3-letter currency code to the number of units
 * of the base currency that **one** unit of that currency is worth. The base
 * currency itself always converts at exactly 1. Rates are exact decimal
 * strings (or {@link Decimal}s) so we never lose precision.
 *
 * READ-ONLY product: this converts reported values for display, it never moves
 * money.
 */

/** Value accepted for an FX rate: an exact decimal string, number, or Decimal. */
export type FxRateInput = string | number | Decimal;

/**
 * A resolved set of FX rates against a single base currency.
 *
 * `rates[CCY]` is how many units of `base` one unit of `CCY` buys. The base
 * currency need not appear in `rates` (it is always 1); if it does appear it
 * must be 1.
 */
export interface FxRateTable {
  /** The base currency every rate is quoted against (3-letter code). */
  base: string;
  /** `code -> units of base per 1 unit of code`. */
  rates: Record<string, FxRateInput>;
}

function normalizeCode(currency: string): string {
  const code = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    throw new Error(
      `Invalid currency code: ${JSON.stringify(currency)} (expected 3 letters)`,
    );
  }
  return code;
}

/**
 * An FX converter bound to a single base currency. Built from an
 * {@link FxRateTable} via {@link FxConverter.fromTable}; converts any
 * {@link Money} whose currency is the base or has a listed rate.
 */
export class FxConverter {
  /** Normalized base currency code. */
  readonly base: string;
  private readonly rates: Map<string, Decimal>;

  private constructor(base: string, rates: Map<string, Decimal>) {
    this.base = base;
    this.rates = rates;
    Object.freeze(this);
  }

  /** Build a converter from a plain {@link FxRateTable}. */
  static fromTable(table: FxRateTable): FxConverter {
    const base = normalizeCode(table.base);
    const rates = new Map<string, Decimal>();
    rates.set(base, new Decimal(1));
    for (const [code, rate] of Object.entries(table.rates)) {
      const norm = normalizeCode(code);
      let dec: Decimal;
      try {
        dec = new Decimal(rate);
      } catch {
        throw new Error(
          `Invalid FX rate for ${norm}: ${JSON.stringify(rate)}`,
        );
      }
      // A non-base rate of 0 would silently value any holding in that currency
      // at zero base-currency, corrupting allocation weights and totals with no
      // error. Real FX rates are strictly positive, so reject zero for non-base
      // entries (the base itself is handled by the `=== base` check below).
      if (!dec.isFinite() || dec.isNegative() || dec.isZero()) {
        throw new Error(
          `FX rate for ${norm} must be a finite, positive number`,
        );
      }
      if (norm === base && !dec.equals(1)) {
        throw new Error(
          `FX rate for the base currency ${base} must be 1, got ${dec.toFixed()}`,
        );
      }
      rates.set(norm, dec);
    }
    return new FxConverter(base, rates);
  }

  /**
   * True when this converter can convert `currency` to the base. A malformed
   * currency string (not a 3-letter code) is simply not convertible and
   * returns `false` rather than throwing, so callers can probe arbitrary input.
   */
  canConvert(currency: string): boolean {
    let code: string;
    try {
      code = normalizeCode(currency);
    } catch {
      return false;
    }
    return this.rates.has(code);
  }

  /**
   * Convert `money` into the base currency. Throws when no rate is known for
   * the source currency (rather than silently dropping the holding from a
   * roll-up).
   */
  toBase(money: Money): Money {
    const code = normalizeCode(money.currency);
    if (code === this.base) {
      return money;
    }
    const rate = this.rates.get(code);
    if (!rate) {
      throw new Error(
        `No FX rate from ${code} to base ${this.base}`,
      );
    }
    return Money.of(money.amount.times(rate), this.base);
  }
}
