import { CoinId, VsCurrency } from "./schema";
import { parseSimplePrice, type CoinPrices } from "./parse";

/**
 * Thin client for CoinGecko's keyless public price API.
 *
 * The network call is injected (`fetchImpl`), so unit tests drive the parser
 * with fixtures and never touch the live API (see AGENTS.md: "Data adapters are
 * tested against fixtures, never live APIs"). In production the default global
 * `fetch` is used.
 *
 * READ-ONLY product: only GET price reads; this adapter never moves money.
 */

/** Default base URL for CoinGecko's free, keyless public API. */
export const COINGECKO_BASE_URL = "https://api.coingecko.com/api/v3";

/** Minimal fetch signature this client depends on (injectable for tests). */
export type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal; headers?: Record<string, string> },
) => Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  json: () => Promise<unknown>;
}>;

/** Default per-request timeout (ms) for the upstream fetch. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

/** Options for {@link CryptoAdapter}. */
export interface CryptoAdapterOptions {
  /** Base URL (defaults to {@link COINGECKO_BASE_URL}). */
  baseUrl?: string;
  /** Injected fetch implementation (defaults to the global `fetch`). */
  fetchImpl?: FetchLike;
  /**
   * Per-request timeout in milliseconds (defaults to
   * {@link DEFAULT_REQUEST_TIMEOUT_MS}). Pass `0` to disable the timeout and
   * rely solely on caller cancellation.
   */
  requestTimeoutMs?: number;
}

/** Arguments for a `/simple/price` lookup. */
export interface SimplePriceParams {
  /** One or more CoinGecko coin ids (e.g. `["bitcoin", "ethereum"]`). */
  ids: string[];
  /** One or more quote currencies (e.g. `["usd", "eur"]`). */
  vsCurrencies: string[];
  /** Include 24h percentage change. */
  include24hChange?: boolean;
  /** Include market capitalization. */
  includeMarketCap?: boolean;
  /** Include the `last_updated_at` epoch-seconds timestamp. */
  includeLastUpdatedAt?: boolean;
}

function dedupeLower(values: string[], parse: (s: string) => string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const norm = parse(v);
    if (!seen.has(norm)) {
      seen.add(norm);
      out.push(norm);
    }
  }
  return out;
}

/**
 * Build the full `/simple/price` request URL for the given params. Exported so
 * tests can assert on the exact URL (ids/currencies normalized + deduped, query
 * flags set) without making a network call.
 */
export function buildSimplePriceUrl(
  params: SimplePriceParams,
  baseUrl: string = COINGECKO_BASE_URL,
): string {
  const ids = dedupeLower(params.ids, (s) => CoinId.parse(s));
  const vs = dedupeLower(params.vsCurrencies, (s) => VsCurrency.parse(s));
  if (ids.length === 0) {
    throw new Error("simple/price requires at least one coin id");
  }
  if (vs.length === 0) {
    throw new Error("simple/price requires at least one vs_currency");
  }
  const search = new URLSearchParams();
  search.set("ids", ids.join(","));
  search.set("vs_currencies", vs.join(","));
  if (params.include24hChange) search.set("include_24hr_change", "true");
  if (params.includeMarketCap) search.set("include_market_cap", "true");
  if (params.includeLastUpdatedAt) search.set("include_last_updated_at", "true");
  const trimmedBase = baseUrl.replace(/\/+$/, "");
  return `${trimmedBase}/simple/price?${search.toString()}`;
}

/**
 * Combine an optional caller signal with an optional timeout signal into one.
 * Returns the single signal when only one is present (no wrapper allocated),
 * and falls back to a manual relay when `AbortSignal.any` is unavailable.
 */
function combineSignals(
  a: AbortSignal | undefined,
  b: AbortSignal | undefined,
): AbortSignal | undefined {
  if (!a) return b;
  if (!b) return a;
  const anyFn = (
    AbortSignal as unknown as {
      any?: (signals: AbortSignal[]) => AbortSignal;
    }
  ).any;
  if (typeof anyFn === "function") {
    return anyFn([a, b]);
  }
  // Manual fallback: abort the controller when either input aborts.
  const controller = new AbortController();
  const onAbort = (source: AbortSignal) => () =>
    controller.abort(source.reason);
  if (a.aborted) {
    controller.abort(a.reason);
  } else if (b.aborted) {
    controller.abort(b.reason);
  } else {
    a.addEventListener("abort", onAbort(a), { once: true });
    b.addEventListener("abort", onAbort(b), { once: true });
  }
  return controller.signal;
}

/** Error thrown when the CoinGecko API returns a non-2xx response. */
export class CryptoAdapterHttpError extends Error {
  /** HTTP status code of the failing response. */
  readonly status: number;
  constructor(status: number, statusText: string, url: string) {
    super(`CoinGecko request failed: ${status} ${statusText} (${url})`);
    this.name = "CryptoAdapterHttpError";
    this.status = status;
  }
}

/**
 * Read-only CoinGecko price adapter. Construct with an injected `fetchImpl` in
 * tests to stay offline; in production it falls back to the global `fetch`.
 */
export class CryptoAdapter {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly requestTimeoutMs: number;

  constructor(options: CryptoAdapterOptions = {}) {
    this.baseUrl = (options.baseUrl ?? COINGECKO_BASE_URL).replace(/\/+$/, "");
    const fallback = (
      globalThis as { fetch?: FetchLike }
    ).fetch;
    const impl = options.fetchImpl ?? fallback;
    if (!impl) {
      throw new Error(
        "CryptoAdapter requires a fetch implementation (none injected and no global fetch)",
      );
    }
    this.fetchImpl = impl;
    this.requestTimeoutMs =
      options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  }

  /**
   * Fetch and parse `/simple/price` for the given coins and currencies.
   * Throws {@link CryptoAdapterHttpError} on a non-2xx response and a zod error
   * when the body is malformed.
   */
  async simplePrice(
    params: SimplePriceParams,
    init?: { signal?: AbortSignal },
  ): Promise<CoinPrices[]> {
    const url = buildSimplePriceUrl(params, this.baseUrl);

    // Bound the request with a default timeout so a stalled upstream response
    // cannot block indefinitely. A caller-supplied signal still aborts the
    // request too; whichever fires first wins.
    let timeoutSignal: AbortSignal | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (this.requestTimeoutMs > 0) {
      const controller = new AbortController();
      timeoutSignal = controller.signal;
      timer = setTimeout(() => {
        controller.abort(
          new Error(
            `CoinGecko request timed out after ${this.requestTimeoutMs}ms (${url})`,
          ),
        );
      }, this.requestTimeoutMs);
    }
    const signal = combineSignals(init?.signal, timeoutSignal);

    try {
      const res = await this.fetchImpl(url, {
        signal,
        headers: { accept: "application/json" },
      });
      if (!res.ok) {
        throw new CryptoAdapterHttpError(res.status, res.statusText, url);
      }
      const body = await res.json();
      return parseSimplePrice(body);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
}
