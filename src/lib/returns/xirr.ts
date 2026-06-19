import { Decimal } from "decimal.js";

/**
 * XIRR — internal rate of return over irregularly-dated cashflows.
 *
 * Solves for the annualized rate `r` such that the net present value of the
 * dated cashflows is zero, discounting each flow by the fraction of a year
 * (Actual/365) between its date and the first date:
 *
 *   NPV(r) = Σ cfᵢ / (1 + r)^(tᵢ)   where  tᵢ = (dateᵢ − date₀) / 365
 *
 * This is the standard spreadsheet `XIRR` convention (Act/365 day count,
 * annualized rate). The series must contain at least one negative and one
 * positive flow, otherwise no real root exists.
 *
 * This is a READ-ONLY product: XIRR *reports* a return; it never moves money.
 */

/** A single dated cashflow: positive = inflow to the investor, negative = outflow. */
export interface DatedCashflow {
  /** When the cashflow occurred. ISO date (YYYY-MM-DD) or a `Date`. */
  date: string | Date;
  /** Signed amount. Convention: money *into* the investor is positive. */
  amount: Decimal.Value;
}

export interface XirrOptions {
  /** Initial guess for the annual rate (default 0.1 = 10%). */
  guess?: number;
  /** Absolute NPV tolerance for convergence (default 1e-10). */
  tolerance?: number;
  /** Maximum Newton/bisection iterations (default 100). */
  maxIterations?: number;
}

const MS_PER_DAY = 86_400_000;
const DAYS_PER_YEAR = 365;

function toUtcDate(date: string | Date): Date {
  if (date instanceof Date) {
    if (Number.isNaN(date.getTime())) {
      throw new Error("xirr: invalid Date in cashflow");
    }
    return date;
  }
  const trimmed = date.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error(
      `xirr: cashflow date must be ISO YYYY-MM-DD, got ${JSON.stringify(date)}`,
    );
  }
  const [y, m, d] = trimmed.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    throw new Error(`xirr: not a real calendar date: ${JSON.stringify(date)}`);
  }
  return dt;
}

/** Year fractions (Act/365) of each flow relative to the earliest date. */
function yearFractions(dates: Date[]): number[] {
  const t0 = Math.min(...dates.map((d) => d.getTime()));
  return dates.map((d) => (d.getTime() - t0) / MS_PER_DAY / DAYS_PER_YEAR);
}

interface Prepared {
  amounts: Decimal[];
  years: number[];
}

function prepare(cashflows: DatedCashflow[]): Prepared {
  if (cashflows.length < 2) {
    throw new Error("xirr: need at least two cashflows");
  }
  const amounts = cashflows.map((cf, i) => {
    let dec: Decimal;
    try {
      dec = new Decimal(cf.amount);
    } catch {
      throw new Error(`xirr: invalid amount at index ${i}`);
    }
    if (!dec.isFinite()) {
      throw new Error(`xirr: non-finite amount at index ${i}`);
    }
    return dec;
  });
  const hasPositive = amounts.some((a) => a.isPositive() && !a.isZero());
  const hasNegative = amounts.some((a) => a.isNegative());
  if (!hasPositive || !hasNegative) {
    throw new Error(
      "xirr: cashflows must contain at least one positive and one negative amount",
    );
  }
  const years = yearFractions(cashflows.map((cf) => toUtcDate(cf.date)));
  return { amounts, years };
}

/** NPV of the prepared series at annual rate `r` (as a plain number). */
function npv(amounts: Decimal[], years: number[], r: number): number {
  let acc = 0;
  for (let i = 0; i < amounts.length; i++) {
    acc += amounts[i].toNumber() / Math.pow(1 + r, years[i]);
  }
  return acc;
}

/** d(NPV)/dr of the prepared series at annual rate `r`. */
function dNpv(amounts: Decimal[], years: number[], r: number): number {
  let acc = 0;
  for (let i = 0; i < amounts.length; i++) {
    const t = years[i];
    if (t === 0) continue;
    acc += (-t * amounts[i].toNumber()) / Math.pow(1 + r, t + 1);
  }
  return acc;
}

