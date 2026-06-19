import { Decimal } from "decimal.js";

import {
  allocationByAssetClass,
  type AllocationBreakdown,
  type FxRateTable,
  holdingValue,
} from "@/lib/allocation";
import { Money, sumMoney } from "@/lib/money";
import type { AssetClass } from "@/lib/model/asset-class";
import type { Portfolio } from "@/lib/model/portfolio";
import { timeWeightedReturn, type ValuationPoint } from "@/lib/returns";

/**
 * Net-worth-over-time derivations for the dashboard.
 *
 * Builds a deterministic, offline net-worth history for a {@link Portfolio}:
 * a consolidated total net-worth series plus a per-asset-class series for the
 * drill-down view. The *current* (final) point of every series is the holding's
 * real latest valuation rolled up via {@link allocationByAssetClass}; the
 * earlier points are produced by a fixed, seeded back-projection so the history
 * is reproducible without any live price feed.
 *
 * READ-ONLY product: every function here only *reports* what a portfolio is and
 * was worth; nothing moves money or places a trade. The back-projection is an
 * illustrative reconstruction, clearly derived from a deterministic model — it
 * is never presented as, and never used to drive, a transaction.
 */

/** One monthly observation of net worth, in the portfolio base currency. */
export interface NetWorthPoint {
  /** End-of-month date label, `YYYY-MM-DD`. */
  date: string;
  /** Net worth at this point, in the base currency. */
  value: Money;
}

/** A net-worth time series for the whole book or a single asset class. */
export interface NetWorthSeries {
  /** Ordered points, oldest first; the last point is the current value. */
  points: NetWorthPoint[];
  baseCurrency: string;
}

/** A single drill-down row: one asset class with its share and history. */
export interface AssetClassDetail {
  assetClass: AssetClass;
  /** Current base-currency value of the class. */
  value: Money;
  /** Share of the current portfolio total, in [0, 1]. */
  weight: Decimal;
  /** Number of holdings in this class that carry a value. */
  holdingCount: number;
  /** Per-class net-worth history (same length / dates as the total series). */
  series: NetWorthSeries;
}

/** The full dashboard model: a total series plus per-class drill-down rows. */
export interface NetWorthDashboardModel {
  baseCurrency: string;
  /** The consolidated net-worth-over-time series. */
  total: NetWorthSeries;
  /** Current consolidated net worth (== last point of {@link total}). */
  current: Money;
  /** Net worth at the start of the window (== first point of {@link total}). */
  opening: Money;
  /** Cumulative time-weighted return across the window (e.g. 0.18 = +18%). */
  totalReturn: Decimal;
  /** Drill-down rows, sorted by descending current value. */
  byAssetClass: AssetClassDetail[];
  /** The asset-class allocation breakdown the rows are derived from. */
  allocation: AllocationBreakdown<AssetClass>;
}

/**
 * Per-asset-class, deterministic monthly growth factors used to back-project a
 * plausible history from each class's *current* value. These are fixed model
 * inputs (not live data): a class with factor `f` is modelled as having grown by
 * `f` each month over the window, so the value `k` months before the final point
 * is `current / f^k`. Liquid/volatile classes carry more historical swing than
 * appraisal-valued collectibles. Classes without an explicit factor use
 * {@link DEFAULT_MONTHLY_GROWTH}.
 */
const MONTHLY_GROWTH: Partial<Record<AssetClass, string>> = {
  equity: "1.0115",
  etf: "1.0100",
  crypto: "1.0260",
  bond: "1.0025",
  cash: "1.0010",
  pe: "1.0150",
  forest: "1.0040",
  vineyard: "1.0035",
  wine: "1.0050",
  art: "1.0030",
  car: "1.0060",
  watch: "1.0045",
  lego: "1.0070",
};

const DEFAULT_MONTHLY_GROWTH = "1.0050";

/** Number of monthly points in the default history window (inclusive). */
export const DEFAULT_WINDOW_MONTHS = 24;

/** Resolve the monthly growth factor for an asset class. */
function monthlyGrowth(assetClass: AssetClass): Decimal {
  return new Decimal(MONTHLY_GROWTH[assetClass] ?? DEFAULT_MONTHLY_GROWTH);
}

/**
 * The end-of-month date label `monthsBack` months before the anchor month.
 * Anchored to a fixed reference month so the series is fully deterministic and
 * never depends on the wall clock.
 */
function monthLabel(anchor: { year: number; month: number }, monthsBack: number): string {
  // month is 1-based.
  const zero = anchor.year * 12 + (anchor.month - 1) - monthsBack;
  const year = Math.floor(zero / 12);
  const month = (zero % 12) + 1;
  // Use the 1st of the month at UTC midnight as a stable end-of-period label.
  const mm = String(month).padStart(2, "0");
  return `${year}-${mm}-01`;
}

