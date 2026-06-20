/**
 * Shared money / percent render-boundary formatters.
 *
 * This is the single place where exact values (`Decimal` / `Money` / a
 * fraction) become a localized display string. Per AGENTS.md, money is exact
 * `Decimal` everywhere upstream; numbers only appear *here*, at the render
 * boundary, via {@link Intl.NumberFormat}.
 *
 * These helpers consolidate the `Decimal -> number` + `Intl` currency / percent
 * / compact formatting that was previously copy-pasted across ~40 pages. The
 * defaults are chosen to reproduce the existing per-page formatters exactly, so
 * migrating a page to these helpers is a no-op for the rendered output.
 *
 * READ-ONLY product: these helpers only *display* money, they never move it.
 */

// `trailingZeroDisplay` is part of the ES2023 Intl spec and supported by every
// runtime we target, but the bundled TS DOM lib predates it. Augment the option
// type so we can use it type-safely (instead of an `as any` cast).
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Intl {
    interface NumberFormatOptions {
      trailingZeroDisplay?: "auto" | "stripIfInteger";
    }
  }
}

/** Default locale for all display formatting. */
export const DEFAULT_LOCALE = "en-US";

/** Anything that can be reduced to a native number at the render boundary. */
export interface NumberLike {
  toNumber(): number;
}

/** A {@link Money}-shaped value: an amount that is number-like plus a currency. */
export interface MoneyLike {
  readonly currency: string;
  readonly amount: NumberLike;
}

function toNum(value: number | string | NumberLike): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return value.toNumber();
}

/** Options shared by the currency formatters. */
export interface MoneyFormatOptions {
  /** BCP-47 locale; defaults to {@link DEFAULT_LOCALE}. */
  locale?: string;
  /** Compact (`$1.2M`) vs. standard (`$1,200,000`) notation. */
  notation?: "compact" | "standard";
  /** Maximum fractional digits. */
  maximumFractionDigits?: number;
  /** Minimum fractional digits. */
  minimumFractionDigits?: number;
  /** Sign display, e.g. `"exceptZero"` for an explicit `+`/`-`. */
  signDisplay?: Intl.NumberFormatOptions["signDisplay"];
}

/**
 * Compact currency, e.g. `$12.5M` / `€840K`.
 *
 * This is the most common page pattern: `notation: "compact"` with one
 * fractional digit. Pass `maximumFractionDigits` to widen (some pages use 2).
 */
export function formatMoneyCompact(
  value: number | string | NumberLike,
  currency: string,
  options: Omit<MoneyFormatOptions, "notation"> = {},
): string {
  const { locale = DEFAULT_LOCALE, maximumFractionDigits = 1, ...rest } = options;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits,
    // Strip a trailing `.0` (`$840.0K` -> `$840K`) so output is identical on
    // every ICU build. Without this, `maximumFractionDigits` alone keeps the
    // trailing zero on some platforms (Linux/CI) but not others (macOS dev),
    // which made rendered money strings non-deterministic across environments.
    trailingZeroDisplay: "stripIfInteger",
    ...rest,
  }).format(toNum(value));
}

/**
 * Whole currency with no fractional minor units, e.g. `$1,250,000`.
 *
 * Standard notation, `maximumFractionDigits: 0`.
 */
export function formatMoneyWhole(
  value: number | string | NumberLike,
  currency: string,
  options: Omit<MoneyFormatOptions, "notation"> = {},
): string {
  const { locale = DEFAULT_LOCALE, maximumFractionDigits = 0, ...rest } = options;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits,
    ...rest,
  }).format(toNum(value));
}

/**
 * Currency that is compact (`$1.2M`, 1 fraction digit) when `compact` is true,
 * or whole (`$1,200,000`, 0 fraction digits) otherwise.
 *
 * Reproduces the widespread `money(currency, value, compactN)` page helper.
 */
export function formatMoney(
  value: number | string | NumberLike,
  currency: string,
  options: { locale?: string; compact?: boolean } = {},
): string {
  const { locale = DEFAULT_LOCALE, compact = true } = options;
  return compact
    ? formatMoneyCompact(value, currency, { locale })
    : formatMoneyWhole(value, currency, { locale });
}

/**
 * Compact currency directly from a {@link Money}-shaped value, reading the
 * currency off the value itself, e.g. `compactMoney(money)`.
 */
