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