/** Default anchor: the seeded portfolio's "as of" month (June 2026). */
const DEFAULT_ANCHOR = { year: 2026, month: 6 } as const;

export interface NetWorthOptions {
  /** Number of monthly points to project (>= 2). Default {@link DEFAULT_WINDOW_MONTHS}. */
  windowMonths?: number;
  /** Anchor (final) month for the series. Default June 2026. */
  anchor?: { year: number; month: number };
}

/**
 * Back-project a deterministic monthly net-worth series for a single current
 * value and growth factor. The final point equals `current`; each earlier point
 * divides by the monthly growth factor. Values are rounded to the currency's
 * minor unit so the series is stable and display-ready.
 */
function projectSeries(
  current: Money,
  growth: Decimal,
  windowMonths: number,
  anchor: { year: number; month: number },
): NetWorthSeries {
  const points: NetWorthPoint[] = [];
  for (let i = windowMonths - 1; i >= 0; i--) {
    // i = windowMonths-1 is the oldest point, i = 0 is the current point.
    const value = Money.of(
      current.amount.div(growth.pow(i)),
      current.currency,
    ).round();
    points.push({ date: monthLabel(anchor, i), value });
  }
  return { points, baseCurrency: current.currency };
}

/**
 * Build the full net-worth dashboard model for a portfolio.
 *
 * The current allocation is computed from real latest valuations via
 * {@link allocationByAssetClass} using the supplied FX table; each asset class
 * then gets a deterministic back-projected history. The consolidated total
 * series is the point-wise sum of the per-class series, so the drill-down always
 * reconciles to the total. The window's cumulative return is the
 * {@link timeWeightedReturn} of the total series (cashflow-free projection, so
 * TWR here is simply the total growth of the consolidated value).
 */
export function buildNetWorthDashboard(
  portfolio: Portfolio,
  fxTable: FxRateTable,
  options: NetWorthOptions = {},
): NetWorthDashboardModel {
  const windowMonths = Math.max(2, options.windowMonths ?? DEFAULT_WINDOW_MONTHS);
  const anchor = options.anchor ?? DEFAULT_ANCHOR;
  if (
    !Number.isInteger(anchor.month) ||
    anchor.month < 1 ||
    anchor.month > 12 ||
    !Number.isInteger(anchor.year)
  ) {
    throw new Error(
      "networth: anchor must have an integer year and an integer month in [1, 12]",
    );
  }
  const allocation = allocationByAssetClass(portfolio, fxTable);
  const base = allocation.baseCurrency;

  // Count valued holdings per class for the drill-down detail. A holding counts
  // when it carries a current valuation; `allocationByAssetClass` above has
  // already validated that every such holding's currency is convertible, so the
  // counts always reconcile to the allocation slices.
  const holdingCounts = new Map<AssetClass, number>();
  for (const holding of portfolio.holdings) {
    if (holdingValue(holding) === undefined) continue;
    holdingCounts.set(
      holding.assetClass,
      (holdingCounts.get(holding.assetClass) ?? 0) + 1,
    );
  }

  const byAssetClass: AssetClassDetail[] = allocation.slices.map((slice) => ({
    assetClass: slice.key,
    value: slice.value,
    weight: slice.weight,
    holdingCount: holdingCounts.get(slice.key) ?? 0,
    series: projectSeries(
      slice.value,
      monthlyGrowth(slice.key),
      windowMonths,
      anchor,
    ),
  }));

  // Consolidated total = point-wise sum of the per-class series. Every series
  // shares the same dates and length, so the sum is well-defined.
  const totalPoints: NetWorthPoint[] = [];
  for (let i = 0; i < windowMonths; i++) {
    const values = byAssetClass.map((d) => d.series.points[i].value);
    const value = sumMoney(values, base);
    const date = byAssetClass[0]?.series.points[i].date ?? monthLabel(anchor, windowMonths - 1 - i);
    totalPoints.push({ date, value });
  }
  const total: NetWorthSeries = { points: totalPoints, baseCurrency: base };

  const opening = totalPoints[0]?.value ?? Money.zero(base);
  const current = totalPoints[totalPoints.length - 1]?.value ?? allocation.total;

  const valuationPoints: ValuationPoint[] = totalPoints.map((p) => ({
    date: p.date,
    value: p.value.amount,
  }));
  // With a strictly positive opening value the TWR is well-defined; guard the
  // degenerate empty/zero-open case to a flat 0% rather than throwing.
  const totalReturn =
    valuationPoints.length >= 2 && !opening.isZero()
      ? timeWeightedReturn(valuationPoints).twr
      : new Decimal(0);

  return {
    baseCurrency: base,
    total,
    current,
    opening,
    totalReturn,
    byAssetClass,
    allocation,
  };
}
