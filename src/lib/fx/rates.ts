import { Decimal } from "decimal.js";

import { Money } from "../money";
import { CurrencyCode } from "../model/primitives";
import { FrankfurterResponse } from "./primitives";

/**
 * An immutable table of exchange rates anchored to a single base currency.
 *
 * Every rate is the price of one unit of {@link base} expressed in some quote
 * currency, stored as an exact {@link Decimal}. Conversions go through the base
 * currency (a "triangulation"): to convert FROM→TO we first express the amount
 * in the base, then multiply into the target. This keeps a single source of
 * truth and matches how frankfurter.dev publishes its rates.
 *
 * READ-ONLY product: this converts amounts for *reporting*, never moves funds.
 */
export class RateTable {
  /** The anchor currency every stored rate is quoted against. */
  readonly base: string;
  /** Observation date of the rates (ISO `YYYY-MM-DD`), when known. */
  readonly date?: string;
  /** quote currency → units of that currency per 1 unit of {@link base}. */
  private readonly rates: ReadonlyMap<string, Decimal>;

  private constructor(
    base: string,
    rates: ReadonlyMap<string, Decimal>,
    date?: string,
  ) {
    this.base = base;
    this.date = date;
    this.rates = rates;
    Object.freeze(this);
  }

  /**
   * Build a table from a base currency and a map of quote→rate. The base maps
   * to 1 implicitly; supplying an explicit base rate is allowed only when it is
   * exactly 1. Rates must be strictly positive and finite.
   */
  static of(
    base: string,
    rates: Record<string, string | number | Decimal>,
    date?: string,
  ): RateTable {
    const baseCode = CurrencyCode.parse(base);
    const map = new Map<string, Decimal>();
    map.set(baseCode, new Decimal(1));
    for (const [rawCode, rawRate] of Object.entries(rates)) {
      const code = CurrencyCode.parse(rawCode);
      const rate = new Decimal(rawRate);
      if (!rate.isFinite() || rate.lessThanOrEqualTo(0)) {
        throw new Error(
          `FX rate for ${code} must be a finite positive number, got ${rate.toString()}`,
        );
      }
      if (code === baseCode && !rate.equals(1)) {
        throw new Error(
          `Base currency ${baseCode} must have rate 1, got ${rate.toString()}`,
        );
      }
      map.set(code, rate);
    }
    return new RateTable(baseCode, map, date);
  }

  /**
   * Build a table from a validated frankfurter.dev response. The upstream
   * `amount` field is the quantity of base the rates were quoted for (usually
   * 1); we normalize each rate back to a per-unit-of-base figure by dividing
   * by `amount`, so the table is always per 1 unit of base.
   */
  static fromFrankfurter(response: FrankfurterResponse): RateTable {
    const amount = new Decimal(response.amount);
    const rates: Record<string, Decimal> = {};
    for (const [code, rate] of Object.entries(response.rates)) {
      rates[code] = new Decimal(rate).div(amount);
    }
    return RateTable.of(response.base, rates, response.date);
  }

  /** Currencies this table can convert (including the base), sorted. */
  currencies(): string[] {
    return [...this.rates.keys()].sort();
  }

  /** True when a rate for `currency` is available (the base always is). */
  has(currency: string): boolean {
    return this.rates.has(CurrencyCode.parse(currency));
  }

  /**
   * Units of `currency` per 1 unit of {@link base}, as an exact {@link Decimal}.
   * Throws when the currency is not in the table.
   */
  rateFor(currency: string): Decimal {
    const code = CurrencyCode.parse(currency);
    const rate = this.rates.get(code);
    if (!rate) {
      throw new Error(
        `No FX rate for ${code} in table based on ${this.base}`,
      );
    }
    return rate;
  }

  /**
   * The cross rate from `from`→`to`: how many units of `to` one unit of `from`
   * buys, derived by triangulating through the base. Returns an exact
   * {@link Decimal}.
   */
  crossRate(from: string, to: string): Decimal {
    const fromRate = this.rateFor(from);
    const toRate = this.rateFor(to);
    // One unit of `from` is 1/fromRate units of base, which buys toRate/fromRate
    // units of `to`. Pure ratio — no amount is involved.
    return toRate.div(fromRate);
  }

  /**
   * Convert a {@link Money} amount into `to` currency using this table.
   * The returned {@link Money} carries the converted amount; round it for
   * display via {@link Money.round} or {@link Money.format}.
   *
   * We compute `amount * toRate / fromRate` as a single chain, deferring the
   * one unavoidable division to the end. This is strictly more accurate than
   * pre-computing a cross rate and multiplying, because it avoids rounding an
   * intermediate non-terminating quotient (e.g. converting 850 GBP back to EUR
   * yields exactly 1000 rather than 999.999…996).
   */
  convert(amount: Money, to: string): Money {
    const target = CurrencyCode.parse(to);
    if (amount.currency === target) {
      return amount;
    }
    const fromRate = this.rateFor(amount.currency);
    const toRate = this.rateFor(target);
    return Money.of(amount.amount.times(toRate).div(fromRate), target);
  }
}
