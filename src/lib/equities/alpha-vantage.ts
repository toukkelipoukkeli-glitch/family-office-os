import * as z from "zod";

import { Money } from "../money";
import { CurrencyCode, IsoDate } from "../model/primitives";

/**
 * Alpha Vantage equities/ETF price adapter — parsing layer.
 *
 * This module is the pure, offline, deterministic half of the adapter: it takes
 * the JSON Alpha Vantage returns and validates/normalizes it into typed domain
 * values. It never performs network I/O, so it can be unit-tested against
 * recorded fixtures (see `__fixtures__/`). The live fetch lives in the Convex
 * action (`convex/equities.ts`), which calls these parsers on the response.
 *
 * READ-ONLY product: this adapter only *reads* public market prices. Nothing
 * here moves money or places a trade.
 *
 * Alpha Vantage is quirky in two ways we defend against:
 *  1. On error/throttle it returns HTTP 200 with a body like
 *     `{ "Error Message": ... }`, `{ "Note": ... }`, or `{ "Information": ... }`
 *     instead of the expected payload. We surface these as typed errors.
 *  2. Numeric fields arrive as strings (e.g. "265.2600"); we keep them as exact
 *     decimal strings and wrap monetary values in {@link Money} so we never lose
 *     precision to floating point (see AGENTS.md).
 */

/** Endpoints this adapter knows how to build and parse. */
export type AlphaVantageFunction = "GLOBAL_QUOTE" | "TIME_SERIES_DAILY";

/** Base URL for the Alpha Vantage REST API. */
export const ALPHA_VANTAGE_BASE_URL = "https://www.alphavantage.co/query";

/**
 * Error raised when Alpha Vantage returns a non-data body: an explicit error,
 * a rate-limit note, an informational throttle message, or an empty payload.
 * Carries a coarse {@link AlphaVantageErrorKind} so callers can decide whether
 * to retry (rate limit) or give up (invalid symbol).
 */
export type AlphaVantageErrorKind =
  | "error" // explicit `Error Message` (e.g. bad symbol / malformed call)
  | "rate-limit" // `Note` / `Information` throttle message
  | "empty" // well-formed envelope but no rows (unknown symbol)
  | "malformed"; // body did not match any known shape

export class AlphaVantageError extends Error {
  readonly kind: AlphaVantageErrorKind;
  constructor(kind: AlphaVantageErrorKind, message: string) {
    super(message);
    this.name = "AlphaVantageError";
    this.kind = kind;
  }
}

/** A decimal-string price field as Alpha Vantage serializes it (e.g. "265.2600"). */
const PriceString = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/, "must be a non-negative decimal price string");

/** A non-negative integer volume serialized as a string (e.g. "3210456"). */
const VolumeString = z
  .string()
  .trim()
  .regex(/^\d+$/, "must be a non-negative integer string");

/**
 * Raw `Global Quote` object as returned by the `GLOBAL_QUOTE` function. Keys are
 * the literal, numbered field names Alpha Vantage uses. Unknown extra keys are
 * ignored (the schema is not `.strict()`) so a new field never breaks parsing.
 */
const RawGlobalQuote = z.object({
  "01. symbol": z.string().trim().min(1),
  "02. open": PriceString,
  "03. high": PriceString,
  "04. low": PriceString,
  "05. price": PriceString,
  "06. volume": VolumeString,
  "07. latest trading day": IsoDate,
  "08. previous close": PriceString,
  "09. change": z
    .string()
    .trim()
    .regex(/^-?\d+(\.\d+)?$/, "must be a signed decimal string"),
  "10. change percent": z.string().trim().min(1),
});

/** A single OHLCV bar within a daily time series. */
const RawDailyBar = z.object({
  "1. open": PriceString,
  "2. high": PriceString,
  "3. low": PriceString,
  "4. close": PriceString,
  "5. volume": VolumeString,
});

/**
 * A normalized, typed market quote for a single equity/ETF symbol.
 *
 * Prices are {@link Money} (currency-tagged exact decimals). Alpha Vantage does
 * not report a currency, so the caller supplies one (defaulting to USD, the
 * currency of the US-listed instruments this endpoint serves). `changePercent`
 * is the exact numeric fraction parsed from the `"0.5611%"` string.
 */
export interface EquityQuote {
  symbol: string;
  open: Money;
  high: Money;
  low: Money;
  price: Money;
  previousClose: Money;
  change: Money;
  /** Decimal-string percent change without the `%` sign (e.g. "0.5611"). */
  changePercent: string;
  volume: number;
  /** Exchange-local trading day (YYYY-MM-DD). */
  latestTradingDay: IsoDate;
  currency: CurrencyCode;
}

