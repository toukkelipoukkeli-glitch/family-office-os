import { describe, expect, it } from "vitest";

import {
  ArchiveQuery,
  CountryCode,
  ForecastQuery,
  GeoPoint,
  IndicatorQuery,
  Latitude,
  Longitude,
  WeatherWorldClient,
  archiveUrl,
  forecastUrl,
  indicatorUrl,
  latestValue,
  normalizeCurrent,
  normalizeDaily,
  normalizeSeries,
} from "./index";
import {
  openMeteoArchiveFixture,
  openMeteoForecastFixture,
  worldBankEmptyFixture,
  worldBankErrorFixture,
  worldBankGdpFixture,
} from "./fixtures";

/* ================================================================== */
/* Primitives                                                          */
/* ================================================================== */

describe("primitives", () => {
  it("Latitude/Longitude reject out-of-range and non-finite values", () => {
    expect(Latitude.safeParse(60.17).success).toBe(true);
    expect(Latitude.safeParse(90).success).toBe(true);
    expect(Latitude.safeParse(-91).success).toBe(false);
    expect(Latitude.safeParse(Number.NaN).success).toBe(false);
    expect(Longitude.safeParse(181).success).toBe(false);
    expect(Longitude.safeParse(-180).success).toBe(true);
  });

  it("GeoPoint requires both coordinates", () => {
    expect(GeoPoint.safeParse({ latitude: 1, longitude: 2 }).success).toBe(true);
    expect(GeoPoint.safeParse({ latitude: 1 }).success).toBe(false);
  });

  it("CountryCode normalizes case and accepts 2- or 3-letter codes", () => {
    expect(CountryCode.parse("fi")).toBe("FI");
    expect(CountryCode.parse(" wld ")).toBe("WLD");
    expect(CountryCode.safeParse("USA1").success).toBe(false);
    expect(CountryCode.safeParse("U").success).toBe(false);
  });
});

/* ================================================================== */
/* Open-Meteo: current                                                 */
/* ================================================================== */

describe("normalizeCurrent", () => {
  it("normalizes a current-conditions block", () => {
    const cur = normalizeCurrent(openMeteoForecastFixture);
    expect(cur).not.toBeNull();
    expect(cur!.point).toEqual({ latitude: 60.16, longitude: 24.94 });
    expect(cur!.timezone).toBe("Europe/Helsinki");
    expect(cur!.time).toBe("2026-06-19T12:00");
    expect(cur!.temperatureC).toBe(18.4);
    expect(cur!.relativeHumidityPct).toBe(61);
    expect(cur!.precipitationMm).toBe(0);
    expect(cur!.windSpeedKmh).toBe(12.3);
    expect(cur!.weatherCode).toBe(3);
  });

  it("distinguishes a real 0 reading from a missing one (null)", () => {
    const cur = normalizeCurrent(openMeteoForecastFixture)!;
    // precipitation is genuinely 0 in the fixture, not absent.
    expect(cur.precipitationMm).toBe(0);
    expect(cur.precipitationMm).not.toBeNull();
  });

  it("returns null when there is no current block", () => {
    expect(normalizeCurrent({ latitude: 1, longitude: 2 })).toBeNull();
  });

  it("fills absent optional fields with null", () => {
    const cur = normalizeCurrent({
      latitude: 1,
      longitude: 2,
      current: { time: "2026-01-01T00:00" },
    })!;
    expect(cur.temperatureC).toBeNull();
    expect(cur.windSpeedKmh).toBeNull();
    expect(cur.time).toBe("2026-01-01T00:00");
  });

  it("throws on a structurally invalid response", () => {
    expect(() => normalizeCurrent({ latitude: "nope", longitude: 2 })).toThrow();
    expect(() => normalizeCurrent(null)).toThrow();
  });
});

/* ================================================================== */
/* Open-Meteo: daily                                                   */
/* ================================================================== */

