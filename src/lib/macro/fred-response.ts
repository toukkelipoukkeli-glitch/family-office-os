import * as z from "zod";

import {
  MACRO_SERIES,
  MacroObservation,
  MacroSeries,
  type MacroSeriesKey,
} from "./series";

/**
 * Schemas mirroring the raw FRED `series/observations` JSON response, plus the
 * transform from that wire shape into our domain {@link MacroSeries}.
 *
 * FRED returns observations with `value` as a string, using the sentinel
 * `"."` for a missing data point. We validate the envelope, drop missing
 * points, sort ascending, and re-validate as a domain series.
 */

/** A single raw observation row as FRED returns it. */
export const FredObservation = z
  .object({
    date: z.string(),
    value: z.string(),
    // FRED includes realtime fields; we accept and ignore them.
    realtime_start: z.string().optional(),
    realtime_end: z.string().optional(),
  })
  .loose();
export type FredObservation = z.infer<typeof FredObservation>;

/** The FRED `series/observations` response envelope (fields we rely on). */
export const FredObservationsResponse = z
  .object({
    observations: z.array(FredObservation),
  })
  .loose();
export type FredObservationsResponse = z.infer<typeof FredObservationsResponse>;

/** FRED's sentinel for a missing observation value. */
export const FRED_MISSING_VALUE = ".";

/**
 * Parse a raw FRED `series/observations` JSON payload into a validated,
 * chronologically-ordered {@link MacroSeries} for the given internal key.
 *
 * Missing values (`"."`) are dropped. Observations are sorted ascending by
 * date. The result is re-validated through {@link MacroSeries}, so any
 * malformed date or non-numeric value surfaces as a Zod error.
 */
export function parseFredObservations(
  key: MacroSeriesKey,
  raw: unknown,
): MacroSeries {
  const meta = MACRO_SERIES[key];
  const parsed = FredObservationsResponse.parse(raw);

  const observations: MacroObservation[] = parsed.observations
    .filter((o) => o.value.trim() !== FRED_MISSING_VALUE)
    .map((o) => ({ date: o.date.trim(), value: o.value.trim() }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return MacroSeries.parse({
    key,
    fredId: meta.fredId,
    name: meta.name,
    unit: meta.unit,
    frequency: meta.frequency,
    observations,
  });
}
