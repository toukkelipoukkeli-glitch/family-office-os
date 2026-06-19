import { parseFredObservations } from "./fred-response";
import {
  MACRO_SERIES,
  type MacroSeries,
  type MacroSeriesKey,
} from "./series";

/**
 * FRED macro adapter client.
 *
 * READ-ONLY product: this client only issues HTTP GETs against the public FRED
 * data API to read macro series. It never moves money or places a trade.
 *
 * The client takes an injectable `fetch`, so tests run fully offline against
 * fixtures (see AGENTS.md: "Data adapters are tested against fixtures, never
 * live APIs"). In production it defaults to the global `fetch`.
 */

/** Base URL for the FRED data API. */
export const FRED_BASE_URL = "https://api.stlouisfed.org/fred";

/** Minimal `fetch` signature this client depends on (easy to fake in tests). */
export type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<FetchResponseLike>;

/** Minimal `Response` shape this client reads. */
export interface FetchResponseLike {
  ok: boolean;
  status: number;
  statusText?: string;
  json(): Promise<unknown>;
}

/** Error thrown when the FRED API key is missing. */
export class MissingApiKeyError extends Error {
  constructor() {
    super(
      "FRED_API_KEY is not set; pass an apiKey to MacroAdapter or set the env var",
    );
    this.name = "MissingApiKeyError";
  }
}

/** Error thrown when FRED returns a non-2xx response. */
export class FredHttpError extends Error {
  readonly status: number;
  constructor(status: number, statusText?: string) {
    super(`FRED request failed: ${status}${statusText ? ` ${statusText}` : ""}`);
    this.name = "FredHttpError";
    this.status = status;
  }
}

/** Options for constructing a {@link MacroAdapter}. */
export interface MacroAdapterOptions {
  /** FRED API key. Falls back to `process.env.FRED_API_KEY` when omitted. */
  apiKey?: string;
  /** Injectable fetch (defaults to global `fetch`); use a fake in tests. */
  fetch?: FetchLike;
  /** Override the base URL (defaults to {@link FRED_BASE_URL}). */
  baseUrl?: string;
}

/** Optional per-request window. */
export interface ObservationQuery {
  /** Inclusive start date (YYYY-MM-DD). */
  observationStart?: string;
  /** Inclusive end date (YYYY-MM-DD). */
  observationEnd?: string;
}

function resolveApiKey(explicit?: string): string {
  const key =
    explicit ??
    (typeof process !== "undefined"
      ? process.env?.FRED_API_KEY
      : undefined);
  if (!key || key.trim() === "") throw new MissingApiKeyError();
  return key.trim();
}

/**
 * Build the FRED `series/observations` request URL for a series key. Exported
 * so the URL construction (param shape, key redaction concerns) is unit
 * testable without a network round-trip.
 */
export function buildObservationsUrl(
  key: MacroSeriesKey,
  apiKey: string,
  query: ObservationQuery = {},
  baseUrl: string = FRED_BASE_URL,
): string {
  const params = new URLSearchParams({
    series_id: MACRO_SERIES[key].fredId,
    api_key: apiKey,
    file_type: "json",
  });
  if (query.observationStart)
    params.set("observation_start", query.observationStart);
  if (query.observationEnd)
    params.set("observation_end", query.observationEnd);
  return `${baseUrl}/series/observations?${params.toString()}`;
}

/**
 * A thin, testable adapter over the FRED data API for the macro series this
 * product cares about (rates, CPI).
 */
export class MacroAdapter {
  private readonly apiKey: string;
  private readonly doFetch: FetchLike;
  private readonly baseUrl: string;

  constructor(options: MacroAdapterOptions = {}) {
    this.apiKey = resolveApiKey(options.apiKey);
    const injected = options.fetch;
    if (injected) {
      this.doFetch = injected;
    } else if (typeof fetch !== "undefined") {
      this.doFetch = (url, init) =>
        fetch(url, init) as unknown as Promise<FetchResponseLike>;
    } else {
      throw new Error("no fetch available; pass options.fetch");
    }
    this.baseUrl = options.baseUrl ?? FRED_BASE_URL;
  }

  /** Fetch and parse a single macro series by its internal key. */
  async fetchSeries(
    key: MacroSeriesKey,
    query: ObservationQuery = {},
    init?: { signal?: AbortSignal },
  ): Promise<MacroSeries> {
    const url = buildObservationsUrl(key, this.apiKey, query, this.baseUrl);
    const res = await this.doFetch(url, init);
    if (!res.ok) throw new FredHttpError(res.status, res.statusText);
    const raw = await res.json();
    return parseFredObservations(key, raw);
  }

  /** Convenience: the 10-Year Treasury rate series (DGS10). */
  fetchTenYearRate(
    query?: ObservationQuery,
    init?: { signal?: AbortSignal },
  ): Promise<MacroSeries> {
    return this.fetchSeries("dgs10", query, init);
  }

  /** Convenience: the CPI (All Urban Consumers) series (CPIAUCSL). */
  fetchCpi(
    query?: ObservationQuery,
    init?: { signal?: AbortSignal },
  ): Promise<MacroSeries> {
    return this.fetchSeries("cpi", query, init);
  }
}
