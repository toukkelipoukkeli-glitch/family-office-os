/**
 * Captured, offline fixtures for the weather/world adapters.
 *
 * These mirror the real JSON shapes returned by Open-Meteo and the World Bank
 * (trimmed to representative sizes). Tests assert the adapters against these
 * fixtures so the suite is deterministic and never touches the network
 * (AGENTS.md: "Data adapters are tested against fixtures, never live APIs").
 *
 * Location used throughout: Helsinki, Finland (60.1699, 24.9384) — the family
 * office's home base, and the coupling point for the forest-valuation unit.
 */

/* ------------------------------------------------------------------ */
/* Open-Meteo: current + daily forecast                                */
/* ------------------------------------------------------------------ */

/** A forecast response containing both `current` and a 3-day `daily` block. */
export const openMeteoForecastFixture = {
  latitude: 60.16,
  longitude: 24.94,
  generationtime_ms: 0.123,
  utc_offset_seconds: 10800,
  timezone: "Europe/Helsinki",
  timezone_abbreviation: "EEST",
  elevation: 7.0,
  current_units: {
    time: "iso8601",
    interval: "seconds",
    temperature_2m: "°C",
    relative_humidity_2m: "%",
    precipitation: "mm",
    wind_speed_10m: "km/h",
    weather_code: "wmo code",
  },
  current: {
    time: "2026-06-19T12:00",
    interval: 900,
    temperature_2m: 18.4,
    relative_humidity_2m: 61,
    precipitation: 0,
    wind_speed_10m: 12.3,
    weather_code: 3,
  },
  daily_units: {
    time: "iso8601",
    temperature_2m_max: "°C",
    temperature_2m_min: "°C",
    temperature_2m_mean: "°C",
    precipitation_sum: "mm",
  },
  daily: {
    time: ["2026-06-19", "2026-06-20", "2026-06-21"],
    temperature_2m_max: [19.8, 21.2, 17.5],
    temperature_2m_min: [11.1, 12.4, 10.0],
    temperature_2m_mean: [15.4, 16.9, 13.7],
    precipitation_sum: [0.0, 2.3, 5.1],
  },
} as const;

/**
 * A historical-archive response: daily aggregates with a `null` gap in the
 * record (Open-Meteo uses `null` for missing observations).
 */
export const openMeteoArchiveFixture = {
  latitude: 60.16,
  longitude: 24.94,
  generationtime_ms: 0.2,
  utc_offset_seconds: 10800,
  timezone: "Europe/Helsinki",
  timezone_abbreviation: "EEST",
  elevation: 7.0,
  daily_units: {
    time: "iso8601",
    temperature_2m_max: "°C",
    temperature_2m_min: "°C",
    temperature_2m_mean: "°C",
    precipitation_sum: "mm",
  },
  daily: {
    time: ["2024-07-01", "2024-07-02", "2024-07-03"],
    temperature_2m_max: [24.1, null, 22.8],
    temperature_2m_min: [14.0, null, 13.2],
    temperature_2m_mean: [19.0, null, 18.1],
    precipitation_sum: [0.0, null, 3.4],
  },
} as const;

/* ------------------------------------------------------------------ */
/* World Bank: indicator series                                        */
/* ------------------------------------------------------------------ */

/**
 * GDP (current US$) for Finland, 2020–2022. Shape: `[pagination, rows]`, where
 * the Bank returns rows newest-first (the adapter sorts them ascending).
 */
export const worldBankGdpFixture = [
  {
    page: 1,
    pages: 1,
    per_page: 50,
    total: 3,
    sourceid: "2",
    lastupdated: "2024-12-16",
  },
  [
    {
      indicator: { id: "NY.GDP.MKTP.CD", value: "GDP (current US$)" },
      country: { id: "FI", value: "Finland" },
      countryiso3code: "FIN",
      date: "2022",
      value: 282510000000,
      unit: "",
      obs_status: "",
      decimal: 0,
    },
    {
      indicator: { id: "NY.GDP.MKTP.CD", value: "GDP (current US$)" },
      country: { id: "FI", value: "Finland" },
      countryiso3code: "FIN",
      date: "2021",
      value: 297301000000,
      unit: "",
      obs_status: "",
      decimal: 0,
    },
    {
      indicator: { id: "NY.GDP.MKTP.CD", value: "GDP (current US$)" },
      country: { id: "FI", value: "Finland" },
      countryiso3code: "FIN",
      date: "2020",
      value: null,
      unit: "",
      obs_status: "",
      decimal: 0,
    },
  ],
] as const;

/**
 * A World Bank *error* envelope (e.g. a bad indicator code). The adapter must
 * surface this rather than mis-parsing it as data.
 */
export const worldBankErrorFixture = [
  {
    message: [
      {
        id: "120",
        key: "Invalid value",
        value: "The provided parameter value is not valid",
      },
    ],
  },
] as const;

/** A valid response whose data array is empty (no data for the query). */
export const worldBankEmptyFixture = [
  { page: 1, pages: 0, per_page: 50, total: 0 },
  null,
] as const;
