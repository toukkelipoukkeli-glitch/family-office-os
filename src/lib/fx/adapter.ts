import { CurrencyCode, IsoDate } from "../model/primitives";
import { FrankfurterResponse } from "./primitives";
import { RateTable } from "./rates";

/**
 * Thin adapter over the frankfurter.dev exchange-rate API.
 *
 * The network call is injected via {@link FxAdapterOptions.fetchImpl} so the
 * adapter can be driven entirely from fixtures in tests — no live API is ever
 * hit during the test suite (see AGENTS.md: "Data adapters are tested against
 * fixtures in `fixtures/`, never live APIs.").
 *
 * READ-ONLY product: this fetches *reference* rates to value holdings; it never
 * executes a currency exchange or moves funds.
 */

/** Default frankfurter.dev API origin. Overridable for self-hosted instances. */
export const FRANKFURTER_BASE_URL = "https://api.frankfurter.dev/v1";

/** Minimal subset of the `fetch` signature the adapter depends on. */
export type FetchLike = (
  url: string,
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export interface FxAdapterOptions {
  /** Base origin for the API (no trailing slash). Defaults to frankfurter.dev. */
  baseUrl?: string;
  /** Injected fetch implementation. Defaults to the global `fetch`. */
  fetchImpl?: FetchLike;
}

/** Parameters shared by the latest/historical rate queries. */
export interface FetchRatesParams {
  /** Base currency to anchor the returned rates to (e.g. `"EUR"`). */
  base: string;
  /**
   * Restrict the response to these quote currencies. When omitted, the API
   * returns every currency it tracks.
   */
  symbols?: string[];
  /**
   * Historical observation date (`YYYY-MM-DD`). When omitted, the latest
   * published rates are requested.
   */
  date?: string;
}

function buildUrl(baseUrl: string, params: FetchRatesParams): string {
  const base = CurrencyCode.parse(params.base);
  // Validate the date at the boundary just like `base`/`symbols`, so a
  // malformed date (e.g. "2026-13-99") fails loudly here instead of silently
  // reaching the network and producing a confusing HTTP error.
  const path = params.date ? IsoDate.parse(params.date) : "latest";
  const search = new URLSearchParams({ base });
  if (params.symbols && params.symbols.length > 0) {
    const symbols = params.symbols.map((s) => CurrencyCode.parse(s));
    search.set("symbols", symbols.join(","));
  }
  return `${baseUrl.replace(/\/$/, "")}/${path}?${search.toString()}`;
}

/**
 * Adapter that fetches exchange rates and returns a validated {@link RateTable}.
 */
export class FxAdapter {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: FxAdapterOptions = {}) {
    this.baseUrl = options.baseUrl ?? FRANKFURTER_BASE_URL;
    const injected = options.fetchImpl;
    if (injected) {
      this.fetchImpl = injected;
    } else if (typeof fetch === "function") {
      this.fetchImpl = (url) => fetch(url);
    } else {
      throw new Error(
        "No fetch implementation available; pass fetchImpl to FxAdapter",
      );
    }
  }

  /** Fetch and validate rates, returning an immutable {@link RateTable}. */
  async fetchRates(params: FetchRatesParams): Promise<RateTable> {
    const url = buildUrl(this.baseUrl, params);
    const response = await this.fetchImpl(url);
    if (!response.ok) {
      throw new Error(
        `FX request failed: ${response.status} for ${url}`,
      );
    }
    const payload = await response.json();
    const parsed = FrankfurterResponse.parse(payload);
    return RateTable.fromFrankfurter(parsed);
  }
}