export function formatMoneyValue(
  money: MoneyLike,
  options: Omit<MoneyFormatOptions, "notation"> = {},
): string {
  return formatMoneyCompact(money.amount.toNumber(), money.currency, options);
}

/**
 * Whole currency directly from a {@link Money}-shaped value, e.g.
 * `moneyFull(money)` → `$1,250,000`.
 */
export function formatMoneyValueWhole(
  money: MoneyLike,
  options: Omit<MoneyFormatOptions, "notation"> = {},
): string {
  return formatMoneyWhole(money.amount.toNumber(), money.currency, options);
}

/**
 * Signed compact currency with an explicit leading `+`/`-`, e.g. `-$1.3M` /
 * `+$4.0M`. The sign is derived from the value and the magnitude is formatted
 * from its absolute value (so `-0` renders as `+$0`).
 */
export function formatMoneySignedCompact(
  value: number | string | NumberLike,
  currency: string,
  options: Omit<MoneyFormatOptions, "notation" | "signDisplay"> = {},
): string {
  const n = toNum(value);
  const sign = n < 0 ? "-" : "+";
  return `${sign}${formatMoneyCompact(Math.abs(n), currency, options)}`;
}

/** Options for {@link formatPercent}. */
export interface PercentOptions {
  /** Fractional digits (fixed); defaults to 1. */
  digits?: number;
  /** Prefix non-negative values with an explicit `+`. */
  signed?: boolean;
}

/**
 * Percent from a fraction, e.g. `0.123` → `12.3%`.
 *
 * String-based (`(value * 100).toFixed(digits) + "%"`) to exactly match the
 * many page helpers that format percentages this way. Use {@link formatPercentIntl}
 * for `Intl`-localized percent (grouping, locale-aware sign).
 */
export function formatPercent(
  fraction: number | NumberLike,
  options: PercentOptions = {},
): string {
  const { digits = 1, signed = false } = options;
  const pct = toNum(fraction) * 100;
  const body = `${pct.toFixed(digits)}%`;
  if (signed && pct >= 0) return `+${body}`;
  return body;
}

/**
 * Signed percent from a fraction, always showing a leading `+`/`-`, e.g.
 * `+18.4%` / `-3.2%`. Shorthand for `formatPercent(f, { signed: true })`.
 */
export function formatPercentSigned(
  fraction: number | NumberLike,
  options: Omit<PercentOptions, "signed"> = {},
): string {
  return formatPercent(fraction, { ...options, signed: true });
}

/**
 * Locale-aware percent via {@link Intl.NumberFormat} (`style: "percent"`),
 * e.g. `0.5` → `+50.0%`. Unlike {@link formatPercent} this groups thousands and
 * uses the locale's sign placement.
 */
export function formatPercentIntl(
  fraction: number | NumberLike,
  options: {
    locale?: string;
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
    signed?: boolean;
  } = {},
): string {
  const {
    locale = DEFAULT_LOCALE,
    minimumFractionDigits = 1,
    maximumFractionDigits = 1,
    signed = false,
  } = options;
  return new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits,
    maximumFractionDigits,
    signDisplay: signed ? "exceptZero" : "auto",
  }).format(toNum(fraction));
}

/**
 * Plain compact number (no currency), e.g. `12500` → `12.5K`.
 */
export function formatCompact(
  value: number | string | NumberLike,
  options: { locale?: string; maximumFractionDigits?: number } = {},
): string {
  const { locale = DEFAULT_LOCALE, maximumFractionDigits = 1 } = options;
  return new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits,
    // Strip a trailing `.0` so `12.5K`/`842` render identically on every ICU
    // build (see formatMoneyCompact for why this is needed for determinism).
    trailingZeroDisplay: "stripIfInteger",
  }).format(toNum(value));
}

/**
 * A multiple / ratio suffixed with `x` or `×`, e.g. `1.72x`. The default
 * suffix is the ASCII `x`; pass `"×"` for the multiplication sign.
 */
export function formatMultiple(
  value: number | NumberLike,
  options: { digits?: number; suffix?: string } = {},
): string {
  const { digits = 2, suffix = "x" } = options;
  return `${toNum(value).toFixed(digits)}${suffix}`;
}

/**
 * Signed basis points from a fraction, e.g. `0.0123` → `+123 bps`.
 */
export function formatBps(value: number | NumberLike): string {
  const b = Math.round(toNum(value) * 10000);
  return `${b >= 0 ? "+" : ""}${b} bps`;
}
