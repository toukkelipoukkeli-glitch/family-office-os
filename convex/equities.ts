import { v } from "convex/values";

import {
  buildRequestUrl,
  parseDailySeries,
  parseGlobalQuote,
  quoteToValuation,
} from "../src/lib/equities/alpha-vantage";
import { defaultFetchGuard } from "../src/lib/equities/fetch-guard";
import { action } from "./_generated/server";

/**
 * Server-side Equities/ETF price adapter (Alpha Vantage).
 *
 * These Convex actions are the *only* place the live Alpha Vantage API is
 * called. The API key (`ALPHAVANTAGE_API_KEY`) is read from the Convex
 * environment and never sent to the client — actions run server-side. The
 * actual JSON parsing is delegated to the offline, fixture-tested adapter in
 * `src/lib/equities/alpha-vantage.ts`, so the only thing untested-by-fixture
 * here is the `fetch` itself (which the tests mock).
 *
 * READ-ONLY product: these actions only fetch public market prices. They never
 * move money or place a trade.
 */

/** Read the Alpha Vantage API key from the server environment, or throw. */
function requireApiKey(): string {
  const key = process.env.ALPHAVANTAGE_API_KEY;
  if (!key || key.trim().length === 0) {
    throw new Error(
      "ALPHAVANTAGE_API_KEY is not set in the Convex environment",
    );
  }
  return key;
}

/**
 * Fetch + JSON-decode an Alpha Vantage URL through the shared offline cache +
 * rate-limit guard. The guard short-circuits to a cached body when one is fresh,
 * serves a stale body when the limiter denies a call, and otherwise performs the
 * live fetch. Network and HTTP errors still propagate.
 */
async function fetchJson(url: string): Promise<unknown> {
  const { body } = await defaultFetchGuard().fetch(url);
  return body;
}

/**
 * Fetch the latest market quote for a symbol and return it in a fully
 * serializable shape (money amounts as exact decimal strings, never floats).
 */
export const getQuote = action({
  args: {
    symbol: v.string(),
    currency: v.optional(v.string()),
  },
  handler: async (_ctx, { symbol, currency }) => {
    const url = buildRequestUrl({
      function: "GLOBAL_QUOTE",
      symbol,
      apiKey: requireApiKey(),
    });
    const body = await fetchJson(url);
    const quote = parseGlobalQuote(body, { currency });
    return {
      symbol: quote.symbol,
      currency: quote.currency,
      price: quote.price.toJSON(),
      open: quote.open.toJSON(),
      high: quote.high.toJSON(),
      low: quote.low.toJSON(),
      previousClose: quote.previousClose.toJSON(),
      change: quote.change.toJSON(),
      changePercent: quote.changePercent,
      volume: quote.volume,
      latestTradingDay: quote.latestTradingDay,
      /** Ready-to-store market valuation for the symbol (id derived from date). */
      valuation: quoteToValuation(quote, `av-${quote.symbol}-${quote.latestTradingDay}`),
    };
  },
});

/**
 * Fetch a compact daily OHLCV series for a symbol, newest bar first, with all
 * prices as exact decimal strings.
 */
export const getDailySeries = action({
  args: {
    symbol: v.string(),
    currency: v.optional(v.string()),
    outputSize: v.optional(v.union(v.literal("compact"), v.literal("full"))),
  },
  handler: async (_ctx, { symbol, currency, outputSize }) => {
    const url = buildRequestUrl({
      function: "TIME_SERIES_DAILY",
      symbol,
      apiKey: requireApiKey(),
      outputSize,
    });
    const body = await fetchJson(url);
    const series = parseDailySeries(body, { currency });
    return {
      symbol: series.symbol,
      lastRefreshed: series.lastRefreshed,
      timeZone: series.timeZone,
      currency: series.currency,
      bars: series.bars.map((b) => ({
        date: b.date,
        open: b.open.toJSON(),
        high: b.high.toJSON(),
        low: b.low.toJSON(),
        close: b.close.toJSON(),
        volume: b.volume,
      })),
    };
  },
});