/** A single normalized OHLCV bar in a daily series. */
export interface DailyBar {
  date: IsoDate;
  open: Money;
  high: Money;
  low: Money;
  close: Money;
  volume: number;
  currency: CurrencyCode;
}

/** A normalized daily time series, newest bar first. */
export interface DailySeries {
  symbol: string;
  lastRefreshed: IsoDate;
  timeZone: string;
  /** Bars sorted by date descending (most recent first). */
  bars: DailyBar[];
  currency: CurrencyCode;
}

/** Options shared by the parsers. */
export interface ParseOptions {
  /**
   * Currency to tag prices with. Alpha Vantage omits currency from these
   * endpoints; US-listed symbols quote in USD, which is the default.
   */
  currency?: string;
}

/**
 * Detect and throw on Alpha Vantage's non-data responses (which arrive as HTTP
 * 200). Returns void when the body looks like real data and should be parsed.
 */
function assertNotAnError(body: unknown): asserts body is Record<string, unknown> {
  if (body === null || typeof body !== "object") {
    throw new AlphaVantageError(
      "malformed",
      "Alpha Vantage response was not a JSON object",
    );
  }
  const obj = body as Record<string, unknown>;
  if (typeof obj["Error Message"] === "string") {
    throw new AlphaVantageError("error", obj["Error Message"] as string);
  }
  // `Note` and `Information` are both throttle/informational messages.
  if (typeof obj["Note"] === "string") {
    throw new AlphaVantageError("rate-limit", obj["Note"] as string);
  }
  if (typeof obj["Information"] === "string") {
    throw new AlphaVantageError("rate-limit", obj["Information"] as string);
  }
}

/** Strip a trailing `%` and validate the remainder as a decimal string. */
function parseChangePercent(raw: string): string {
  const trimmed = raw.trim().replace(/%$/, "").trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    throw new AlphaVantageError(
      "malformed",
      `unparseable change percent: ${JSON.stringify(raw)}`,
    );
  }
  return trimmed;
}

/**
 * Parse a raw `GLOBAL_QUOTE` response body into a typed {@link EquityQuote}.
 *
 * Throws an {@link AlphaVantageError} when the body is an error/throttle message
 * or when the `Global Quote` envelope is present but empty (an unknown symbol
 * yields `{ "Global Quote": {} }`).
 */
export function parseGlobalQuote(
  body: unknown,
  options: ParseOptions = {},
): EquityQuote {
  assertNotAnError(body);
  const currency = CurrencyCode.parse(options.currency ?? "USD");

  const envelope = body["Global Quote"];
  if (envelope === undefined) {
    throw new AlphaVantageError(
      "malformed",
      "response did not contain a `Global Quote`",
    );
  }
  if (
    envelope === null ||
    typeof envelope !== "object" ||
    Object.keys(envelope as object).length === 0
  ) {
    throw new AlphaVantageError(
      "empty",
      "`Global Quote` was empty (unknown or unsupported symbol)",
    );
  }

  const parsed = RawGlobalQuote.safeParse(envelope);
  if (!parsed.success) {
    throw new AlphaVantageError(
      "malformed",
      `\`Global Quote\` failed validation: ${parsed.error.message}`,
    );
  }
  const q = parsed.data;
  const money = (amount: string) => Money.of(amount, currency);
  return {
    symbol: q["01. symbol"],
    open: money(q["02. open"]),
    high: money(q["03. high"]),
    low: money(q["04. low"]),
    price: money(q["05. price"]),
    previousClose: money(q["08. previous close"]),
    change: money(q["09. change"]),
    changePercent: parseChangePercent(q["10. change percent"]),
    volume: Number(q["06. volume"]),
    latestTradingDay: q["07. latest trading day"],
    currency,
  };
}

/**
 * Parse a raw `TIME_SERIES_DAILY` response body into a typed {@link DailySeries}
 * with bars sorted newest-first. Throws an {@link AlphaVantageError} on
 * error/throttle bodies or an empty series.
 */
