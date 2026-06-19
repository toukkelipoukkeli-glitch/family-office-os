/**
 * Deterministic, offline fixtures for the FRED macro adapter.
 *
 * These mirror the raw JSON shape FRED's `series/observations` endpoint
 * returns (including the `"."` sentinel for missing values and the `realtime_*`
 * fields we ignore). They let the adapter and its parser be tested fully
 * offline — no live API calls — per AGENTS.md.
 *
 * Values here are illustrative samples in the right shape; they are NOT live
 * market data. Tests assert on structure and transforms, not on real-world
 * figures.
 */

/** Raw FRED response for DGS10 (10-Year Treasury, daily, percent). */
export const fredDgs10Raw = {
  realtime_start: "2026-06-19",
  realtime_end: "2026-06-19",
  observation_start: "2026-06-01",
  observation_end: "2026-06-12",
  units: "lin",
  output_type: 1,
  file_type: "json",
  order_by: "observation_date",
  sort_order: "asc",
  count: 9,
  offset: 0,
  limit: 100000,
  observations: [
    { realtime_start: "2026-06-19", realtime_end: "2026-06-19", date: "2026-06-01", value: "4.31" },
    { realtime_start: "2026-06-19", realtime_end: "2026-06-19", date: "2026-06-02", value: "4.29" },
    { realtime_start: "2026-06-19", realtime_end: "2026-06-19", date: "2026-06-03", value: "4.34" },
    // Weekend / holiday: FRED reports a missing value as ".".
    { realtime_start: "2026-06-19", realtime_end: "2026-06-19", date: "2026-06-06", value: "." },
    { realtime_start: "2026-06-19", realtime_end: "2026-06-19", date: "2026-06-07", value: "." },
    { realtime_start: "2026-06-19", realtime_end: "2026-06-19", date: "2026-06-08", value: "4.30" },
    { realtime_start: "2026-06-19", realtime_end: "2026-06-19", date: "2026-06-09", value: "4.27" },
    { realtime_start: "2026-06-19", realtime_end: "2026-06-19", date: "2026-06-10", value: "4.25" },
    { realtime_start: "2026-06-19", realtime_end: "2026-06-19", date: "2026-06-12", value: "4.28" },
  ],
} as const;

/**
 * Raw FRED response for CPIAUCSL (CPI, monthly index). Intentionally provided
 * out of date order to exercise the adapter's ascending sort, and spanning 13
 * months so a year-over-year change can be computed.
 */
export const fredCpiRaw = {
  realtime_start: "2026-06-19",
  realtime_end: "2026-06-19",
  units: "lin",
  output_type: 1,
  file_type: "json",
  order_by: "observation_date",
  sort_order: "asc",
  count: 13,
  observations: [
    { date: "2025-12-01", value: "316.605" },
    { date: "2025-06-01", value: "311.097" },
    { date: "2025-07-01", value: "311.842" },
    { date: "2025-05-01", value: "310.326" },
    { date: "2025-08-01", value: "312.560" },
    { date: "2025-09-01", value: "313.401" },
    { date: "2025-10-01", value: "314.120" },
    { date: "2025-11-01", value: "315.498" },
    { date: "2026-01-01", value: "317.488" },
    { date: "2026-02-01", value: "318.211" },
    { date: "2026-03-01", value: "319.004" },
    { date: "2026-04-01", value: "319.799" },
    { date: "2026-05-01", value: "320.601" },
  ],
} as const;

/** A FRED error-shaped payload (used to test non-2xx handling in the client). */
export const fredErrorRaw = {
  error_code: 400,
  error_message:
    "Bad Request. The value for variable api_key is not registered.",
} as const;
