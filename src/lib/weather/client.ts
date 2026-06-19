import {
  ArchiveQuery,
  CurrentWeather,
  DailyWeatherSeries,
  ForecastQuery,
  archiveUrl,
  forecastUrl,
  normalizeCurrent,
  normalizeDaily,
} from "./open-meteo";
import {
  IndicatorQuery,
  WorldDataSeries,
  indicatorUrl,
  normalizeSeries,
} from "./world-bank";

/**
 * Keyless weather/world HTTP client.
 *
 * Both upstreams (Open-Meteo, World Bank) require no API key. The single
 * network seam is an injectable {@link FetchFn} so tests run fully offline with
 * a stub — there is no live API call anywhere in this module's test path.
 *
 * READ-ONLY: every method is a GET that reads public observational data.
 */

/** Minimal structural subset of the Fetch API this client depends on. */
export type FetchFn = (url: string) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

/** Configuration for {@link WeatherWorldClient}. */
export interface WeatherWorldClientOptions {
  /**
   * Fetch implementation. Defaults to the global `fetch`. Inject a stub in
   * tests to stay offline (AGENTS.md: adapters are fixture-tested, never live).
   */
  fetch?: FetchFn;
}

async function getJson(fetchFn: FetchFn, url: string): Promise<unknown> {
  const res = await fetchFn(url);
  if (!res.ok) {
    throw new Error(`request failed (${res.status}): ${url}`);
  }
  return res.json();
}

/**
 * A small, dependency-light client over Open-Meteo + the World Bank. Construct
 * once and reuse. All methods validate and normalize their responses via the
 * pure adapters in `open-meteo.ts` / `world-bank.ts`.
 */
export class WeatherWorldClient {
  private readonly fetchFn: FetchFn;

  constructor(options: WeatherWorldClientOptions = {}) {
    const injected = options.fetch;
    if (injected) {
      this.fetchFn = injected;
    } else if (typeof globalThis.fetch === "function") {
      // Bind so `this` inside the platform fetch resolves correctly.
      this.fetchFn = ((url: string) => globalThis.fetch(url)) as FetchFn;
    } else {
      throw new Error(
        "no fetch available: pass options.fetch (required outside a fetch-capable runtime)",
      );
    }
  }

  /** Current conditions for a location. `null` if upstream omits `current`. */
  async getCurrentWeather(
    query: ForecastQuery,
  ): Promise<CurrentWeather | null> {
    const url = forecastUrl({ ...query, current: true });
    return normalizeCurrent(await getJson(this.fetchFn, url));
  }

  /** Daily forecast series for a location. `null` if upstream omits `daily`. */
  async getDailyForecast(
    query: ForecastQuery,
  ): Promise<DailyWeatherSeries | null> {
    const url = forecastUrl({ ...query, daily: true });
    return normalizeDaily(await getJson(this.fetchFn, url));
  }

  /** Historical daily archive for a date range. `null` if upstream omits `daily`. */
  async getDailyArchive(
    query: ArchiveQuery,
  ): Promise<DailyWeatherSeries | null> {
    const url = archiveUrl(query);
    return normalizeDaily(await getJson(this.fetchFn, url));
  }

  /** A World Bank indicator series for a country (sorted ascending). */
  async getWorldIndicator(query: IndicatorQuery): Promise<WorldDataSeries> {
    const url = indicatorUrl(query);
    return normalizeSeries(await getJson(this.fetchFn, url));
  }
}