describe("normalizeDaily", () => {
  it("transposes parallel arrays into one object per day", () => {
    const series = normalizeDaily(openMeteoForecastFixture)!;
    expect(series.point).toEqual({ latitude: 60.16, longitude: 24.94 });
    expect(series.days).toHaveLength(3);
    expect(series.days[0]).toEqual({
      date: "2026-06-19",
      temperatureMaxC: 19.8,
      temperatureMinC: 11.1,
      temperatureMeanC: 15.4,
      precipitationMm: 0,
    });
    expect(series.days[2].precipitationMm).toBe(5.1);
  });

  it("preserves null gaps from the historical archive", () => {
    const series = normalizeDaily(openMeteoArchiveFixture)!;
    expect(series.days).toHaveLength(3);
    expect(series.days[1]).toEqual({
      date: "2024-07-02",
      temperatureMaxC: null,
      temperatureMinC: null,
      temperatureMeanC: null,
      precipitationMm: null,
    });
    expect(series.days[0].temperatureMaxC).toBe(24.1);
  });

  it("returns null when there is no daily block", () => {
    expect(normalizeDaily({ latitude: 1, longitude: 2 })).toBeNull();
  });

  it("treats a missing variable array as all-null", () => {
    const series = normalizeDaily({
      latitude: 1,
      longitude: 2,
      daily: { time: ["2026-01-01", "2026-01-02"], temperature_2m_max: [5, 6] },
    })!;
    expect(series.days[0].temperatureMaxC).toBe(5);
    expect(series.days[0].precipitationMm).toBeNull();
    expect(series.days[1].temperatureMeanC).toBeNull();
  });

  it("tolerates a ragged (short) variable array", () => {
    const series = normalizeDaily({
      latitude: 1,
      longitude: 2,
      daily: {
        time: ["2026-01-01", "2026-01-02"],
        temperature_2m_max: [5], // shorter than time
      },
    })!;
    expect(series.days[0].temperatureMaxC).toBe(5);
    expect(series.days[1].temperatureMaxC).toBeNull();
  });

  it("throws when a variable array is longer than the time array", () => {
    expect(() =>
      normalizeDaily({
        latitude: 1,
        longitude: 2,
        daily: {
          time: ["2026-01-01"],
          temperature_2m_max: [5, 6, 7], // longer than time
        },
      }),
    ).toThrow(/longer than time/);
  });

  it("rejects an invalid ISO date in the daily series", () => {
    expect(() =>
      normalizeDaily({
        latitude: 1,
        longitude: 2,
        daily: { time: ["2026-13-40"], temperature_2m_max: [5] },
      }),
    ).toThrow();
  });

  it("yields an empty series for an empty time array", () => {
    const series = normalizeDaily({
      latitude: 1,
      longitude: 2,
      daily: { time: [] },
    })!;
    expect(series).not.toBeNull();
    expect(series.days).toEqual([]);
    expect(series.point).toEqual({ latitude: 1, longitude: 2 });
  });

  it("throws when time is empty but a variable array carries data", () => {
    // A contradictory payload (no timestamps, yet readings present) is a
    // contract violation we refuse to silently swallow.
    expect(() =>
      normalizeDaily({
        latitude: 1,
        longitude: 2,
        daily: { time: [], temperature_2m_max: [5] },
      }),
    ).toThrow(/longer than time/);
  });

  it("rejects an out-of-range coordinate in the response envelope", () => {
    // GeoPoint enforcement happens on the normalized point, so an upstream
    // latitude beyond +/-90 must surface as a validation error, not silently pass.
    expect(() =>
      normalizeDaily({
        latitude: 200,
        longitude: 2,
        daily: { time: ["2026-01-01"], temperature_2m_max: [5] },
      }),
    ).toThrow();
  });
});

/* ================================================================== */
/* Open-Meteo: URL builders                                            */
/* ================================================================== */

describe("forecastUrl", () => {
  it("builds a keyless current+daily forecast URL", () => {
    const url = forecastUrl({
      latitude: 60.17,
      longitude: 24.94,
      current: true,
      daily: true,
      forecastDays: 7,
    });
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe("https://api.open-meteo.com/v1/forecast");
    expect(u.searchParams.get("latitude")).toBe("60.17");
    expect(u.searchParams.get("longitude")).toBe("24.94");
    expect(u.searchParams.get("timezone")).toBe("auto");
    expect(u.searchParams.get("forecast_days")).toBe("7");
    expect(u.searchParams.get("current")).toContain("temperature_2m");
    expect(u.searchParams.get("daily")).toContain("precipitation_sum");
    // keyless: no api key parameter of any kind
    expect(url.toLowerCase()).not.toMatch(/apikey|api_key|appid|token/);
  });

  it("omits the current/daily params when those blocks are not requested", () => {
    const u = new URL(forecastUrl({ latitude: 0, longitude: 0, current: false }));
    expect(u.searchParams.has("current")).toBe(false);
    expect(u.searchParams.has("daily")).toBe(false);
  });

  it("rejects out-of-range coordinates and bad forecastDays", () => {
    expect(() => forecastUrl({ latitude: 200, longitude: 0 })).toThrow();
    expect(() =>
      forecastUrl({ latitude: 0, longitude: 0, forecastDays: 99 }),
    ).toThrow();
  });

  it("builds a bare coordinate URL when both current and daily are off", () => {
    const u = new URL(
      forecastUrl({ latitude: 0, longitude: 0, current: false, daily: false }),
    );
    expect(u.searchParams.has("current")).toBe(false);
    expect(u.searchParams.has("daily")).toBe(false);
    expect(u.searchParams.get("latitude")).toBe("0");
    expect(u.searchParams.get("timezone")).toBe("auto");
  });

  it("ForecastQuery applies defaults", () => {
    const q = ForecastQuery.parse({ latitude: 1, longitude: 2 });
    expect(q.current).toBe(true);
    expect(q.daily).toBe(false);
    expect(q.timezone).toBe("auto");
  });
});

