import { Decimal } from "decimal.js";

import type { Commitment, CashflowKind } from "./commitment";

/**
 * J-curve pacing series for a private-markets commitment.
 *
 * Walks the dated ledger chronologically and, at each cashflow date, records
 * the running cumulative position an LP sees: cumulative capital called,
 * cumulative distributed, cumulative **net** cashflow (distributions − calls),
 * and — at the point the NAV is reported — the total value (net cashflow + NAV).
 *
 * Plotting cumulative net cashflow over time traces the classic "J": it dives
 * negative early as the fund draws capital, bottoms out, then climbs back above
 * zero as distributions land — the shape that gives the J-curve its name. The
 * total-value line (net + NAV) sits above it and shows the unrealised cushion.
 *
 * Pure, deterministic, exact ({@link Decimal}); READ-ONLY.
 */

/** One point on the J-curve pacing series, keyed by ledger date. */
export interface JCurvePoint {
  /** ISO date of this point (a date on which a cashflow occurred). */
  readonly date: string;
  /** Cumulative capital called up to and including this date. */
  readonly cumulativeCalled: Decimal;
  /** Cumulative distributions received up to and including this date. */
  readonly cumulativeDistributed: Decimal;
  /**
   * Cumulative net cashflow = distributed − called. Negative while the LP is
   * net out-of-pocket, positive once distributions exceed capital paid in.
   */
  readonly cumulativeNet: Decimal;
  /**
   * Total value to the LP at this date = cumulative net cashflow + residual NAV.
   * The NAV is only applied at the NAV's report date and after, so earlier
   * points show pure realised position. Mirrors how a J-curve chart layers the
   * unrealised value on top of the realised line.
   */
  readonly totalValue: Decimal;
}

/** The J-curve pacing series plus its trough (deepest net-negative point). */
export interface JCurve {
  readonly points: readonly JCurvePoint[];
  /**
   * The most negative cumulative-net value across the series (the bottom of the
   * J), as a non-positive {@link Decimal}. Zero when the LP is never net
   * out-of-pocket (no points, or already net-positive throughout).
   */
  readonly trough: Decimal;
  /** ISO date of the {@link trough}, or `null` when there are no points. */
  readonly troughDate: string | null;
  /**
   * ISO date the cumulative-net series first crosses back to ≥ 0 (the fund
   * "breaks even" on cash), or `null` if it never does within the ledger.
   */
  readonly breakevenDate: string | null;
}

const ZERO = new Decimal(0);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True when `date` is a shape-valid AND calendar-real ISO `YYYY-MM-DD`. */
function isRealIsoDate(date: string): boolean {
  if (!ISO_DATE.test(date)) return false;
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

interface PreparedEntry {
  date: string;
  kind: CashflowKind;
  amount: Decimal;
}

/** Chronologically sorted, validated ledger entries (positive magnitudes). */
function sortedEntries(commitment: Commitment): PreparedEntry[] {
  const entries = commitment.ledger.map((e, i) => {
    if (!isRealIsoDate(e.date)) {
      throw new Error(
        `privatemarkets: jcurve ledger date at index ${i} must be a real ISO YYYY-MM-DD date`,
      );
    }
    const amount = e.amount instanceof Decimal ? e.amount : new Decimal(e.amount);
    if (!amount.isFinite() || amount.isNegative()) {
      throw new Error(
        `privatemarkets: jcurve ledger amount at index ${i} must be a non-negative magnitude`,
      );
    }
    return { date: e.date, kind: e.kind, amount };
  });
  entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return entries;
}

/**
 * Build the {@link JCurve} pacing series for a commitment. Each distinct ledger
 * date produces exactly one point carrying the cumulative position *as of* that
 * date (multiple cashflows on the same date collapse into one point).
 */
export function buildJCurve(commitment: Commitment): JCurve {
  const entries = sortedEntries(commitment);
  const nav =
    commitment.nav === undefined
      ? ZERO
      : commitment.nav instanceof Decimal
        ? commitment.nav
        : new Decimal(commitment.nav);
  const navDate =
    commitment.navDate ??
    (entries.length > 0 ? entries[entries.length - 1].date : null);

  interface Bucket {
    date: string;
    called: Decimal;
    distributed: Decimal;
    net: Decimal;
  }
  const buckets: Bucket[] = [];
  let called = ZERO;
  let distributed = ZERO;

  // Group consecutive entries by date so each date yields a single point.
  let i = 0;
  while (i < entries.length) {
    const date = entries[i].date;
    while (i < entries.length && entries[i].date === date) {
      const e = entries[i];
      if (e.kind === "call") {
        called = called.plus(e.amount);
      } else {
        distributed = distributed.plus(e.amount);
      }
      i++;
    }
    buckets.push({ date, called, distributed, net: distributed.minus(called) });
  }

  // The residual NAV layers on top of the cumulative net cashflow from the most
  // recent point at or before the NAV's report date (the unrealised cushion the
  // LP is carrying as of that date). Reported NAV dates often fall *after* the
  // last cashflow, so we attach the NAV to the latest applicable point rather
  // than requiring a point exactly on navDate.
  const navTargetIndex =
    nav.isPositive() && navDate !== null
      ? (() => {
          let idx = -1;
          for (let k = 0; k < buckets.length; k++) {
            if (buckets[k].date <= navDate) idx = k;
          }
          // If navDate precedes every point, fall back to the first point.
          return idx === -1 && buckets.length > 0 ? 0 : idx;
        })()
      : -1;

  const points: JCurvePoint[] = buckets.map((b, idx) => {
    const totalValue =
      idx === navTargetIndex ? b.net.plus(nav) : b.net;
    return {
      date: b.date,
      cumulativeCalled: b.called,
      cumulativeDistributed: b.distributed,
      cumulativeNet: b.net,
      totalValue,
    };
  });

  // Trough = deepest net-negative point.
  let trough = ZERO;
  let troughDate: string | null = points.length > 0 ? points[0].date : null;
  for (const p of points) {
    if (p.cumulativeNet.lessThan(trough)) {
      trough = p.cumulativeNet;
      troughDate = p.date;
    }
  }
  if (trough.isZero()) {
    // Never net-negative: report no meaningful trough date past the first point.
    troughDate = points.length > 0 ? points[0].date : null;
  }

  // Breakeven = first date cumulativeNet crosses back to >= 0 *after* going
  // negative. If it starts non-negative and stays so, the first point is it.
  let breakevenDate: string | null = null;
  let wentNegative = false;
  for (const p of points) {
    if (p.cumulativeNet.isNegative()) {
      wentNegative = true;
    } else if (wentNegative && p.cumulativeNet.greaterThanOrEqualTo(0)) {
      breakevenDate = p.date;
      break;
    }
  }
  // If it never went negative, breakeven is undefined (no J to climb out of).

  return { points, trough, troughDate, breakevenDate };
}
