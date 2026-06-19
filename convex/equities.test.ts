/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { alphaVantageFixtures } from "../src/lib/equities/fixtures";
import { api } from "./_generated/api";
import schema from "./schema";

/**
 * Offline tests for the server-side Alpha Vantage Convex actions. `fetch` is
 * stubbed to return recorded fixtures, so no live API is ever hit — the actions
 * run their real fetch -> parse -> serialize path against deterministic input.
 */
const modules = import.meta.glob("./**/*.*s");

/** Build a stub `fetch` that returns the given JSON body with HTTP 200. */
function stubFetch(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return vi.fn(async (input: unknown) => {
    void input;
    return {
      ok: init.ok ?? true,
      status: init.status ?? 200,
      statusText: "OK",
      json: async () => body,
    } as unknown as Response;
  });
}

const originalFetch = globalThis.fetch;
const originalKey = process.env.ALPHAVANTAGE_API_KEY;

beforeEach(() => {
  process.env.ALPHAVANTAGE_API_KEY = "TEST_KEY";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) {
    delete process.env.ALPHAVANTAGE_API_KEY;
  } else {
    process.env.ALPHAVANTAGE_API_KEY = originalKey;
  }
  vi.restoreAllMocks();
});

describe("equities.getQuote", () => {
  test("fetches and parses a quote into serializable money strings", async () => {
    const fetchMock = stubFetch(alphaVantageFixtures.globalQuote);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const t = convexTest(schema, modules);
    const result = await t.action(api.equities.getQuote, { symbol: "ibm" });

    expect(result.symbol).toBe("IBM");
    expect(result.price).toEqual({ amount: "265.26", currency: "USD" });
    expect(result.changePercent).toBe("0.5611");
    expect(result.latestTradingDay).toBe("2026-06-18");
    expect(result.valuation).toEqual({
      id: "av-IBM-2026-06-18",
      value: { amount: "265.26", currency: "USD" },
      asOf: "2026-06-18T00:00:00Z",
      source: "market",
      confidence: "high",
    });

    // The symbol is uppercased and the API key is included in the request URL.
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain("function=GLOBAL_QUOTE");
    expect(calledUrl).toContain("symbol=IBM");
    expect(calledUrl).toContain("apikey=TEST_KEY");
  });

  test("propagates a typed rate-limit error from a Note body", async () => {
    globalThis.fetch = stubFetch(
      alphaVantageFixtures.rateLimitNote,
    ) as unknown as typeof fetch;
    const t = convexTest(schema, modules);
    await expect(
      t.action(api.equities.getQuote, { symbol: "IBM" }),
    ).rejects.toThrow();
  });

  test("throws when the API key is missing", async () => {
    delete process.env.ALPHAVANTAGE_API_KEY;
    globalThis.fetch = stubFetch(
      alphaVantageFixtures.globalQuote,
    ) as unknown as typeof fetch;
    const t = convexTest(schema, modules);
    await expect(
      t.action(api.equities.getQuote, { symbol: "IBM" }),
    ).rejects.toThrow(/ALPHAVANTAGE_API_KEY/);
  });

  test("throws on a non-OK HTTP response", async () => {
    globalThis.fetch = stubFetch({}, {
      ok: false,
      status: 503,
    }) as unknown as typeof fetch;
    const t = convexTest(schema, modules);
    await expect(
      t.action(api.equities.getQuote, { symbol: "IBM" }),
    ).rejects.toThrow();
  });
});

describe("equities.getDailySeries", () => {
  test("fetches and parses a daily series newest-first", async () => {
    const fetchMock = stubFetch(alphaVantageFixtures.timeSeriesDaily);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const t = convexTest(schema, modules);
    const result = await t.action(api.equities.getDailySeries, {
      symbol: "IBM",
    });

    expect(result.symbol).toBe("IBM");
    expect(result.bars).toHaveLength(3);
    expect(result.bars[0].date).toBe("2026-06-18");
    expect(result.bars[0].close).toEqual({ amount: "265.26", currency: "USD" });

    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain("function=TIME_SERIES_DAILY");
    expect(calledUrl).toContain("outputsize=compact");
  });
});
