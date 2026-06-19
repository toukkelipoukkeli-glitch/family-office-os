import { Decimal } from "decimal.js";

/**
 * Immutable money value object.
 *
 * Amounts are stored as a {@link Decimal} so we never lose precision to
 * floating-point arithmetic (see AGENTS.md: "Money is `Decimal`. Never
 * floating-point currency."). A `Money` carries an ISO-4217-style currency
 * code and an exact decimal amount; all arithmetic returns a fresh `Money`
 * and never mutates the receiver.
 *
 * This is a READ-ONLY product: this type models and reports money, it never
 * moves it.
 */

/** Rounding mode used when an operation must reduce precision (e.g. {@link Money.format}). */
export type RoundingMode =
  | "half-up"
  | "half-even"
  | "up"
  | "down"
  | "ceil"
  | "floor";

const ROUNDING_MAP: Record<RoundingMode, Decimal.Rounding> = {
  "half-up": Decimal.ROUND_HALF_UP,
  "half-even": Decimal.ROUND_HALF_EVEN,
  up: Decimal.ROUND_UP,
  down: Decimal.ROUND_DOWN,
  ceil: Decimal.ROUND_CEIL,
  floor: Decimal.ROUND_FLOOR,
};

/**
 * Number of minor-unit digits (decimal places) for known currencies.
 * Most are 2; a few common exceptions are listed explicitly. Unknown
 * currencies default to 2 via {@link minorUnitsFor}.
 */
const MINOR_UNITS: Record<string, number> = {
  JPY: 0,
  KRW: 0,
  CLP: 0,
  ISK: 0,
  VND: 0,
  XAF: 0,
  XOF: 0,
  XPF: 0,
  BHD: 3,
  KWD: 3,
  OMR: 3,
  TND: 3,
  IQD: 3,
  JOD: 3,
  LYD: 3,
};

/** Value accepted when constructing a {@link Money} amount. */
export type AmountInput = string | number | Decimal;

/** Sentinel returned by {@link Money.compare}: -1, 0, or 1. */
export type CompareResult = -1 | 0 | 1;

function normalizeCurrency(currency: string): string {
  const code = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    throw new Error(
      `Invalid currency code: ${JSON.stringify(currency)} (expected 3 letters)`,
    );
  }
  return code;
}

function toDecimal(amount: AmountInput): Decimal {
  if (amount instanceof Decimal) {
    if (!amount.isFinite()) {
      throw new Error("Money amount must be a finite number");
    }
    return amount;
  }
  if (typeof amount === "number" && !Number.isFinite(amount)) {
    throw new Error("Money amount must be a finite number");
  }
  let dec: Decimal;
  try {
    dec = new Decimal(amount);
  } catch {
    throw new Error(`Invalid money amount: ${JSON.stringify(amount)}`);
  }
  if (!dec.isFinite()) {
    throw new Error("Money amount must be a finite number");
  }
  return dec;
}

/** Number of minor-unit digits for a currency (default 2 for unknown codes). */
export function minorUnitsFor(currency: string): number {
  return MINOR_UNITS[normalizeCurrency(currency)] ?? 2;
}

export class Money {
  /** Exact decimal amount. */
  readonly amount: Decimal;
  /** Normalized 3-letter currency code (uppercase). */
  readonly currency: string;

  private constructor(amount: Decimal, currency: string) {
    this.amount = amount;
    this.currency = currency;
    Object.freeze(this);
  }

  /** Construct a `Money` from an amount and currency code. */
  static of(amount: AmountInput, currency: string): Money {
    return new Money(toDecimal(amount), normalizeCurrency(currency));
  }

  /** A zero amount in the given currency. */
  static zero(currency: string): Money {
    return new Money(new Decimal(0), normalizeCurrency(currency));
  }

