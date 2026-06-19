import { Decimal } from "decimal.js";
import { describe, expect, it, vi } from "vitest";

import { Money } from "../../money";
import {
  buildSimplePriceUrl,
  COINGECKO_BASE_URL,
  CryptoAdapter,
  CryptoAdapterHttpError,
  DEFAULT_REQUEST_TIMEOUT_MS,
  type FetchLike,
} from "./client";
import {
  findQuote,
  parseSimplePrice,
  quoteToMoney,
} from "./parse";
import {
  lowPricePennyFixture,
  priceOnlyFixture,
  simplePriceFixture,
} from "./fixtures";

// ---------------------------------------------------------------------------
// parseSimplePrice
// ---------------------------------------------------------------------------

describe("parseSimplePrice", () => {
  it("parses every coin and quote currency from the fixture", () => {
    const prices = parseSimplePrice(simplePriceFixture);
    expect(prices.map((p) => p.coinId).sort()).toEqual([
      "bitcoin",
      "ethereum",
    ]);
    const btc = prices.find((p) => p.coinId === "bitcoin");
    expect(Object.keys(btc!.quotes).sort()).toEqual(["eur", "usd"]);
  });

  it("produces exact decimal prices", () => {
    const prices = parseSimplePrice(simplePriceFixture);
    const usd = findQuote(prices, "bitcoin", "usd");
    expect(usd!.price.equals(new Decimal("64231.42"))).toBe(true);
    expect(usd!.price.toFixed()).toBe("64231.42");
  });

  it("preserves an exact decimal for a float-lossy price (0.1)", () => {
    const prices = parseSimplePrice(lowPricePennyFixture);
    const q = findQuote(prices, "penny-token", "usd");
    expect(q!.price.toFixed()).toBe("0.1");
    expect(q!.price.equals(new Decimal("0.1"))).toBe(true);
  });

  it("captures market cap, 24h change and last_updated_at when present", () => {
    const prices = parseSimplePrice(simplePriceFixture);
    const eth = findQuote(prices, "ethereum", "usd");
    expect(eth!.marketCap!.toFixed()).toBe("411000000000");
    expect(eth!.change24h!.toFixed()).toBe("2.5");
    expect(eth!.lastUpdatedAt).toBe(1718800000);
  });

  it("does not treat derived suffix keys as separate currencies", () => {
    const prices = parseSimplePrice(simplePriceFixture);
    const btc = prices.find((p) => p.coinId === "bitcoin")!;
    // Only the two real currencies, not usd_market_cap / usd_24h_change etc.
    expect(Object.keys(btc.quotes).sort()).toEqual(["eur", "usd"]);
  });

  it("omits optional fields for a price-only response", () => {
    const prices = parseSimplePrice(priceOnlyFixture);
    const q = findQuote(prices, "bitcoin", "usd");
    expect(q!.price.toFixed()).toBe("64231.42");
    expect(q!.marketCap).toBeUndefined();
    expect(q!.change24h).toBeUndefined();
    expect(q!.lastUpdatedAt).toBeUndefined();
  });

  it("rejects a malformed response (non-object entry)", () => {
    expect(() => parseSimplePrice({ bitcoin: 123 })).toThrow();
  });

  it("rejects a non-finite price value", () => {
    expect(() =>
      parseSimplePrice({ bitcoin: { usd: Number.POSITIVE_INFINITY } }),
    ).toThrow();
  });

  it("rejects a non-object top-level body", () => {
    expect(() => parseSimplePrice(null)).toThrow();
    expect(() => parseSimplePrice("nope")).toThrow();
  });

  it("preserves precision for a sub-cent price that serializes as scientific notation", () => {
    // 0.0000001 serializes as "1e-7"; the parser must still produce an exact decimal.
    const prices = parseSimplePrice({ "tiny-token": { usd: 1e-7 } });
    const q = findQuote(prices, "tiny-token", "usd");
    expect(q!.price.toFixed()).toBe("0.0000001");
    expect(q!.price.equals(new Decimal("0.0000001"))).toBe(true);
  });

  it("preserves a large market cap that serializes as scientific notation", () => {
    // 1.267e21 is > Number.MAX_SAFE_INTEGER and serializes as "1.267e+21".
    const prices = parseSimplePrice({
      bitcoin: { usd: 64231.42, usd_market_cap: 1.267e21 },
    });
    const q = findQuote(prices, "bitcoin", "usd");
    expect(q!.marketCap!.toFixed()).toBe("1267000000000000000000");
  });

  it("captures a negative 24h change exactly", () => {
    const prices = parseSimplePrice(simplePriceFixture);
    const btc = findQuote(prices, "bitcoin", "usd");
    expect(btc!.change24h!.toFixed()).toBe("-1.2345");
  });

  it("truncates a fractional last_updated_at to whole seconds", () => {
    const prices = parseSimplePrice({
      bitcoin: { usd: 1, last_updated_at: 1718800000.9 },
    });
    const q = findQuote(prices, "bitcoin", "usd");
    expect(q!.lastUpdatedAt).toBe(1718800000);
  });

  it("does not treat a derived volume key as a separate currency", () => {
    const prices = parseSimplePrice({
      bitcoin: { usd: 64231.42, usd_24h_vol: 12345.6 },
    });
    const btc = prices.find((p) => p.coinId === "bitcoin")!;
    expect(Object.keys(btc.quotes)).toEqual(["usd"]);
  });

  it("ignores an empty entry (coin with no quote currencies)", () => {
    const prices = parseSimplePrice({ bitcoin: {} });
    const btc = prices.find((p) => p.coinId === "bitcoin")!;
    expect(btc.quotes).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// findQuote
// ---------------------------------------------------------------------------

describe("findQuote", () => {
  it("is case-insensitive on coin id and currency", () => {
    const prices = parseSimplePrice(simplePriceFixture);
    expect(findQuote(prices, "BITCOIN", "USD")!.price.toFixed()).toBe(
      "64231.42",
    );
  });

  it("returns undefined for a missing coin or currency", () => {
    const prices = parseSimplePrice(simplePriceFixture);
    expect(findQuote(prices, "dogecoin", "usd")).toBeUndefined();
    expect(findQuote(prices, "bitcoin", "gbp")).toBeUndefined();
  });

  it("trims surrounding whitespace on lookup inputs", () => {
    const prices = parseSimplePrice(simplePriceFixture);
    expect(findQuote(prices, "  bitcoin  ", "  USD ")!.price.toFixed()).toBe(
      "64231.42",
    );
  });

  it("returns undefined against an empty price list", () => {
    expect(findQuote([], "bitcoin", "usd")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// quoteToMoney
// ---------------------------------------------------------------------------

describe("quoteToMoney", () => {
  it("builds an exact Money for a fiat quote currency", () => {
    const prices = parseSimplePrice(simplePriceFixture);
    const q = findQuote(prices, "bitcoin", "usd")!;
    const money = quoteToMoney(q);
    expect(money).toBeInstanceOf(Money);
    expect(money.toJSON()).toEqual({ amount: "64231.42", currency: "USD" });
  });

  it("multiplies exactly by a holding quantity", () => {
    const prices = parseSimplePrice(simplePriceFixture);
    const q = findQuote(prices, "ethereum", "usd")!;
    // 2.5 ETH * 3421.07 USD = 8552.675 USD, exact.
    const value = quoteToMoney(q).times("2.5");
    expect(value.toJSON()).toEqual({ amount: "8552.675", currency: "USD" });
  });

  it("rejects a 4-letter (non-fiat) quote currency with a clear error", () => {
    // CoinGecko accepts 4-letter stablecoins (usdt/usdc) which cannot be
    // represented as 3-letter ISO-4217 Money.
    const prices = parseSimplePrice({ bitcoin: { usdt: 64200.5 } });
    const q = findQuote(prices, "bitcoin", "usdt")!;
    expect(q.vsCurrency).toBe("usdt");
    expect(() => quoteToMoney(q)).toThrow(/not a 3-letter fiat code/);
  });
});

// ---------------------------------------------------------------------------
// buildSimplePriceUrl
// ---------------------------------------------------------------------------

describe("buildSimplePriceUrl", () => {
  it("builds the base URL with ids and vs_currencies", () => {
    const url = buildSimplePriceUrl({
      ids: ["bitcoin", "ethereum"],
      vsCurrencies: ["usd", "eur"],
    });
    expect(url.startsWith(`${COINGECKO_BASE_URL}/simple/price?`)).toBe(true);
    const qs = new URL(url).searchParams;
    expect(qs.get("ids")).toBe("bitcoin,ethereum");
    expect(qs.get("vs_currencies")).toBe("usd,eur");
  });

  it("lowercases and dedupes ids and currencies", () => {
    const url = buildSimplePriceUrl({
      ids: ["Bitcoin", "BITCOIN", "ethereum"],
      vsCurrencies: ["USD", "usd"],
    });
    const qs = new URL(url).searchParams;
    expect(qs.get("ids")).toBe("bitcoin,ethereum");
    expect(qs.get("vs_currencies")).toBe("usd");
  });

  it("sets optional include flags only when requested", () => {
    const bare = new URL(
      buildSimplePriceUrl({ ids: ["bitcoin"], vsCurrencies: ["usd"] }),
    ).searchParams;
    expect(bare.get("include_market_cap")).toBeNull();

    const full = new URL(
      buildSimplePriceUrl({
        ids: ["bitcoin"],
        vsCurrencies: ["usd"],
        include24hChange: true,
        includeMarketCap: true,
        includeLastUpdatedAt: true,
      }),
    ).searchParams;
    expect(full.get("include_24hr_change")).toBe("true");
    expect(full.get("include_market_cap")).toBe("true");
    expect(full.get("include_last_updated_at")).toBe("true");
  });

  it("respects a custom base URL and trims trailing slashes", () => {
    const url = buildSimplePriceUrl(
      { ids: ["bitcoin"], vsCurrencies: ["usd"] },
      "https://proxy.example.com/cg/",
    );
    expect(url.startsWith("https://proxy.example.com/cg/simple/price?")).toBe(
      true,
    );
  });

  it("throws when ids or currencies are empty", () => {
    expect(() =>
      buildSimplePriceUrl({ ids: [], vsCurrencies: ["usd"] }),
    ).toThrow(/at least one coin id/);
    expect(() =>
      buildSimplePriceUrl({ ids: ["bitcoin"], vsCurrencies: [] }),
    ).toThrow(/at least one vs_currency/);
  });

  it("rejects an invalid (non-alphanumeric) vs_currency", () => {
    expect(() =>
      buildSimplePriceUrl({ ids: ["bitcoin"], vsCurrencies: ["us$"] }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// CryptoAdapter (offline, injected fetch)
// ---------------------------------------------------------------------------

function fakeFetch(
  body: unknown,
  init: { ok?: boolean; status?: number; statusText?: string } = {},
): FetchLike {
  const { ok = true, status = 200, statusText = "OK" } = init;
  return vi.fn(async () => ({
    ok,
    status,
    statusText,
    json: async () => body,
  }));
}

describe("CryptoAdapter", () => {
  it("fetches and parses a simple price using the injected fetch", async () => {
    const fetchImpl = fakeFetch(simplePriceFixture);
    const adapter = new CryptoAdapter({ fetchImpl });
    const prices = await adapter.simplePrice({
      ids: ["bitcoin", "ethereum"],
      vsCurrencies: ["usd", "eur"],
      includeMarketCap: true,
      include24hChange: true,
      includeLastUpdatedAt: true,
    });
    expect(findQuote(prices, "bitcoin", "usd")!.price.toFixed()).toBe(
      "64231.42",
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("requests the correctly-built URL", async () => {
    const fetchImpl = fakeFetch(priceOnlyFixture);
    const adapter = new CryptoAdapter({
      fetchImpl,
      baseUrl: "https://example.test/v3",
    });
    await adapter.simplePrice({ ids: ["bitcoin"], vsCurrencies: ["usd"] });
    const calledUrl = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as string;
    expect(calledUrl).toBe(
      "https://example.test/v3/simple/price?ids=bitcoin&vs_currencies=usd",
    );
  });

  it("throws CryptoAdapterHttpError on a non-2xx response", async () => {
    const fetchImpl = fakeFetch(
      { error: "rate limited" },
      { ok: false, status: 429, statusText: "Too Many Requests" },
    );
    const adapter = new CryptoAdapter({ fetchImpl });
    await expect(
      adapter.simplePrice({ ids: ["bitcoin"], vsCurrencies: ["usd"] }),
    ).rejects.toBeInstanceOf(CryptoAdapterHttpError);
    await expect(
      adapter.simplePrice({ ids: ["bitcoin"], vsCurrencies: ["usd"] }),
    ).rejects.toMatchObject({ status: 429 });
  });

  it("propagates a zod error when the body is malformed", async () => {
    const fetchImpl = fakeFetch({ bitcoin: 123 });
    const adapter = new CryptoAdapter({ fetchImpl });
    await expect(
      adapter.simplePrice({ ids: ["bitcoin"], vsCurrencies: ["usd"] }),
    ).rejects.toThrow();
  });

  it("throws at construction when no fetch is available", () => {
    const original = (globalThis as { fetch?: unknown }).fetch;
    // Simulate an environment with no global fetch and no injected impl.
    (globalThis as { fetch?: unknown }).fetch = undefined;
    try {
      expect(() => new CryptoAdapter()).toThrow(/fetch implementation/);
    } finally {
      (globalThis as { fetch?: unknown }).fetch = original;
    }
  });

  it("passes a non-aborted signal to fetch under the default timeout", async () => {
    let observed: AbortSignal | undefined;
    const fetchImpl: FetchLike = vi.fn(async (_url, init) => {
      observed = init?.signal;
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => priceOnlyFixture,
      };
    });
    const adapter = new CryptoAdapter({ fetchImpl });
    await adapter.simplePrice({ ids: ["bitcoin"], vsCurrencies: ["usd"] });
    expect(observed).toBeInstanceOf(AbortSignal);
    expect(observed!.aborted).toBe(false);
  });

  it("aborts the request when the timeout elapses", async () => {
    vi.useFakeTimers();
    try {
      // A fetch that never resolves until its signal aborts.
      const fetchImpl: FetchLike = vi.fn(
        (_url, init) =>
          new Promise<Awaited<ReturnType<FetchLike>>>((_resolve, reject) => {
            const signal = init?.signal;
            signal?.addEventListener("abort", () =>
              reject(signal.reason ?? new Error("aborted")),
            );
          }),
      );
      const adapter = new CryptoAdapter({ fetchImpl, requestTimeoutMs: 50 });
      const promise = adapter.simplePrice({
        ids: ["bitcoin"],
        vsCurrencies: ["usd"],
      });
      const assertion = expect(promise).rejects.toThrow(/timed out after 50ms/);
      await vi.advanceTimersByTimeAsync(50);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not arm a timeout when requestTimeoutMs is 0", async () => {
    let observed: AbortSignal | undefined;
    const fetchImpl: FetchLike = vi.fn(async (_url, init) => {
      observed = init?.signal;
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => priceOnlyFixture,
      };
    });
    const adapter = new CryptoAdapter({ fetchImpl, requestTimeoutMs: 0 });
    // With no caller signal and no timeout, the request signal is undefined.
    await adapter.simplePrice({ ids: ["bitcoin"], vsCurrencies: ["usd"] });
    expect(observed).toBeUndefined();
  });

  it("exposes a sensible default timeout constant", () => {
    expect(DEFAULT_REQUEST_TIMEOUT_MS).toBeGreaterThan(0);
  });
});
