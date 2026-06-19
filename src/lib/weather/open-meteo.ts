import * as z from "zod";

import {
  GeoPoint,
  IsoDate,
  Latitude,
  Longitude,
  NullableNumber,
} from "./primitives";

/**
 * Open-Meteo adapter (https://open-meteo.com): a keyless, no-auth weather API.
 *
 * This module validates the raw JSON Open-Meteo returns and normalizes it into
 * tidy, typed shapes the rest of the app consumes. It contains *no* network
 * code — see `client.ts` for the (injectable) fetch wrapper — so every function
 * here is pure and fixture-testable offline.
 */

/* ------------------------------------------------------------------ */
/* Raw response schemas (the shape Open-Meteo actually sends)          */
/* ------------------------------------------------------------------ */

/**
 * The `current` block of a forecast response. We only model the fields the app
 * uses; `.loose()` (passthrough) keeps any extra fields Open-Meteo adds without
 * failing validation.
 */
export const OpenMeteoCurrentRaw = z.looseObject({
  time: z.string(),
  interval: z.number().optional(),
  temperature_2m: z.number().optional(),
  relative_humidity_2m: z.number().optional(),
  precipitation: z.number().optional(),
  wind_speed_10m: z.number().optional(),
  weather_code: z.number().optional(),
});
export type OpenMeteoCurrentRaw = z.infer<typeof OpenMeteoCurrentRaw>;

/**
 * The `daily` block: Open-Meteo returns *parallel arrays* (one `time` array and
 * one array per requested variable). We require `time` and accept any of the
 * daily variables we know how to surface.
 */
export const OpenMeteoDailyRaw = z.looseObject({
  time: z.array(z.string()),
  temperature_2m_max: z.array(NullableNumber).optional(),
  temperature_2m_min: z.array(NullableNumber).optional(),
  temperature_2m_mean: z.array(NullableNumber).optional(),
  precipitation_sum: z.array(NullableNumber).optional(),
});
export type OpenMeteoDailyRaw = z.infer<typeof OpenMeteoDailyRaw>;

/** A full forecast/archive response envelope. */
export const OpenMeteoResponseRaw = z.looseObject({
  latitude: z.number(),
  longitude: z.number(),
  timezone: z.string().optional(),
  utc_offset_seconds: z.number().optional(),
  elevation: z.number().optional(),
  current: OpenMeteoCurrentRaw.optional(),
  daily: OpenMeteoDailyRaw.optional(),
});
export type OpenMeteoResponseRaw = z.infer<typeof OpenMeteoResponseRaw>;

/* ------------------------------------------------------------------ */
/* Normalized shapes (what the app consumes)                           */
/* ------------------------------------------------------------------ */

/** A single normalized current-conditions observation. */
export const CurrentWeather = z
  .object({
    point: GeoPoint,
    /** Timezone identifier the timestamps are expressed in, if provided. */
    timezone: z.string().optional(),
    /** Observation timestamp, as returned by Open-Meteo (local to timezone). */
    time: z.string(),
    temperatureC: NullableNumber,
    relativeHumidityPct: NullableNumber,
    precipitationMm: NullableNumber,
    windSpeedKmh: NullableNumber,
    /** WMO weather-interpretation code, if present. */
    weatherCode: NullableNumber,
  })
  .strict();
export type CurrentWeather = z.infer<typeof CurrentWeather>;

/** One day of a normalized daily series. */
export const DailyWeatherPoint = z
  .object({
    date: IsoDate,
    temperatureMaxC: NullableNumber,
    temperatureMinC: NullableNumber,
    temperatureMeanC: NullableNumber,
    precipitationMm: NullableNumber,
  })
  .strict();
export type DailyWeatherPoint = z.infer<typeof DailyWeatherPoint>;

/** A normalized daily series for one location. */
export const DailyWeatherSeries = z
  .object({
    point: GeoPoint,
    timezone: z.string().optional(),
    days: z.array(DailyWeatherPoint),
  })
  .strict();
export type DailyWeatherSeries = z.infer<typeof DailyWeatherSeries>;

/* ------------------------------------------------------------------ */
/* Normalizers                                                         */
/* ------------------------------------------------------------------ */

function nullable(v: number | null | undefined): number | null {
  return v ?? null;
}

/**
 * Normalize a raw Open-Meteo response's `current` block into a
 * {@link CurrentWeather}. Returns `null` if the response carries no `current`.
 *
 * @throws if `raw` is not a valid Open-Meteo response envelope.
 */
