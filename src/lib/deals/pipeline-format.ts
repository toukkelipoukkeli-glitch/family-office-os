/**
 * Display formatters for the pipeline board. Kept deterministic (fixed locale)
 * so the rendered output is stable across machines and snapshot-testable.
 */

import { Money } from "../money";

/** Format a {@link Money} as a compact currency string in a fixed locale. */
export function formatMoney(money: Money): string {
  return money.format({ locale: "en-US", fractionDigits: 0 });
}

/** Format a fraction in [0, 1] as a whole-number percentage, e.g. 0.55 -> "55%". */
export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

/** Format a win-rate that may be `null` (no decided deals yet). */
export function formatWinRate(winRate: number | null): string {
  return winRate === null ? "—" : formatPercent(winRate);
}
