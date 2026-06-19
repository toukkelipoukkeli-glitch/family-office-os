import { describe, expect, it } from "vitest";

import { Money } from "../money";
import { Valuation } from "../model/valuation";
import {
  ALPHA_VANTAGE_BASE_URL,
  AlphaVantageError,
  buildRequestUrl,
  parseDailySeries,
  parseGlobalQuote,
  quoteToValuation,
} from "./alpha-vantage";
import { alphaVantageFixtures } from "./fixtures";

/**
 * Fully offline tests for the Alpha Vantage equities/ETF adapter. Every case
 * runs against a recorded fixture or a hand-built body — no network. They cover
 * the happy path, Alpha Vantage's HTTP-200 error/throttle bodies, empty
 * envelopes, malformed payloads, and exact decimal handling.
 */

describe("parseGlobalQuote", () => {
  it("parses a normal equity quote into typed Money values", () => {
    const q = parseGlobalQuote(alphaVantageFixtures.globalQuote);
    expect(q.symbol).toBe("IBM");
    expect(q.currency).toBe("USD");
    expect(q.price.equals(Money.of("265.2600", "USD"))).toBe(true);
    expect(q.open.equals(Money.of("264.4500", "USD"))).toBe(true);
    expect(q.high.equals(Money.of("266.4500", "USD"))).toBe(true);
    expect(q.low.equals(Money.of("262.9100", "USD"))).toBe(true);
    expect(q.previousClose.equals(Money.of("263.7800", "USD"))).toBe(true);
    expect(q.change.equals(Money.of("1.4800", "USD"))).toBe(true);
    expect(q.changePercent).toBe("0.5611");
    expect(q.volume).toBe(3210456);
    expect(q.latestTradingDay).toBe("2026-06-18");
  });

  it("parses an ETF quote the same way as an equity", () => {
    const q = parseGlobalQuote(alphaVantageFixtures.globalQuoteEtf);
    expect(q.symbol).toBe("SPY");
    expect(q.price.equals(Money.of("613.4200", "USD"))).toBe(true);
    expect(q.changePercent).toBe("0.3813");
  });

  it("preserves exact decimal precision (no float drift)", () => {
    const q = parseGlobalQuote(alphaVantageFixtures.globalQuote);
    // toJSON keeps the full-precision string straight from the fixture.
    expect(q.price.toJSON()).toEqual({ amount: "265.26", currency: "USD" });
    // The raw decimal string is exact, not a rounded float.
    expect(q.price.amount.toFixed(4)).toBe("265.2600");
  });

  it("honors a caller-supplied currency", () => {
    const q = parseGlobalQuote(alphaVantageFixtures.globalQuote, {
      currency: "eur",
    });
    expect(q.currency).toBe("EUR");
    expect(q.price.currency).toBe("EUR");
  });

  it("throws a typed `error` on an Error Message body", () => {
    try {
      parseGlobalQuote(alphaVantageFixtures.errorMessage);
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(AlphaVantageError);
      expect((e as AlphaVantageError).kind).toBe("error");
    }
  });

  it("throws a typed `rate-limit` on a Note body", () => {
    try {
      parseGlobalQuote(alphaVantageFixtures.rateLimitNote);
      throw new Error("expected throw");
    } catch (e) {
      expect((e as AlphaVantageError).kind).toBe("rate-limit");
    }
  });

  it("throws a typed `rate-limit` on an Information body", () => {
    try {
      parseGlobalQuote(alphaVantageFixtures.informationNote);
      throw new Error("expected throw");
    } catch (e) {
      expect((e as AlphaVantageError).kind).toBe("rate-limit");
    }
  });

  it("throws a typed `empty` on an empty Global Quote envelope", () => {
    try {
      parseGlobalQuote(alphaVantageFixtures.emptyQuote);
      throw new Error("expected throw");
    } catch (e) {
      expect((e as AlphaVantageError).kind).toBe("empty");
    }
  });

  it("throws `malformed` on a non-object body", () => {
    expect(() => parseGlobalQuote("nope")).toThrowError(AlphaVantageError);
    expect(() => parseGlobalQuote(null)).toThrowError(AlphaVantageError);
  });

  it("throws `malformed` when a price field is not numeric", () => {
    const broken = {
      "Global Quote": {
        ...(alphaVantageFixtures.globalQuote["Global Quote"] as Record<
          string,
          string
        >),
        "05. price": "n/a",
      },
    };
    try {
      parseGlobalQuote(broken);
      throw new Error("expected throw");
    } catch (e) {
      expect((e as AlphaVantageError).kind).toBe("malformed");
    }
  });

  it("parses a negative change correctly", () => {
    const down = {
      "Global Quote": {
        ...(alphaVantageFixtures.globalQuote["Global Quote"] as Record<
          string,
          string
        >),
        "09. change": "-1.4800",
        "10. change percent": "-0.5611%",
      },
    };
    const q = parseGlobalQuote(down);
    expect(q.change.equals(Money.of("-1.48", "USD"))).toBe(true);
    expect(q.changePercent).toBe("-0.5611");
  });
});

