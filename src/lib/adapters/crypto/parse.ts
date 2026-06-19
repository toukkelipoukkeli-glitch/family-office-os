import { Decimal } from "decimal.js";

import { Money } from "../../money";
import {
  CoinId,
  SimplePriceResponse,
  VsCurrency,
  type SimplePriceResponse as SimplePriceResponseType,
} from "./schema";

/**
 * Parse CoinGecko `/simple/price` responses into exact, typed quotes.
 *
 * CoinGecko returns prices as JSON numbers (binary floats). We convert each
 * number to a {@link Decimal} via its shortest round-trip string
 * (`String(n)`), so e.g. `0.1` becomes the exact decimal `0.1` rather than a
 * float artifact — consistent with the repo rule that money is never
 * floating-point (see AGENTS.md).
 *
 * READ-ONLY product: these are reporting quotes only; nothing here moves money.
 */

/** A single price of one coin quoted in one currency, with optional extras. */
export interface CryptoQuote {
  /** CoinGecko coin id, lowercased (e.g. `"bitcoin"`). */
  readonly coinId: string;
  /** The quote currency, lowercased (e.g. `"usd"`). */
  readonly vsCurrency: string;
  /** Exact price of one coin in `vsCurrency`. */
  readonly price: Decimal;
  /** Market capitalization in `vsCurrency`, when the response included it. */
  readonly marketCap?: Decimal;
  /** 24-hour percentage change, when the response included it. */
  readonly change24h?: Decimal;
  /** Unix epoch seconds of the last update, when the response included it. */
  readonly lastUpdatedAt?: number;
}

/** A coin priced across one or more currencies, keyed by lowercase `vs_currency`. */
export interface CoinPrices {
  /** CoinGecko coin id, lowercased. */
  readonly coinId: string;
  /** `vs_currency -> quote`. */
  readonly quotes: Readonly<Record<string, CryptoQuote>>;
}

/**
 * Convert a JSON number to an exact {@link Decimal} via its shortest
 * round-trip decimal string. `String(0.1) === "0.1"`, so this avoids carrying
 * binary-float noise into the Decimal.
 */
function numberToDecimal(n: number): Decimal {
  return new Decimal(String(n));
}

/**
 * Build a {@link Money} for a fiat-style quote currency. CoinGecko `vs`
 * currencies may be crypto (e.g. `btc`) which are not ISO-4217; those cannot be
 * represented as {@link Money}. Use {@link quoteToMoney} only when you know the
 * quote currency is a 3-letter fiat code.
 */
export function quoteToMoney(quote: CryptoQuote): Money {
  return Money.of(quote.price, quote.vsCurrency.toUpperCase());
}

/**
 * Parse a validated `/simple/price` response into a list of {@link CoinPrices}.
 * Throws (via zod) when the wire shape is malformed.
 */
export function parseSimplePrice(raw: unknown): CoinPrices[] {
  const data: SimplePriceResponseType = SimplePriceResponse.parse(raw);
  const result: CoinPrices[] = [];

  for (const [rawCoinId, entry] of Object.entries(data)) {
    const coinId = CoinId.parse(rawCoinId);
    const quotes: Record<string, CryptoQuote> = {};

    // First pass: find every base price key. A base price key is any key that
    // is not one of the derived suffixes and not `last_updated_at`. The derived
    // metrics (`_market_cap`, `_24h_change`) share the currency prefix.
    const lastUpdatedAt = entry["last_updated_at"];

    for (const [key, value] of Object.entries(entry)) {
      if (
        key === "last_updated_at" ||
        key.endsWith("_market_cap") ||
        key.endsWith("_24h_change") ||
        key.endsWith("_24h_vol")
      ) {
        continue;
      }
      const vsCurrency = VsCurrency.parse(key);
      const quote: CryptoQuote = {
        coinId,
        vsCurrency,
        price: numberToDecimal(value),
      };
      const marketCap = entry[`${key}_market_cap`];
      const change24h = entry[`${key}_24h_change`];
      quotes[vsCurrency] = {
        ...quote,
        ...(marketCap !== undefined
          ? { marketCap: numberToDecimal(marketCap) }
          : {}),
        ...(change24h !== undefined
          ? { change24h: numberToDecimal(change24h) }
          : {}),
        ...(lastUpdatedAt !== undefined
          ? { lastUpdatedAt: Math.trunc(lastUpdatedAt) }
          : {}),
      };
    }

    result.push({ coinId, quotes });
  }

  return result;
}

/**
 * Look up a single quote from parsed prices. Returns `undefined` when the coin
 * or currency is absent, so callers can decide how to handle a missing price
 * rather than getting a misleading zero.
 */
export function findQuote(
  prices: CoinPrices[],
  coinId: string,
  vsCurrency: string,
): CryptoQuote | undefined {
  const id = coinId.trim().toLowerCase();
  const cur = vsCurrency.trim().toLowerCase();
  return prices.find((p) => p.coinId === id)?.quotes[cur];
}
