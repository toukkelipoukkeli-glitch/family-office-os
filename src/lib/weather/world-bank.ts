import * as z from "zod";

import { CountryCode, NullableNumber } from "./primitives";

/**
 * World Bank Indicators API adapter (https://api.worldbank.org/v2): keyless,
 * no-auth world-development data (GDP, population, inflation, ...).
 *
 * The API has an unusual envelope: a successful response is a 2-tuple
 * `[pagination, rows]`. This module validates that envelope and normalizes the
 * rows into a tidy, sorted time series. No network code lives here — see
 * `client.ts`.
 */

/* ------------------------------------------------------------------ */
/* Raw response schemas                                                */
/* ------------------------------------------------------------------ */

/** First element of the response tuple: pagination metadata. */
export const WorldBankPaginationRaw = z.looseObject({
  page: z.number(),
  pages: z.number(),
  per_page: z.union([z.number(), z.string()]),
  total: z.number(),
});
export type WorldBankPaginationRaw = z.infer<typeof WorldBankPaginationRaw>;

/** A `{ id, value }` reference (used for `indicator` and `country`). */
export const WorldBankRefRaw = z.looseObject({
  id: z.string(),
  value: z.string().nullable(),
});
export type WorldBankRefRaw = z.infer<typeof WorldBankRefRaw>;

/** A single observation row. `value` is `null` when the datum is missing. */
export const WorldBankRowRaw = z.looseObject({
  indicator: WorldBankRefRaw,
  country: WorldBankRefRaw,
  countryiso3code: z.string().optional(),
  date: z.string(),
  value: NullableNumber,
});
export type WorldBankRowRaw = z.infer<typeof WorldBankRowRaw>;

/**
 * The full successful envelope: `[pagination, rows]`. The Bank can also return
 * `[messageObject]` on error (e.g. a bad indicator); {@link normalizeSeries}
 * detects that and throws a descriptive error.
 */
export const WorldBankResponseRaw = z.tuple([
  WorldBankPaginationRaw,
  z.array(WorldBankRowRaw).nullable(),
]);
export type WorldBankResponseRaw = z.infer<typeof WorldBankResponseRaw>;

/** The error envelope shape the Bank returns instead of data on some failures. */
const WorldBankErrorEnvelope = z.tuple([
  z.object({
    message: z.array(
      z.looseObject({ id: z.string().optional(), key: z.string().optional(), value: z.string() }),
    ),
  }),
]);

/* ------------------------------------------------------------------ */
/* Normalized shapes                                                   */
/* ------------------------------------------------------------------ */

/** One observation in a normalized world-data series. */
export const WorldDataPoint = z
  .object({
    /** Period label as returned (usually a 4-digit year, e.g. "2022"). */
    period: z.string(),
    /** The period parsed as an integer year when it is a plain year. */
    year: z.number().int().nullable(),
    value: NullableNumber,
  })
  .strict();
export type WorldDataPoint = z.infer<typeof WorldDataPoint>;

/** A normalized, chronologically sorted indicator series for one country. */
export const WorldDataSeries = z
  .object({
    indicatorId: z.string(),
    indicatorName: z.string().nullable(),
    country: CountryCode,
    countryName: z.string().nullable(),
    /** Ascending by period (oldest first). */
    points: z.array(WorldDataPoint),
  })
  .strict();
export type WorldDataSeries = z.infer<typeof WorldDataSeries>;

/* ------------------------------------------------------------------ */
/* Normalizer                                                          */
/* ------------------------------------------------------------------ */

function parseYear(period: string): number | null {
  return /^\d{4}$/.test(period) ? Number(period) : null;
}

/**
 * Normalize a raw World Bank response into a {@link WorldDataSeries}, sorted
 * ascending by period. An empty data array yields a series with no points (a
 * valid, queryable outcome — e.g. an indicator with no data for that country).
 *
 * @throws if `raw` is the World Bank *error* envelope (surfacing the message),
 *   or if it does not match the expected response shape at all.
 */
export function normalizeSeries(raw: unknown): WorldDataSeries {
  const asError = WorldBankErrorEnvelope.safeParse(raw);
  if (asError.success) {
    const msg = asError.data[0].message.map((m) => m.value).join("; ");
    throw new Error(`world bank API error: ${msg}`);
  }

  const [, rows] = WorldBankResponseRaw.parse(raw);
  const data = rows ?? [];

  const points = data
    .map((r) => ({
      period: r.date,
      year: parseYear(r.date),
      value: r.value,
    }))
    .sort((a, b) => a.period.localeCompare(b.period));

  // Indicator/country identity comes from the rows; fall back gracefully when
  // the data array is empty.
  const first = data[0];
  return WorldDataSeries.parse({
    indicatorId: first?.indicator.id ?? "",
    indicatorName: first?.indicator.value ?? null,
    country: first?.countryiso3code || first?.country.id || "WLD",
    countryName: first?.country.value ?? null,
    points,
  });
}

/**
 * Return the most recent non-null observation in a normalized series, or `null`
 * if the series has no usable value. Useful for "latest GDP / population /
 * inflation" tiles.
 */
export function latestValue(series: WorldDataSeries): WorldDataPoint | null {
  for (let i = series.points.length - 1; i >= 0; i--) {
    const p = series.points[i];
    if (p.value !== null) return p;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* URL builder                                                         */
/* ------------------------------------------------------------------ */

const WORLD_BANK_BASE = "https://api.worldbank.org/v2";

/** Options for {@link indicatorUrl}. */
export const IndicatorQuery = z
  .object({
    country: CountryCode,
    /** World Bank indicator code, e.g. "NY.GDP.MKTP.CD". */
    indicator: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9._-]+$/, "indicator must be a World Bank indicator code"),
    /** Inclusive year range "YYYY:YYYY", e.g. "2010:2022". */
    dateRange: z
      .string()
      .trim()
      .regex(/^\d{4}:\d{4}$/, "dateRange must be 'YYYY:YYYY'")
      .optional(),
    /** Page size [1, 1000]. */
    perPage: z.number().int().min(1).max(1000).default(100),
  })
  .strict();
export type IndicatorQuery = z.input<typeof IndicatorQuery>;

/** Build a keyless World Bank indicator URL returning JSON. */
export function indicatorUrl(query: IndicatorQuery): string {
  const q = IndicatorQuery.parse(query);
  const params = new URLSearchParams({
    format: "json",
    per_page: String(q.perPage),
  });
  if (q.dateRange) params.set("date", q.dateRange);
  return `${WORLD_BANK_BASE}/country/${q.country}/indicator/${q.indicator}?${params.toString()}`;
}
