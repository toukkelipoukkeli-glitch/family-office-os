import emptyQuote from "./__fixtures__/empty-quote.json";
import errorMessage from "./__fixtures__/error-message.json";
import globalQuoteEtf from "./__fixtures__/global-quote-etf.json";
import globalQuote from "./__fixtures__/global-quote.json";
import informationNote from "./__fixtures__/information-note.json";
import rateLimitNote from "./__fixtures__/rate-limit-note.json";
import timeSeriesDaily from "./__fixtures__/time-series-daily.json";

/**
 * Recorded Alpha Vantage response fixtures. These are real sample-shaped
 * responses captured from the public API and frozen so the adapter is tested
 * fully offline and deterministically (see AGENTS.md: "Data adapters are tested
 * against fixtures, never live APIs").
 *
 * Each fixture is the raw JSON body Alpha Vantage returns (always HTTP 200, even
 * for errors), so the parser's error-detection paths are exercised too.
 */
export const alphaVantageFixtures = {
  /** A normal `GLOBAL_QUOTE` for an equity (IBM). */
  globalQuote,
  /** A normal `GLOBAL_QUOTE` for an ETF (SPY). */
  globalQuoteEtf,
  /** A normal `TIME_SERIES_DAILY` (compact) for IBM. */
  timeSeriesDaily,
  /** Throttle body: `{ "Note": ... }`. */
  rateLimitNote,
  /** Throttle body: `{ "Information": ... }`. */
  informationNote,
  /** Explicit error: `{ "Error Message": ... }` (bad symbol / call). */
  errorMessage,
  /** Empty envelope: `{ "Global Quote": {} }` (unknown symbol). */
  emptyQuote,
} as const;

export type AlphaVantageFixtureName = keyof typeof alphaVantageFixtures;
