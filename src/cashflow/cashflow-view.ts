/**
 * Presentation-layer view model for the cashflow / liquidity-runway page.
 *
 * Pure functions that turn a {@link CashflowForecast} into the exact shapes the
 * page renders — KPI strings, the runway chart geometry, and the per-period
 * flow rows — so the page component stays declarative and the formatting is
 * unit-testable in isolation (the oracle for the visual layer).
 */

import {
  FLOW_KINDS,
  type CashflowForecast,
  type FlowKind,
  balanceTrajectory,
  periodLabel,
} from "@/lib/cashflow";

/** Compact currency, e.g. `$8.0M`. */
export function compactCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

/** Signed compact currency, e.g. `-$1.2M` / `+$0.9M`. */
export function signedCompactCurrency(value: number, currency: string): string {
  const sign = value < 0 ? "-" : "+";
  return `${sign}${compactCurrency(Math.abs(value), currency)}`;
}

/** The runway expressed as a human phrase, e.g. "12+ months" or "4 months". */
export function runwayPhrase(forecast: CashflowForecast): string {
  const n = forecast.runwayPeriods;
  if (!forecast.runwayExhausted) {
    return `${forecast.periods}+ months`;
  }
  return n === 1 ? "1 month" : `${n} months`;
}

export interface RunwayKpis {
  openingCash: string;
  endingCash: string;
  endingTone: "up" | "down";
  netChange: string;
  netTone: "up" | "down";
  runway: string;
  runwayTone: "up" | "down";
  lowestBalance: string;
  lowestTone: "up" | "down";
  lowestPeriodLabel: string;
}

/** Build the four headline KPIs for the page header. */
export function runwayKpis(forecast: CashflowForecast): RunwayKpis {
  const cur = forecast.baseCurrency;
  const ending = forecast.endingCash.amount.toNumber();
  const net = forecast.netChange.amount.toNumber();
  const lowest = forecast.lowestBalance.amount.toNumber();
  return {
    openingCash: compactCurrency(forecast.openingCash.amount.toNumber(), cur),
    endingCash: compactCurrency(ending, cur),
    endingTone: ending < 0 ? "down" : "up",
    netChange: signedCompactCurrency(net, cur),
    netTone: net < 0 ? "down" : "up",
    runway: runwayPhrase(forecast),
    runwayTone: forecast.runwayExhausted ? "down" : "up",
    lowestBalance: compactCurrency(lowest, cur),
    lowestTone: lowest < 0 ? "down" : "up",
    lowestPeriodLabel: periodLabel(forecast.lowestBalancePeriod),
  };
}

/** A single labelled point on the runway balance path. */
export interface RunwayPoint {
  /** -1 for the opening point, then 0..periods-1 for each period close. */
  period: number;
  label: string;
  /** Balance in base-currency major units. */
  value: number;
  /** True when this point's balance is below zero. */
  negative: boolean;
}

/**
 * The full balance trajectory as labelled points: the opening cash (labelled
 * "Now") followed by each period's closing balance.
 */
export function runwayPoints(forecast: CashflowForecast): RunwayPoint[] {
  const values = balanceTrajectory(forecast);
  return values.map((value, i) => ({
    period: i - 1,
    label: i === 0 ? "Now" : periodLabel(i - 1),
    value,
    negative: value < 0,
  }));
}

/** One row of the per-period flow table. */
export interface FlowRow {
  period: number;
  label: string;
  opening: number;
  /** Signed amount per kind, keyed by {@link FlowKind}. */
  byKind: Record<FlowKind, number>;
  inflow: number;
  outflow: number;
  net: number;
  closing: number;
  /** True once the closing balance is at/below zero — highlight as breached. */
  breached: boolean;
}

/** Build the per-period flow rows for the table. */
export function flowRows(forecast: CashflowForecast): FlowRow[] {
  return forecast.series.map((s) => {
    const byKind = {} as Record<FlowKind, number>;
    for (const k of FLOW_KINDS) {
      const found = s.byKind.find((b) => b.kind === k);
      // `+ 0` normalizes a negated zero magnitude (-0) to +0.
      byKind[k] = (found ? found.signed.amount.toNumber() : 0) + 0;
    }
    return {
      period: s.period,
      label: periodLabel(s.period),
      opening: s.opening.amount.toNumber(),
      byKind,
      inflow: s.inflow.amount.toNumber(),
      outflow: s.outflow.amount.toNumber(),
      net: s.net.amount.toNumber(),
      closing: s.closing.amount.toNumber(),
      breached: s.closing.amount.toNumber() < 0,
    };
  });
}