export function parseDailySeries(
  body: unknown,
  options: ParseOptions = {},
): DailySeries {
  assertNotAnError(body);
  const currency = CurrencyCode.parse(options.currency ?? "USD");

  const meta = body["Meta Data"];
  const series = body["Time Series (Daily)"];
  if (
    meta === null ||
    typeof meta !== "object" ||
    series === null ||
    typeof series !== "object" ||
    series === undefined
  ) {
    throw new AlphaVantageError(
      "malformed",
      "response did not contain `Meta Data` and `Time Series (Daily)`",
    );
  }
  const metaObj = meta as Record<string, unknown>;
  const symbol = metaObj["2. Symbol"];
  const lastRefreshedRaw = metaObj["3. Last Refreshed"];
  const timeZone = metaObj["5. Time Zone"];
  if (typeof symbol !== "string" || typeof lastRefreshedRaw !== "string") {
    throw new AlphaVantageError("malformed", "`Meta Data` was incomplete");
  }
  // `Last Refreshed` can be a date or a full datetime; keep the date part.
  const lastRefreshedParsed = IsoDate.safeParse(lastRefreshedRaw.slice(0, 10));
  if (!lastRefreshedParsed.success) {
    throw new AlphaVantageError(
      "malformed",
      `\`Last Refreshed\` is not an ISO date: ${JSON.stringify(lastRefreshedRaw)}`,
    );
  }
  const lastRefreshed = lastRefreshedParsed.data;

  const entries = Object.entries(series as Record<string, unknown>);
  if (entries.length === 0) {
    throw new AlphaVantageError(
      "empty",
      "`Time Series (Daily)` was empty (unknown or unsupported symbol)",
    );
  }

  const money = (amount: string) => Money.of(amount, currency);
  const bars: DailyBar[] = entries.map(([date, raw]) => {
    const parsedDate = IsoDate.safeParse(date);
    if (!parsedDate.success) {
      throw new AlphaVantageError(
        "malformed",
        `daily bar key ${JSON.stringify(date)} is not an ISO date`,
      );
    }
    const d = parsedDate.data;
    const parsed = RawDailyBar.safeParse(raw);
    if (!parsed.success) {
      throw new AlphaVantageError(
        "malformed",
        `daily bar ${date} failed validation: ${parsed.error.message}`,
      );
    }
    const bar = parsed.data;
    return {
      date: d,
      open: money(bar["1. open"]),
      high: money(bar["2. high"]),
      low: money(bar["3. low"]),
      close: money(bar["4. close"]),
      volume: Number(bar["5. volume"]),
      currency,
    };
  });
  // Sort newest-first; Alpha Vantage usually returns this order but does not
  // guarantee it, so we make it deterministic.
  bars.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  return {
    symbol,
    lastRefreshed,
    timeZone: typeof timeZone === "string" ? timeZone : "US/Eastern",
    bars,
    currency,
  };
}

/**
 * Build the request URL for an Alpha Vantage call. Kept here (next to the
 * parsers) so the same URL construction is unit-tested offline and reused by the
 * Convex action that performs the actual fetch.
 *
 * `symbol` is uppercased and URL-encoded. The API key is required; never log or
 * embed it anywhere but the request URL.
 */
export function buildRequestUrl(params: {
  function: AlphaVantageFunction;
  symbol: string;
  apiKey: string;
  outputSize?: "compact" | "full";
  baseUrl?: string;
}): string {
  const symbol = params.symbol.trim().toUpperCase();
  if (symbol.length === 0) {
    throw new Error("symbol must not be empty");
  }
  if (params.apiKey.trim().length === 0) {
    throw new Error("apiKey must not be empty");
  }
  const url = new URL(params.baseUrl ?? ALPHA_VANTAGE_BASE_URL);
  url.searchParams.set("function", params.function);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("apikey", params.apiKey);
  if (params.function === "TIME_SERIES_DAILY") {
    url.searchParams.set("outputsize", params.outputSize ?? "compact");
  }
  return url.toString();
}

/**
 * Map an {@link EquityQuote} to the model's {@link Valuation}-shaped object so a
 * fetched market price can be recorded as a holding valuation. The result is a
 * plain object (not `Valuation.parse`d here) so callers in different layers can
 * validate it against their own schema; it matches the model shape exactly.
 *
 * The valuation `source` is `"market"` (high confidence) and `asOf` is the
 * latest trading day at UTC midnight, since Alpha Vantage gives a date, not a
 * precise instant.
 */
export function quoteToValuation(
  quote: EquityQuote,
  valuationId: string,
): {
  id: string;
  value: { amount: string; currency: string };
  asOf: string;
  source: "market";
  confidence: "high";
} {
  return {
    id: valuationId,
    value: quote.price.toJSON(),
    asOf: `${quote.latestTradingDay}T00:00:00Z`,
    source: "market",
    confidence: "high",
  };
}
