import * as z from "zod";

import { IsoDate } from "../model/primitives";

/**
 * Macro series catalog and domain schemas for the FRED adapter.
 *
 * READ-ONLY product: this adapter only *reads* public macroeconomic series
 * (interest rates, inflation) from FRED. It never moves money or places a
 * trade. Everything here describes and validates observed data.
 */

/**
 * The macro series this adapter knows how to fetch, keyed by a stable internal
 * id. Each maps to a FRED series id and carries enough metadata to label and
 * interpret the values without a second network call.
 */
export const MACRO_SERIES = {
  /** 10-Year Treasury Constant Maturity Rate (daily, percent per annum). */
  dgs10: {
    fredId: "DGS10",
    name: "10-Year Treasury Constant Maturity Rate",
    unit: "percent",
    frequency: "daily",
  },
  /** Consumer Price Index for All Urban Consumers: All Items (monthly index). */
  cpi: {
    fredId: "CPIAUCSL",
    name: "Consumer Price Index for All Urban Consumers: All Items",
    unit: "index_1982_1984_100",
    frequency: "monthly",
  },
} as const;

/** Internal series keys understood by the adapter (e.g. `"dgs10"`, `"cpi"`). */
export const MACRO_SERIES_KEYS = Object.keys(
  MACRO_SERIES,
) as MacroSeriesKey[];

export type MacroSeriesKey = keyof typeof MACRO_SERIES;

/** Units a macro series can be reported in. */
export const MACRO_UNITS = ["percent", "index_1982_1984_100"] as const;
export const MacroUnit = z.enum(MACRO_UNITS);
export type MacroUnit = z.infer<typeof MacroUnit>;

/** How often a series is observed. */
export const MACRO_FREQUENCIES = ["daily", "monthly"] as const;
export const MacroFrequency = z.enum(MACRO_FREQUENCIES);
export type MacroFrequency = z.infer<typeof MacroFrequency>;

/**
 * A single observed data point: an ISO date and an exact numeric value stored
 * as a string to avoid floating-point drift (see AGENTS.md). FRED encodes
 * missing values as `"."`; those are dropped before reaching this schema.
 */
export const MacroObservation = z
  .object({
    date: IsoDate,
    /** Exact value as a decimal string (e.g. `"4.27"`, `"310.326"`). */
    value: z
      .string()
      .trim()
      .regex(/^-?\d+(\.\d+)?$/, "must be a decimal number string"),
  })
  .strict();
export type MacroObservation = z.infer<typeof MacroObservation>;

/**
 * A fully-parsed macro time series: catalog metadata plus chronologically
 * ordered observations (oldest → newest, no missing points).
 */
export const MacroSeries = z
  .object({
    key: z.enum(
      MACRO_SERIES_KEYS as [MacroSeriesKey, ...MacroSeriesKey[]],
    ),
    fredId: z.string().trim().min(1),
    name: z.string().trim().min(1),
    unit: MacroUnit,
    frequency: MacroFrequency,
    observations: z.array(MacroObservation),
  })
  .strict()
  .superRefine((series, ctx) => {
    // Observations must be strictly ascending by date (no dupes, sorted).
    for (let i = 1; i < series.observations.length; i++) {
      if (series.observations[i].date <= series.observations[i - 1].date) {
        ctx.addIssue({
          code: "custom",
          message: `observations must be strictly ascending by date; ${series.observations[i].date} follows ${series.observations[i - 1].date}`,
          path: ["observations", i, "date"],
        });
      }
    }
  });
export type MacroSeries = z.infer<typeof MacroSeries>;

/** The most recent observation in a series, or `undefined` if it is empty. */
export function latestObservation(
  series: MacroSeries,
): MacroObservation | undefined {
  return series.observations.at(-1);
}
