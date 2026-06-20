/**
 * Offline cache + rate-limit guard for the Alpha Vantage fetch.
 *
 * Alpha Vantage's free tier is aggressively throttled (a handful of calls per
 * minute / per day) and, when throttled, replies with an HTTP 200 body that
 * carries a `Note`/`Information` message instead of data. Hammering it just
 * burns quota and returns junk. This guard wraps the raw `fetch` with two
 * defenses:
 *
 *  1. **A response cache** keyed by request URL with a configurable TTL. A fresh
 *     cache hit short-circuits the network entirely.
 *  2. **A rate limiter** (token bucket with a minimum spacing between calls).
 *     When no token is available the guard does NOT hit the network; instead it
 *     serves the last cached body for that URL if one exists ("stale-on-limit",
 *     an offline fallback), or throws a typed {@link RateLimitedError} if not.
 *
 * Everything is pure and clock-injectable, so it is unit-tested fully offline:
 * no timers, no real network, deterministic given a fake `now()` and a stub
 * `fetch`. The live wiring lives in `convex/equities.ts`.
 *
 * READ-ONLY product: this only governs *reads* of public market prices.
 */

/** A cached upstream response body plus the wall-clock time it was stored. */
interface CacheEntry {
  body: unknown;
  storedAt: number;
}

/** Thrown when a call is denied by the rate limiter and no cache is available. */
export class RateLimitedError extends Error {
  readonly retryAfterMs: number;
  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.name = "RateLimitedError";
    this.retryAfterMs = retryAfterMs;
  }
}

export interface FetchGuardOptions {
  /** How long a cached body stays fresh, in ms. Default 60_000 (1 min). */
  ttlMs?: number;
  /** Token-bucket capacity (max burst of calls). Default 5. */
  burst?: number;
  /** Minimum spacing between granted calls, in ms. Default 12_000 (≈5/min). */
  minIntervalMs?: number;
  /**
   * Injectable clock for deterministic tests. Defaults to `Date.now`. Must
   * return a monotonically non-decreasing millisecond timestamp.
   */
  now?: () => number;
  /** Injectable fetcher. Defaults to a `fetch`-backed JSON loader. */
  fetcher?: (url: string) => Promise<unknown>;
}

/** Result of a guarded fetch: the body plus where it came from. */
export interface GuardedResult {
  body: unknown;
  /**
   * - `network` — a live call was made.
   * - `cache` — served from a still-fresh cache entry.
   * - `stale` — served an expired cache entry because the limiter denied a call.
   */
  source: "network" | "cache" | "stale";
}

const DEFAULTS = {
  ttlMs: 60_000,
  burst: 5,
  minIntervalMs: 12_000,
} as const;

/**
 * A stateful guard around a fetcher. Construct one per process (the Convex
 * action module holds a singleton via {@link defaultFetchGuard}) so the cache
 * and token bucket persist across calls.
 */
export class FetchGuard {
  private readonly ttlMs: number;
  private readonly capacity: number;
  private readonly minIntervalMs: number;
  private readonly now: () => number;
  private readonly fetcher: (url: string) => Promise<unknown>;

  private readonly cache = new Map<string, CacheEntry>();

  /** Available tokens (fractional). Refills toward `capacity` over time. */
  private tokens: number;
  /** Last time the bucket was refilled. */
  private lastRefill: number;
  /** Last time a call was actually granted (for min-interval spacing). */
  private lastGrant = Number.NEGATIVE_INFINITY;

  constructor(options: FetchGuardOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULTS.ttlMs;
    this.capacity = options.burst ?? DEFAULTS.burst;
    this.minIntervalMs = options.minIntervalMs ?? DEFAULTS.minIntervalMs;
    this.now = options.now ?? Date.now;
    this.fetcher = options.fetcher ?? defaultJsonFetcher;
    this.tokens = this.capacity;
    this.lastRefill = this.now();
  }

  /** Refill tokens based on elapsed time since the last refill. */
  private refill(at: number): void {
    if (at <= this.lastRefill) return;
    const elapsed = at - this.lastRefill;
    // One token regenerates every `minIntervalMs`.
    const regenerated = elapsed / this.minIntervalMs;
    this.tokens = Math.min(this.capacity, this.tokens + regenerated);
    this.lastRefill = at;
  }

  /**
   * Try to consume a token, respecting both bucket level and the minimum
   * spacing between grants. Returns the ms a caller would have to wait before a
   * token frees up (0 when granted).
   */
  private tryConsume(at: number): { granted: boolean; retryAfterMs: number } {
    this.refill(at);
    const sinceGrant = at - this.lastGrant;
    const spacingWait =
      sinceGrant >= this.minIntervalMs ? 0 : this.minIntervalMs - sinceGrant;
    if (this.tokens >= 1 && spacingWait === 0) {
      this.tokens -= 1;
      this.lastGrant = at;
      return { granted: true, retryAfterMs: 0 };
    }
    const tokenWait =
      this.tokens >= 1 ? 0 : Math.ceil((1 - this.tokens) * this.minIntervalMs);
    return { granted: false, retryAfterMs: Math.max(spacingWait, tokenWait) };
  }

  /**
   * Fetch `url` through the cache + rate-limit guard.
   *
   * Order of operations:
   *  1. Fresh cache hit → return it (`cache`), no network, no token spent.
   *  2. Otherwise try to spend a token; if granted, fetch live, cache, return
   *     (`network`).
   *  3. If denied but a (stale) cache entry exists → return it (`stale`).
   *  4. If denied and nothing cached → throw {@link RateLimitedError}.
   */
  async fetch(url: string): Promise<GuardedResult> {
    const at = this.now();
    const cached = this.cache.get(url);
    if (cached && at - cached.storedAt < this.ttlMs) {
      return { body: cached.body, source: "cache" };
    }

    const { granted, retryAfterMs } = this.tryConsume(at);
    if (granted) {
      const body = await this.fetcher(url);
      this.cache.set(url, { body, storedAt: this.now() });
      return { body, source: "network" };
    }

    if (cached) {
      // Stale-on-limit: better to serve a slightly old price than to error or
      // burn quota on a throttle response.
      return { body: cached.body, source: "stale" };
    }

    throw new RateLimitedError(
      `Alpha Vantage rate limit reached and nothing is cached for this request; retry in ~${retryAfterMs}ms`,
      retryAfterMs,
    );
  }

  /** Drop all cached entries (used by tests). */
  clearCache(): void {
    this.cache.clear();
  }
}

/** Default JSON fetcher: HTTP GET + decode, throwing on non-2xx. */
async function defaultJsonFetcher(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Alpha Vantage HTTP ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as unknown;
}

/**
 * Process-wide singleton guard used by the Convex actions. Lazily created so a
 * test can construct its own isolated {@link FetchGuard} instead.
 */
let singleton: FetchGuard | null = null;
export function defaultFetchGuard(): FetchGuard {
  if (!singleton) singleton = new FetchGuard();
  return singleton;
}

/**
 * Reset the process-wide singleton. Tests call this between cases so the cache
 * and token bucket never leak state across the offline action tests.
 */
export function resetDefaultFetchGuard(): void {
  singleton = null;
}