export function normalizeCurrent(raw: unknown): CurrentWeather | null {
  const res = OpenMeteoResponseRaw.parse(raw);
  if (!res.current) return null;
  return CurrentWeather.parse({
    point: { latitude: res.latitude, longitude: res.longitude },
    timezone: res.timezone,
    time: res.current.time,
    temperatureC: nullable(res.current.temperature_2m),
    relativeHumidityPct: nullable(res.current.relative_humidity_2m),
    precipitationMm: nullable(res.current.precipitation),
    windSpeedKmh: nullable(res.current.wind_speed_10m),
    weatherCode: nullable(res.current.weather_code),
  });
}

/**
 * Normalize the parallel-array `daily` block into a tidy
 * {@link DailyWeatherSeries} (one object per day). Returns `null` if the
 * response carries no `daily` block.
 *
 * Defends against ragged upstream arrays: if a variable array is shorter than
 * `time`, the missing tail reads as `null` rather than throwing.
 *
 * @throws if `raw` is not a valid Open-Meteo response, or if the variable
 *   arrays are *longer* than `time` (a contract violation we refuse to guess
 *   around).
 */
export function normalizeDaily(raw: unknown): DailyWeatherSeries | null {
  const res = OpenMeteoResponseRaw.parse(raw);
  if (!res.daily) return null;
  const d = res.daily;
  const n = d.time.length;

  const at = (arr: (number | null)[] | undefined, i: number): number | null => {
    if (!arr) return null;
    if (arr.length > n) {
      throw new Error(
        `open-meteo daily variable array (len ${arr.length}) is longer than time array (len ${n})`,
      );
    }
    return arr[i] ?? null;
  };

  const days = d.time.map((date, i) => ({
    date,
    temperatureMaxC: at(d.temperature_2m_max, i),
    temperatureMinC: at(d.temperature_2m_min, i),
    temperatureMeanC: at(d.temperature_2m_mean, i),
    precipitationMm: at(d.precipitation_sum, i),
  }));

  return DailyWeatherSeries.parse({
    point: { latitude: res.latitude, longitude: res.longitude },
    timezone: res.timezone,
    days,
  });
}

/* ------------------------------------------------------------------ */
/* URL builders (pure; used by client.ts)                              */
/* ------------------------------------------------------------------ */

const FORECAST_BASE = "https://api.open-meteo.com/v1/forecast";
const ARCHIVE_BASE = "https://archive-api.open-meteo.com/v1/archive";

const CURRENT_VARS = [
  "temperature_2m",
  "relative_humidity_2m",
  "precipitation",
  "wind_speed_10m",
  "weather_code",
] as const;

const DAILY_VARS = [
  "temperature_2m_max",
  "temperature_2m_min",
  "temperature_2m_mean",
  "precipitation_sum",
] as const;

/** Options for {@link forecastUrl}. */
export const ForecastQuery = z
  .object({
    latitude: Latitude,
    longitude: Longitude,
    /** Include the `current` conditions block (default true). */
    current: z.boolean().default(true),
    /** Include the `daily` block (default false). */
    daily: z.boolean().default(false),
    /** IANA timezone, or "auto" to resolve from the coordinates. */
    timezone: z.string().default("auto"),
    /** Number of forecast days [1, 16]. */
    forecastDays: z.number().int().min(1).max(16).optional(),
  })
  .strict();
export type ForecastQuery = z.input<typeof ForecastQuery>;

/** Build a keyless Open-Meteo forecast URL. */
export function forecastUrl(query: ForecastQuery): string {
  const q = ForecastQuery.parse(query);
  const params = new URLSearchParams({
    latitude: String(q.latitude),
    longitude: String(q.longitude),
    timezone: q.timezone,
  });
  if (q.current) params.set("current", CURRENT_VARS.join(","));
  if (q.daily) params.set("daily", DAILY_VARS.join(","));
  if (q.forecastDays != null) params.set("forecast_days", String(q.forecastDays));
  return `${FORECAST_BASE}?${params.toString()}`;
}

/** Options for {@link archiveUrl}. */
export const ArchiveQuery = z
  .object({
    latitude: Latitude,
    longitude: Longitude,
    startDate: IsoDate,
    endDate: IsoDate,
    timezone: z.string().default("auto"),
  })
  .strict()
  .refine((q) => q.startDate <= q.endDate, {
    message: "startDate must be on or before endDate",
    path: ["startDate"],
  });
export type ArchiveQuery = z.input<typeof ArchiveQuery>;

/** Build a keyless Open-Meteo historical-archive URL (daily aggregates). */
export function archiveUrl(query: ArchiveQuery): string {
  const q = ArchiveQuery.parse(query);
  const params = new URLSearchParams({
    latitude: String(q.latitude),
    longitude: String(q.longitude),
    start_date: q.startDate,
    end_date: q.endDate,
    timezone: q.timezone,
    daily: DAILY_VARS.join(","),
  });
  return `${ARCHIVE_BASE}?${params.toString()}`;
}