describe("archiveUrl", () => {
  it("builds a keyless archive URL with a date range", () => {
    const url = archiveUrl({
      latitude: 60.17,
      longitude: 24.94,
      startDate: "2024-01-01",
      endDate: "2024-12-31",
    });
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe(
      "https://archive-api.open-meteo.com/v1/archive",
    );
    expect(u.searchParams.get("start_date")).toBe("2024-01-01");
    expect(u.searchParams.get("end_date")).toBe("2024-12-31");
    expect(u.searchParams.get("daily")).toContain("temperature_2m_mean");
  });

  it("rejects a reversed date range", () => {
    expect(() =>
      ArchiveQuery.parse({
        latitude: 0,
        longitude: 0,
        startDate: "2024-12-31",
        endDate: "2024-01-01",
      }),
    ).toThrow();
  });
});

/* ================================================================== */
/* World Bank                                                          */
/* ================================================================== */

describe("normalizeSeries", () => {
  it("normalizes and sorts a GDP series ascending by period", () => {
    const series = normalizeSeries(worldBankGdpFixture);
    expect(series.indicatorId).toBe("NY.GDP.MKTP.CD");
    expect(series.indicatorName).toBe("GDP (current US$)");
    expect(series.country).toBe("FIN");
    expect(series.countryName).toBe("Finland");
    expect(series.points.map((p) => p.period)).toEqual(["2020", "2021", "2022"]);
    expect(series.points[0].value).toBeNull(); // 2020 missing
    expect(series.points[2].value).toBe(282510000000);
    expect(series.points[0].year).toBe(2020);
  });

  it("returns a valid empty series when there is no data", () => {
    const series = normalizeSeries(worldBankEmptyFixture);
    expect(series.points).toEqual([]);
    expect(series.country).toBe("WLD"); // graceful fallback
  });

  it("throws a descriptive error on the World Bank error envelope", () => {
    expect(() => normalizeSeries(worldBankErrorFixture)).toThrow(
      /world bank API error.*not valid/i,
    );
  });

  it("throws on a structurally invalid response", () => {
    expect(() => normalizeSeries({ not: "a tuple" })).toThrow();
  });

  it("parseYear: leaves non-year periods (e.g. monthly) unparsed and sorts them lexicographically", () => {
    const series = normalizeSeries([
      { page: 1, pages: 1, per_page: 50, total: 2 },
      [
        {
          indicator: { id: "X", value: "X" },
          country: { id: "FI", value: "Finland" },
          countryiso3code: "FIN",
          date: "2022M03",
          value: 3,
        },
        {
          indicator: { id: "X", value: "X" },
          country: { id: "FI", value: "Finland" },
          countryiso3code: "FIN",
          date: "2022M01",
          value: 1,
        },
      ],
    ]);
    expect(series.points.map((p) => p.period)).toEqual(["2022M01", "2022M03"]);
    // A monthly period is not a plain 4-digit year, so `year` stays null.
    expect(series.points.every((p) => p.year === null)).toBe(true);
    // latestValue still walks the (sorted) tail and finds the newest value.
    expect(latestValue(series)!.period).toBe("2022M03");
  });
});

describe("latestValue", () => {
  it("returns the most recent non-null observation", () => {
    const series = normalizeSeries(worldBankGdpFixture);
    const latest = latestValue(series);
    expect(latest).not.toBeNull();
    expect(latest!.period).toBe("2022");
    expect(latest!.value).toBe(282510000000);
  });

  it("skips trailing nulls to find the last real value", () => {
    const series = normalizeSeries([
      { page: 1, pages: 1, per_page: 50, total: 2 },
      [
        {
          indicator: { id: "X", value: "X" },
          country: { id: "FI", value: "Finland" },
          countryiso3code: "FIN",
          date: "2022",
          value: null,
        },
        {
          indicator: { id: "X", value: "X" },
          country: { id: "FI", value: "Finland" },
          countryiso3code: "FIN",
          date: "2021",
          value: 42,
        },
      ],
    ]);
    expect(latestValue(series)!.period).toBe("2021");
    expect(latestValue(series)!.value).toBe(42);
  });

  it("returns null when every value is missing", () => {
    const series = normalizeSeries(worldBankEmptyFixture);
    expect(latestValue(series)).toBeNull();
  });
});

