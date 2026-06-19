import Decimal from "decimal.js";

import { type MacroSeries } from "./series";

/**
 * Pure, deterministic analysis helpers over a parsed {@link MacroSeries}.
 *
 * All arithmetic uses decimal.js to avoid floating-point currency/index drift
 * (see AGENTS.md). These helpers never fetch anything — feed them an already
 * fetched/fixture series.
 */

/**
 * Year-over-year percentage change of a CPI (or any monthly index) series,
 * computed from the two most recent observations exactly 12 months apart.
 *
 * Returns the change as a percent (e.g. `3.2` for +3.2%) rounded to the given
 * number of decimal places, or `undefined` when there is no observation 12
 * months before the latest one.
 */
export function yearOverYearChange(
  series: MacroSeries,
  decimals = 2,
): string | undefined {
  const obs = series.observations;
  if (obs.length === 0) return undefined;
  const latest = obs[obs.length - 1];

  const targetMonth = shiftMonths(latest.date, -12);
  const prior = obs.find((o) => o.date.slice(0, 7) === targetMonth.slice(0, 7));
  if (!prior) return undefined;

  const prev = new Decimal(prior.value);
  if (prev.isZero()) return undefined;
  const cur = new Decimal(latest.value);

  return cur
    .minus(prev)
    .dividedBy(prev)
    .times(100)
    .toDecimalPlaces(decimals)
    .toString();
}

/** Shift a YYYY-MM-DD date by a whole number of months (UTC, day clamped). */
function shiftMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1 + months, 1));
  const year = base.getUTCFullYear();
  const month = base.getUTCMonth(); // 0-based
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(d, daysInMonth);
  const mm = String(month + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}
