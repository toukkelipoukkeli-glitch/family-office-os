import { describe, expect, it, vi } from "vitest";

import {
  FetchGuard,
  RateLimitedError,
  defaultFetchGuard,
  resetDefaultFetchGuard,
} from "./fetch-guard";

/**
 * Deterministic, offline tests for the Alpha Vantage fetch guard. A fake clock
 * (`clock.now`) and a stub fetcher replace real time and real network, so the
 * cache TTL and token-bucket behavior are exercised without any timers or I/O.
 */

/** A controllable monotonic clock. */
function makeClock(start = 0) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("FetchGuard", () => {
  it("makes a live call on a cold cache and caches the body", async () => {
    const clock = makeClock();
    const fetcher = vi.fn(async () => ({ ok: 1 }));
    const guard = new FetchGuard({ now: clock.now, fetcher });

    const r1 = await guard.fetch("https://x/q?s=IBM");
    expect(r1).toEqual({ body: { ok: 1 }, source: "network" });
    expect(fetcher).toHaveBeenCalledTimes(1);

    // Second call within the TTL is served from cache — no extra network.
    const r2 = await guard.fetch("https://x/q?s=IBM");
    expect(r2.source).toBe("cache");
    expect(r2.body).toEqual({ ok: 1 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("expires the cache after the TTL and refetches", async () => {
    const clock = makeClock();
    let n = 0;
    const fetcher = vi.fn(async () => ({ n: ++n }));
    const guard = new FetchGuard({
      now: clock.now,
      fetcher,
      ttlMs: 1_000,
      minIntervalMs: 100,
      burst: 10,
    });

    expect((await guard.fetch("u")).body).toEqual({ n: 1 });
    clock.advance(1_001); // past TTL
    const r = await guard.fetch("u");
    expect(r.source).toBe("network");
    expect(r.body).toEqual({ n: 2 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("denies a burst beyond capacity and serves the stale cached body", async () => {
    const clock = makeClock();
    const fetcher = vi.fn(async (url: string) => ({ url }));
    // burst of 1, no time passes → only the first distinct URL gets a token.
    const guard = new FetchGuard({
      now: clock.now,
      fetcher,
      burst: 1,
      minIntervalMs: 10_000,
      ttlMs: 0, // entries are immediately stale, forcing the limiter path
    });

    // First call spends the only token and caches (even though ttl=0).
    await guard.fetch("a");
    expect(fetcher).toHaveBeenCalledTimes(1);

    // Re-requesting "a": cache is stale (ttl 0) AND no token → stale fallback.
    const stale = await guard.fetch("a");
    expect(stale.source).toBe("stale");
    expect(stale.body).toEqual({ url: "a" });
    expect(fetcher).toHaveBeenCalledTimes(1); // no new network call
  });

  it("throws RateLimitedError when denied with nothing cached", async () => {
    const clock = makeClock();
    const fetcher = vi.fn(async () => ({ ok: 1 }));
    const guard = new FetchGuard({
      now: clock.now,
      fetcher,
      burst: 1,
      minIntervalMs: 10_000,
    });

    await guard.fetch("a"); // spends the token, caches "a"
    // "b" has never been fetched and there is no token left.
    await expect(guard.fetch("b")).rejects.toBeInstanceOf(RateLimitedError);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("refills tokens over time so a later call succeeds", async () => {
    const clock = makeClock();
    const fetcher = vi.fn(async (url: string) => ({ url }));
    const guard = new FetchGuard({
      now: clock.now,
      fetcher,
      burst: 1,
      minIntervalMs: 1_000,
    });

    await guard.fetch("a"); // token spent at t=0
    await expect(guard.fetch("b")).rejects.toBeInstanceOf(RateLimitedError);

    clock.advance(1_000); // one token regenerates + spacing satisfied
    const r = await guard.fetch("b");
    expect(r.source).toBe("network");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("enforces minimum spacing between granted calls", async () => {
    const clock = makeClock();
    const fetcher = vi.fn(async (url: string) => ({ url }));
    // Plenty of tokens, but calls must be spaced ≥ minIntervalMs apart.
    const guard = new FetchGuard({
      now: clock.now,
      fetcher,
      burst: 10,
      minIntervalMs: 5_000,
    });

    await guard.fetch("a"); // granted at t=0
    await expect(guard.fetch("b")).rejects.toBeInstanceOf(RateLimitedError);

    clock.advance(5_000);
    const r = await guard.fetch("b");
    expect(r.source).toBe("network");
  });

  it("attaches a retryAfter hint to the rate-limit error", async () => {
    const clock = makeClock();
    const guard = new FetchGuard({
      now: clock.now,
      fetcher: async () => ({}),
      burst: 1,
      minIntervalMs: 8_000,
    });
    await guard.fetch("a");
    try {
      await guard.fetch("b");
      throw new Error("expected RateLimitedError");
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitedError);
      expect((err as RateLimitedError).retryAfterMs).toBeGreaterThan(0);
    }
  });
  it("propagates a fetcher failure without caching it (no phantom stale body)", async () => {
    const clock = makeClock();
    const fetcher = vi.fn(async () => {
      throw new Error("network down");
    });
    const guard = new FetchGuard({
      now: clock.now,
      fetcher,
      burst: 1,
      minIntervalMs: 10_000,
    });

    // The token is spent and the failure propagates — nothing is cached.
    await expect(guard.fetch("a")).rejects.toThrow("network down");
    // A later request for the same URL must NOT serve a stale body from a
    // failed fetch; with no token left and no cache it rate-limits instead.
    await expect(guard.fetch("a")).rejects.toBeInstanceOf(RateLimitedError);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("serves a fresh cache hit without spending a token", async () => {
    const clock = makeClock();
    const fetcher = vi.fn(async (url: string) => ({ url }));
    // burst: 2 + no spacing so that ONLY a leaked token (not the spacing rule)
    // could deny the later "b" call — this actually proves cache hits are free.
    const guard = new FetchGuard({
      now: clock.now,
      fetcher,
      burst: 2,
      minIntervalMs: 0,
      ttlMs: 60_000,
    });

    await guard.fetch("a"); // spends 1 of 2 tokens, caches "a" fresh
    // Repeated "a" is a fresh cache hit and must NOT consume the bucket...
    const hit = await guard.fetch("a");
    expect(hit.source).toBe("cache");
    // ...so the second token is still available for a brand-new URL.
    const b = await guard.fetch("b");
    expect(b.source).toBe("network");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("keeps retryAfter within the configured spacing window", async () => {
    const clock = makeClock();
    const minIntervalMs = 9_000;
    const guard = new FetchGuard({
      now: clock.now,
      fetcher: async () => ({}),
      burst: 1,
      minIntervalMs,
    });
    await guard.fetch("a");
    try {
      await guard.fetch("b");
      throw new Error("expected RateLimitedError");
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitedError);
      const wait = (err as RateLimitedError).retryAfterMs;
      expect(wait).toBeGreaterThan(0);
      expect(wait).toBeLessThanOrEqual(minIntervalMs);
    }
  });

  it("does not cache an Alpha Vantage throttle payload (Note)", async () => {
    const clock = makeClock();
    // First call returns a throttle Note, second returns real data.
    const bodies: unknown[] = [
      { Note: "Thank you for using Alpha Vantage! ...rate limit..." },
      { "Global Quote": { "05. price": "123.45" } },
    ];
    let i = 0;
    const fetcher = vi.fn(async () => bodies[i++]);
    const guard = new FetchGuard({
      now: clock.now,
      fetcher,
      burst: 10,
      minIntervalMs: 0,
      ttlMs: 60_000,
    });

    // No prior cache → a throttle response with nothing to fall back on errors.
    await expect(guard.fetch("u")).rejects.toBeInstanceOf(RateLimitedError);
    // The throttle body must NOT have been cached, so the next call refetches
    // and gets the real data (source network, not a replayed Note).
    const good = await guard.fetch("u");
    expect(good.source).toBe("network");
    expect(good.body).toEqual({ "Global Quote": { "05. price": "123.45" } });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("falls back to the last good body when a later refetch throttles (Information)", async () => {
    const clock = makeClock();
    const bodies: unknown[] = [
      { "Global Quote": { "05. price": "100.00" } }, // good
      { Information: "premium endpoint" }, // throttle on refetch
    ];
    let i = 0;
    const fetcher = vi.fn(async () => bodies[i++]);
    const guard = new FetchGuard({
      now: clock.now,
      fetcher,
      burst: 10,
      minIntervalMs: 0,
      ttlMs: 1_000,
    });

    const first = await guard.fetch("u");
    expect(first.source).toBe("network");
    clock.advance(2_000); // expire the cache → forces a refetch

    // Refetch returns a throttle payload; rather than poisoning the cache we
    // serve the last good body as stale.
    const second = await guard.fetch("u");
    expect(second.source).toBe("stale");
    expect(second.body).toEqual({ "Global Quote": { "05. price": "100.00" } });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("treats distinct URLs as independent cache keys", async () => {
    const clock = makeClock();
    const fetcher = vi.fn(async (url: string) => ({ url }));
    const guard = new FetchGuard({
      now: clock.now,
      fetcher,
      burst: 10,
      minIntervalMs: 0, // no spacing constraint for this test
      ttlMs: 60_000,
    });

    const a = await guard.fetch("https://x/q?s=IBM");
    const b = await guard.fetch("https://x/q?s=MSFT");
    expect(a.body).toEqual({ url: "https://x/q?s=IBM" });
    expect(b.body).toEqual({ url: "https://x/q?s=MSFT" });
    // Each is independently cached.
    expect((await guard.fetch("https://x/q?s=IBM")).source).toBe("cache");
    expect((await guard.fetch("https://x/q?s=MSFT")).source).toBe("cache");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe("defaultFetchGuard singleton", () => {
  it("returns the same instance until reset", () => {
    resetDefaultFetchGuard();
    const a = defaultFetchGuard();
    const b = defaultFetchGuard();
    expect(a).toBe(b);
    resetDefaultFetchGuard();
    expect(defaultFetchGuard()).not.toBe(a);
  });
});