  /**
   * Construct from an integer number of minor units (e.g. cents).
   * `Money.fromMinorUnits(1099, "USD")` is `$10.99`.
   */
  static fromMinorUnits(minorUnits: number | bigint | string, currency: string): Money {
    const code = normalizeCurrency(currency);
    const units = minorUnitsFor(code);
    const raw = toDecimal(typeof minorUnits === "bigint" ? minorUnits.toString() : minorUnits);
    if (!raw.isInteger()) {
      throw new Error("minorUnits must be an integer");
    }
    return new Money(raw.div(new Decimal(10).pow(units)), code);
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new Error(
        `Currency mismatch: ${this.currency} vs ${other.currency}`,
      );
    }
  }

  /** Sum of two same-currency amounts. */
  plus(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amount.plus(other.amount), this.currency);
  }

  /** Difference of two same-currency amounts. */
  minus(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amount.minus(other.amount), this.currency);
  }

  /** Multiply by a scalar factor (e.g. quantity or rate). */
  times(factor: AmountInput): Money {
    return new Money(this.amount.times(toDecimal(factor)), this.currency);
  }

  /** Divide by a scalar divisor. Throws on division by zero. */
  dividedBy(divisor: AmountInput): Money {
    const d = toDecimal(divisor);
    if (d.isZero()) {
      throw new Error("Division by zero");
    }
    return new Money(this.amount.div(d), this.currency);
  }

  /** Negated amount. */
  negated(): Money {
    return new Money(this.amount.negated(), this.currency);
  }

  /** Absolute value. */
  abs(): Money {
    return new Money(this.amount.abs(), this.currency);
  }

  /**
   * Split this amount across `parts` according to integer weights, with no
   * lost or invented minor units: the allocated pieces always sum exactly to
   * the original amount.
   *
   * Allocation works in minor units. Each part receives `floor` of its
   * proportional share, then the leftover minor units are distributed one at a
   * time to the parts with the largest weights (ties broken by order). This is
   * the classic "largest remainder" allocation.
   *
   * @param weights positive-or-zero integer weights; their sum must be > 0.
   */
  allocate(weights: number[]): Money[] {
    if (weights.length === 0) {
      throw new Error("allocate requires at least one weight");
    }
    if (
      weights.some(
        (w) => !Number.isInteger(w) || w < 0 || !Number.isFinite(w),
      )
    ) {
      throw new Error("allocate weights must be non-negative integers");
    }
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) {
      throw new Error("allocate weights must sum to a positive value");
    }

    const units = minorUnitsFor(this.currency);
    const scale = new Decimal(10).pow(units);
    // Work in integer minor units. Round the source amount to the currency's
    // minor unit so allocation is exact; carry the sign explicitly so flooring
    // distributes remainders consistently for negative amounts.
    const totalMinor = this.amount
      .times(scale)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN);
    const negative = totalMinor.isNegative();
    const absMinor = totalMinor.abs();

    const baseShares: Decimal[] = [];
    const remainders: { index: number; remainder: Decimal; weight: number }[] =
      [];
    let allocated = new Decimal(0);

    for (let i = 0; i < weights.length; i++) {
      const ideal = absMinor.times(weights[i]).div(total);
      const share = ideal.floor();
      baseShares.push(share);
      allocated = allocated.plus(share);
      remainders.push({
        index: i,
        remainder: ideal.minus(share),
        weight: weights[i],
      });
    }

    let leftover = absMinor.minus(allocated);
    // Distribute leftover minor units to the largest fractional remainders.
    remainders.sort((a, b) => {
      const cmp = b.remainder.comparedTo(a.remainder);
      if (cmp !== 0) return cmp;
      const wcmp = b.weight - a.weight;
      if (wcmp !== 0) return wcmp;
      return a.index - b.index;
    });
    // `remainders` always has one entry per weight (>= 1), so we only need to
    // loop until the leftover minor units are exhausted.
    let r = 0;
    while (leftover.greaterThan(0)) {
      baseShares[remainders[r % remainders.length].index] = baseShares[
        remainders[r % remainders.length].index
      ].plus(1);
      leftover = leftover.minus(1);
      r++;
    }

    return baseShares.map((share) => {
      const signed = negative ? share.negated() : share;
      return new Money(signed.div(scale), this.currency);
    });
  }

  /** Compare two same-currency amounts. Returns -1, 0, or 1. */
  compare(other: Money): CompareResult {
    this.assertSameCurrency(other);
    return this.amount.comparedTo(other.amount) as CompareResult;
  }

  /** True when same currency and exactly equal amount. */
  equals(other: Money): boolean {
    return this.currency === other.currency && this.amount.equals(other.amount);
  }

  /** True when this amount is strictly less than `other` (same currency). */
  lessThan(other: Money): boolean {
    return this.compare(other) < 0;
  }

  /** True when this amount is strictly greater than `other` (same currency). */
  greaterThan(other: Money): boolean {
    return this.compare(other) > 0;
  }

  /** True when the amount is exactly zero. */
  isZero(): boolean {
    return this.amount.isZero();
  }

  /** True when the amount is strictly negative. */
  isNegative(): boolean {
    return this.amount.isNegative() && !this.amount.isZero();
  }

  /** True when the amount is strictly positive. */
  isPositive(): boolean {
    return this.amount.isPositive() && !this.amount.isZero();
  }

  /**
   * Round to the currency's minor unit (or `fractionDigits` if given) and
   * return a new `Money`. Defaults to banker's rounding (half-even).
   */
  round(
    fractionDigits?: number,
    mode: RoundingMode = "half-even",
  ): Money {
    const dp = fractionDigits ?? minorUnitsFor(this.currency);
    return new Money(
      this.amount.toDecimalPlaces(dp, ROUNDING_MAP[mode]),
      this.currency,
    );
  }

  /**
   * Integer number of minor units (e.g. cents), rounded to the currency scale.
   *
   * Returns a native `number`. Throws a `RangeError` when the result exceeds
   * `Number.MAX_SAFE_INTEGER`, rather than silently returning a lossy float —
   * use {@link toMinorUnitsBigInt} for arbitrarily large balances.
   */
  toMinorUnits(mode: RoundingMode = "half-even"): number {
    const minor = this.minorUnitsDecimal(mode);
    if (minor.abs().greaterThan(Number.MAX_SAFE_INTEGER)) {
      throw new RangeError(
        `Minor units ${minor.toFixed()} exceed Number.MAX_SAFE_INTEGER; use toMinorUnitsBigInt()`,
      );
    }
    return minor.toNumber();
  }

  /** Integer number of minor units as a `bigint`, exact for arbitrarily large balances. */
  toMinorUnitsBigInt(mode: RoundingMode = "half-even"): bigint {
    return BigInt(this.minorUnitsDecimal(mode).toFixed());
  }

  private minorUnitsDecimal(mode: RoundingMode): Decimal {
    const units = minorUnitsFor(this.currency);
    return this.amount
      .times(new Decimal(10).pow(units))
      .toDecimalPlaces(0, ROUNDING_MAP[mode]);
  }

  /** Exact decimal string of the underlying amount (no rounding). */
  toString(): string {
    return `${this.amount.toFixed()} ${this.currency}`;
  }

  /** Plain JSON representation: `{ amount, currency }` with an exact amount string. */
  toJSON(): { amount: string; currency: string } {
    return { amount: this.amount.toFixed(), currency: this.currency };
  }

  /**
   * Localized, currency-formatted string via {@link Intl.NumberFormat}.
   * Rounds to the currency's minor unit using `mode` (default half-even)
   * before formatting so the displayed value matches the rounded amount.
   */
  format(
    options: {
      locale?: string;
      mode?: RoundingMode;
      fractionDigits?: number;
    } = {},
  ): string {
    const { locale = "en-US", mode = "half-even", fractionDigits } = options;
    const dp = fractionDigits ?? minorUnitsFor(this.currency);
    const rounded = this.amount.toDecimalPlaces(dp, ROUNDING_MAP[mode]);
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: this.currency,
      minimumFractionDigits: dp,
      maximumFractionDigits: dp,
    }).format(rounded.toNumber());
  }
}

/** Sum a list of same-currency `Money` values. Requires `currency` when the list may be empty. */
export function sumMoney(items: Money[], currency?: string): Money {
  if (items.length === 0) {
    if (!currency) {
      throw new Error("sumMoney of an empty list requires a currency");
    }
    return Money.zero(currency);
  }
  return items.reduce((acc, m) => acc.plus(m));
}