/**
 * Compute XIRR. Returns the annualized rate as a `Decimal` (e.g. `0.1` = 10%).
 *
 * Uses Newton-Raphson seeded from `guess`, and falls back to bracketed
 * bisection when Newton diverges, leaves the valid domain (`r ≤ -1`), or stalls.
 * Throws if no sign change can be bracketed (no real root).
 */
export function xirr(
  cashflows: DatedCashflow[],
  options: XirrOptions = {},
): Decimal {
  const { guess = 0.1, tolerance = 1e-10, maxIterations = 100 } = options;
  const { amounts, years } = prepare(cashflows);

  // Newton-Raphson from the supplied guess.
  let rate = guess;
  for (let i = 0; i < maxIterations; i++) {
    const value = npv(amounts, years, rate);
    if (Math.abs(value) < tolerance) {
      return new Decimal(rate);
    }
    const derivative = dNpv(amounts, years, rate);
    if (derivative === 0 || !Number.isFinite(derivative)) break;
    const next = rate - value / derivative;
    if (!Number.isFinite(next) || next <= -1) break;
    if (Math.abs(next - rate) < tolerance) {
      rate = next;
      if (Math.abs(npv(amounts, years, rate)) < tolerance) {
        return new Decimal(rate);
      }
      break;
    }
    rate = next;
  }

  // Fallback: bracket a sign change and bisect. Scan a wide rate range.
  const lo0 = -0.9999999;
  const fLo0 = npv(amounts, years, lo0);
  let lo = lo0;
  let fLo = fLo0;
  let hi = NaN;
  // Expand the upper bound geometrically until NPV changes sign.
  for (let hiCandidate = 0; hiCandidate <= 1e7; hiCandidate = hiCandidate === 0 ? 1 : hiCandidate * 2) {
    const f = npv(amounts, years, hiCandidate);
    if (Math.abs(f) < tolerance) {
      return new Decimal(hiCandidate);
    }
    if (Math.sign(f) !== Math.sign(fLo)) {
      hi = hiCandidate;
      break;
    }
    lo = hiCandidate;
    fLo = f;
  }
  if (Number.isNaN(hi)) {
    // Try below zero too (rate between -1 and 0).
    lo = lo0;
    fLo = fLo0;
    let bracketed = false;
    for (let step = 1; step <= 64; step++) {
      const hiCandidate = lo0 + (step / 64) * (0 - lo0);
      const f = npv(amounts, years, hiCandidate);
      if (Math.abs(f) < tolerance) {
        return new Decimal(hiCandidate);
      }
      if (Math.sign(f) !== Math.sign(fLo)) {
        hi = hiCandidate;
        bracketed = true;
        break;
      }
      lo = hiCandidate;
      fLo = f;
    }
    if (!bracketed) {
      throw new Error("xirr: failed to converge (no sign change bracketed)");
    }
  }

  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(amounts, years, mid);
    if (Math.abs(fMid) < tolerance || (hi - lo) / 2 < 1e-12) {
      return new Decimal(mid);
    }
    if (Math.sign(fMid) === Math.sign(fLo)) {
      lo = mid;
      fLo = fMid;
    } else {
      hi = mid;
    }
  }
  // Best estimate after exhausting iterations.
  return new Decimal((lo + hi) / 2);
}

/**
 * Net present value of dated cashflows at a fixed annual `rate`, using the
 * same Act/365 convention as {@link xirr}. Exposed for testing and for callers
 * that want to evaluate NPV directly. Returns a `Decimal`.
 */
export function xnpv(rate: Decimal.Value, cashflows: DatedCashflow[]): Decimal {
  const r = new Decimal(rate);
  if (r.lessThanOrEqualTo(-1)) {
    throw new Error("xnpv: rate must be greater than -1");
  }
  const dates = cashflows.map((cf) => toUtcDate(cf.date));
  const years = yearFractions(dates);
  let acc = new Decimal(0);
  const onePlusR = r.plus(1);
  for (let i = 0; i < cashflows.length; i++) {
    const amount = new Decimal(cashflows[i].amount);
    // (1+r)^t with fractional t — Decimal.pow supports non-integer exponents.
    const discount = onePlusR.pow(years[i]);
    acc = acc.plus(amount.div(discount));
  }
  return acc;
}