describe("parseDailySeries", () => {
  it("parses a daily series sorted newest-first", () => {
    const s = parseDailySeries(alphaVantageFixtures.timeSeriesDaily);
    expect(s.symbol).toBe("IBM");
    expect(s.lastRefreshed).toBe("2026-06-18");
    expect(s.timeZone).toBe("US/Eastern");
    expect(s.bars).toHaveLength(3);
    expect(s.bars.map((b) => b.date)).toEqual([
      "2026-06-18",
      "2026-06-17",
      "2026-06-16",
    ]);
    expect(s.bars[0].close.equals(Money.of("265.2600", "USD"))).toBe(true);
    expect(s.bars[2].open.equals(Money.of("260.0000", "USD"))).toBe(true);
    expect(s.bars[0].volume).toBe(3210456);
  });

  it("sorts unordered bars deterministically", () => {
    const fixture = alphaVantageFixtures.timeSeriesDaily as {
      "Meta Data": Record<string, string>;
      "Time Series (Daily)": Record<string, unknown>;
    };
    const reordered = {
      "Meta Data": fixture["Meta Data"],
      "Time Series (Daily)": {
        "2026-06-16": fixture["Time Series (Daily)"]["2026-06-16"],
        "2026-06-18": fixture["Time Series (Daily)"]["2026-06-18"],
        "2026-06-17": fixture["Time Series (Daily)"]["2026-06-17"],
      },
    };
    const s = parseDailySeries(reordered);
    expect(s.bars.map((b) => b.date)).toEqual([
      "2026-06-18",
      "2026-06-17",
      "2026-06-16",
    ]);
  });

  it("throws `rate-limit` on a throttle body", () => {
    try {
      parseDailySeries(alphaVantageFixtures.rateLimitNote);
      throw new Error("expected throw");
    } catch (e) {
      expect((e as AlphaVantageError).kind).toBe("rate-limit");
    }
  });

  it("throws `empty` on an empty time series", () => {
    const empty = {
      "Meta Data": {
        "2. Symbol": "ZZZZ",
        "3. Last Refreshed": "2026-06-18",
        "5. Time Zone": "US/Eastern",
      },
      "Time Series (Daily)": {},
    };
    try {
      parseDailySeries(empty);
      throw new Error("expected throw");
    } catch (e) {
      expect((e as AlphaVantageError).kind).toBe("empty");
    }
  });

  it("throws `malformed` when the envelope is missing", () => {
    expect(() => parseDailySeries({ foo: "bar" })).toThrowError(
      AlphaVantageError,
    );
  });

  it("accepts a datetime Last Refreshed and keeps the date", () => {
    const fixture = alphaVantageFixtures.timeSeriesDaily as {
      "Meta Data": Record<string, string>;
      "Time Series (Daily)": Record<string, unknown>;
    };
    const withTime = {
      "Meta Data": {
        ...fixture["Meta Data"],
        "3. Last Refreshed": "2026-06-18 16:00:00",
      },
      "Time Series (Daily)": fixture["Time Series (Daily)"],
    };
    const s = parseDailySeries(withTime);
    expect(s.lastRefreshed).toBe("2026-06-18");
  });
});

describe("buildRequestUrl", () => {
  it("builds a GLOBAL_QUOTE URL with uppercased symbol", () => {
    const url = buildRequestUrl({
      function: "GLOBAL_QUOTE",
      symbol: "ibm",
      apiKey: "DEMO",
    });
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(ALPHA_VANTAGE_BASE_URL);
    expect(parsed.searchParams.get("function")).toBe("GLOBAL_QUOTE");
    expect(parsed.searchParams.get("symbol")).toBe("IBM");
    expect(parsed.searchParams.get("apikey")).toBe("DEMO");
    // outputsize only applies to time series.
    expect(parsed.searchParams.get("outputsize")).toBeNull();
  });

  it("builds a TIME_SERIES_DAILY URL with default compact output", () => {
    const url = buildRequestUrl({
      function: "TIME_SERIES_DAILY",
      symbol: "SPY",
      apiKey: "DEMO",
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("function")).toBe("TIME_SERIES_DAILY");
    expect(parsed.searchParams.get("outputsize")).toBe("compact");
  });

  it("honors a full output size", () => {
    const url = buildRequestUrl({
      function: "TIME_SERIES_DAILY",
      symbol: "SPY",
      apiKey: "DEMO",
      outputSize: "full",
    });
    expect(new URL(url).searchParams.get("outputsize")).toBe("full");
  });

  it("rejects an empty symbol or api key", () => {
    expect(() =>
      buildRequestUrl({ function: "GLOBAL_QUOTE", symbol: "  ", apiKey: "k" }),
    ).toThrow();
    expect(() =>
      buildRequestUrl({ function: "GLOBAL_QUOTE", symbol: "IBM", apiKey: " " }),
    ).toThrow();
  });
});

describe("quoteToValuation", () => {
  it("maps a quote to a model-shaped market valuation", () => {
    const q = parseGlobalQuote(alphaVantageFixtures.globalQuote);
    const val = quoteToValuation(q, "val-ibm-2026-06-18");
    expect(val).toEqual({
      id: "val-ibm-2026-06-18",
      value: { amount: "265.26", currency: "USD" },
      asOf: "2026-06-18T00:00:00Z",
      source: "market",
      confidence: "high",
    });
  });

  it("produces output that validates against the model Valuation schema", () => {
    const q = parseGlobalQuote(alphaVantageFixtures.globalQuote);
    const val = quoteToValuation(q, "val-ibm-2026-06-18");
    expect(() => Valuation.parse(val)).not.toThrow();
  });
});