describe("indicatorUrl", () => {
  it("builds a keyless JSON indicator URL", () => {
    const url = indicatorUrl({
      country: "fi",
      indicator: "NY.GDP.MKTP.CD",
      dateRange: "2010:2022",
    });
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe(
      "https://api.worldbank.org/v2/country/FI/indicator/NY.GDP.MKTP.CD",
    );
    expect(u.searchParams.get("format")).toBe("json");
    expect(u.searchParams.get("date")).toBe("2010:2022");
    expect(url.toLowerCase()).not.toMatch(/apikey|api_key|token/);
  });

  it("rejects a malformed date range and bad indicator code", () => {
    expect(() =>
      IndicatorQuery.parse({ country: "FI", indicator: "X", dateRange: "20-21" }),
    ).toThrow();
    expect(() =>
      IndicatorQuery.parse({ country: "FI", indicator: "bad code!" }),
    ).toThrow();
  });
});

/* ================================================================== */
/* Client (offline, stubbed fetch)                                     */
/* ================================================================== */

/** A stub fetch that maps URLs to fixture JSON; records the URLs it saw. */
function stubFetch(routes: Array<[RegExp, unknown]>) {
  const calls: string[] = [];
  const fetch = async (url: string) => {
    calls.push(url);
    const match = routes.find(([re]) => re.test(url));
    if (!match) {
      return { ok: false, status: 404, json: async () => ({}) };
    }
    return { ok: true, status: 200, json: async () => match[1] };
  };
  return { fetch, calls };
}

describe("WeatherWorldClient", () => {
  it("getCurrentWeather fetches and normalizes (offline)", async () => {
    const { fetch, calls } = stubFetch([
      [/open-meteo\.com\/v1\/forecast/, openMeteoForecastFixture],
    ]);
    const client = new WeatherWorldClient({ fetch });
    const cur = await client.getCurrentWeather({
      latitude: 60.17,
      longitude: 24.94,
    });
    expect(cur!.temperatureC).toBe(18.4);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("current=");
  });

  it("getDailyForecast requests the daily block and normalizes it", async () => {
    const { fetch, calls } = stubFetch([
      [/open-meteo\.com\/v1\/forecast/, openMeteoForecastFixture],
    ]);
    const client = new WeatherWorldClient({ fetch });
    const series = await client.getDailyForecast({
      latitude: 60.17,
      longitude: 24.94,
    });
    expect(series!.days).toHaveLength(3);
    expect(calls[0]).toContain("daily=");
  });

  it("getDailyArchive hits the archive host", async () => {
    const { fetch, calls } = stubFetch([
      [/archive-api\.open-meteo\.com/, openMeteoArchiveFixture],
    ]);
    const client = new WeatherWorldClient({ fetch });
    const series = await client.getDailyArchive({
      latitude: 60.17,
      longitude: 24.94,
      startDate: "2024-07-01",
      endDate: "2024-07-03",
    });
    expect(series!.days[1].temperatureMaxC).toBeNull();
    expect(calls[0]).toContain("archive-api.open-meteo.com");
  });

  it("getWorldIndicator fetches and normalizes a World Bank series", async () => {
    const { fetch } = stubFetch([
      [/api\.worldbank\.org/, worldBankGdpFixture],
    ]);
    const client = new WeatherWorldClient({ fetch });
    const series = await client.getWorldIndicator({
      country: "FI",
      indicator: "NY.GDP.MKTP.CD",
    });
    expect(series.points).toHaveLength(3);
    expect(latestValue(series)!.value).toBe(282510000000);
  });

  it("throws a descriptive error on a non-ok HTTP response", async () => {
    const { fetch } = stubFetch([]); // every URL 404s
    const client = new WeatherWorldClient({ fetch });
    await expect(
      client.getCurrentWeather({ latitude: 0, longitude: 0 }),
    ).rejects.toThrow(/request failed \(404\)/);
  });

  it("surfaces World Bank API errors through the client", async () => {
    const { fetch } = stubFetch([
      [/api\.worldbank\.org/, worldBankErrorFixture],
    ]);
    const client = new WeatherWorldClient({ fetch });
    await expect(
      client.getWorldIndicator({ country: "ZZ", indicator: "BAD.CODE" }),
    ).rejects.toThrow(/world bank API error/i);
  });

  it("defaults to global fetch when none is injected", () => {
    // Constructing must not throw in this fetch-capable runtime; we never call
    // a method here, so no network request is made.
    expect(() => new WeatherWorldClient()).not.toThrow();
  });
});
