import { Decimal } from "decimal.js";

import { xirr, type DatedCashflow } from "@/lib/returns/xirr";

/**
 * m9-pe-lifecycle — exact-decimal private-markets commitment lifecycle engine
 * for the read-only family office OS.
 *
 * Models a single closed-end private fund (PE / VC / real-asset) as a
 * {@link Commitment} plus a dated {@link CashflowEntry} ledger of capital calls
 * (LP pays in) and distributions (LP receives back). From that ledger plus a
 * current Net Asset Value (residual value) it computes the standard
 * private-markets performance multiples and rate:
 *
 *   - TVPI  = (cumulative distributions + NAV) / paid-in   (Total Value / PI)
 *   - DPI   = cumulative distributions / paid-in            (Distributed / PI)
 *   - RVPI  = NAV / paid-in                                 (Residual / PI)
 *   - MOIC  = (distributions + NAV) / paid-in              (== TVPI here)
 *   - Unfunded / undrawn commitment = committed − cumulative calls (≥ 0)
 *   - PE IRR — dollar-weighted internal rate of return over the dated flows,
 *     with the residual NAV treated as a terminal distribution.
 *   - J-curve pacing — cumulative net cashflow over time, the characteristic
 *     dip-then-recover shape of a fund's life.
 *
 * Money is {@link Decimal} (see AGENTS.md: "Money is `Decimal`. Never
 * floating-point currency."). This is a READ-ONLY product: it *reports* fund
 * performance and never moves money or commits capital.
 */

/** Value accepted for any decimal quantity (amount, NAV, committed). */
export type DecimalInput = string | number | Decimal;

/** The two kinds of LP cashflow in a closed-end fund. */
export type CashflowKind = "call" | "distribution";

/**
 * One dated entry in the fund's cashflow ledger.
 *
 * `amount` is always stored as a positive magnitude; the {@link kind}
 * carries the direction. A `call` is money the LP pays *into* the fund; a
 * `distribution` is money the fund pays *back* to the LP.
 */
export interface CashflowEntry {
  /** ISO date (YYYY-MM-DD) the cashflow settled. */
  date: string;
  /** Whether this is a capital call or a distribution. */
  kind: CashflowKind;
  /** Positive magnitude of the cashflow (direction comes from {@link kind}). */
  amount: DecimalInput;
  /** Optional human label (e.g. "Drawdown 1", "Exit: Acme"). */
  note?: string;
}

/** The LP's commitment to a single fund. */
export interface Commitment {
  /** Fund identifier / name. */
  fundName: string;
  /** Total committed capital (the LP's promise to fund calls up to this). */
  committed: DecimalInput;
  /** Vintage year (year of first close / first capital deployed). */
  vintageYear: number;
  /** ISO-4217 currency code (e.g. "USD"). */
  currency: string;
}

/** A commitment plus its dated cashflow ledger and a current valuation. */
export interface FundPosition {
  commitment: Commitment;
  /** The dated capital-call / distribution ledger. Order is irrelevant. */
  cashflows: CashflowEntry[];
  /**
   * Current residual Net Asset Value (manager's mark of the remaining
   * holdings). Defaults to 0 (e.g. a fully-realized / liquidated fund).
   */
  nav?: DecimalInput;
  /**
   * As-of date for the NAV, used as the terminal date when computing IRR.
   * Defaults to the latest cashflow date if omitted.
   */
  asOf?: string;
}

/** One point on the cumulative J-curve pacing series. */
export interface JCurvePoint {
  /** ISO date of the cashflow that produced this point. */
  date: string;
  /** Signed cashflow on this date (calls negative, distributions positive). */
  netCashflow: Decimal;
  /** Cumulative paid-in capital up to and including this date. */
  cumulativePaidIn: Decimal;
  /** Cumulative distributions up to and including this date. */
  cumulativeDistributions: Decimal;
  /**
   * Cumulative net cashflow to the LP up to this date
   * (= cumulativeDistributions − cumulativePaidIn). This is the curve that
   * dips negative as capital is called and recovers as it is returned.
   */
  cumulativeNet: Decimal;
}

/** The computed lifecycle metrics for a {@link FundPosition}. */
export interface LifecycleMetrics {
  fundName: string;
  currency: string;
  vintageYear: number;
  /** Total committed capital. */
  committed: Decimal;
  /** Cumulative capital called (paid in) to date. */
  paidIn: Decimal;
  /** Cumulative distributions received to date. */
  distributed: Decimal;
  /** Current residual NAV. */
  nav: Decimal;
  /** Undrawn commitment = max(committed − paidIn, 0). */
  unfunded: Decimal;
  /** Fraction of the commitment that has been called (paidIn / committed). */
  calledPct: Decimal;
  /** Total value to paid-in: (distributed + nav) / paidIn. */
  tvpi: Decimal;
  /** Distributions to paid-in: distributed / paidIn. */
  dpi: Decimal;
  /** Residual value to paid-in: nav / paidIn. */
  rvpi: Decimal;
  /** Multiple on invested capital: (distributed + nav) / paidIn (== tvpi). */
  moic: Decimal;
  /**
   * PE IRR — annualized dollar-weighted return over the dated flows, with NAV
   * as a terminal inflow. `null` when an IRR is undefined (e.g. no
   * distributions and no NAV, so there is no positive flow to solve against).
   */
  irr: Decimal | null;
  /** The J-curve pacing series, in date order. */
  jCurve: JCurvePoint[];
}

const ZERO = new Decimal(0);

function toDecimal(value: DecimalInput, label: string): Decimal {
  let dec: Decimal;
  try {
    dec = value instanceof Decimal ? value : new Decimal(value);
  } catch {
    throw new Error(`privatemarkets: invalid ${label}: ${String(value)}`);
  }
  if (!dec.isFinite()) {
    throw new Error(`privatemarkets: non-finite ${label}`);
  }
  return dec;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertIsoDate(date: string, label: string): void {
  if (!ISO_DATE.test(date)) {
    throw new Error(
      `privatemarkets: ${label} must be ISO YYYY-MM-DD, got ${JSON.stringify(date)}`,
    );
  }
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    throw new Error(`privatemarkets: ${label} is not a real date: ${JSON.stringify(date)}`);
  }
}

/** Safe ratio: numerator / denominator, returning 0 when the denominator is 0. */
function ratio(numerator: Decimal, denominator: Decimal): Decimal {
  if (denominator.isZero()) return ZERO;
  return numerator.div(denominator);
}

/**
 * Normalize and validate a {@link FundPosition}, returning the cashflows sorted
 * by date (stable for same-date entries) plus the resolved NAV and as-of date.
 */
function normalize(position: FundPosition): {
  committed: Decimal;
  nav: Decimal;
  asOf: string;
  sorted: { date: string; signed: Decimal; kind: CashflowKind }[];
} {
  const committed = toDecimal(position.commitment.committed, "committed");
  if (committed.isNegative()) {
    throw new Error("privatemarkets: committed must be non-negative");
  }
  if (!Number.isInteger(position.commitment.vintageYear)) {
    throw new Error("privatemarkets: vintageYear must be an integer");
  }
  const nav = position.nav === undefined ? ZERO : toDecimal(position.nav, "nav");
  if (nav.isNegative()) {
    throw new Error("privatemarkets: nav must be non-negative");
  }

  const sorted = position.cashflows.map((cf, i) => {
    assertIsoDate(cf.date, `cashflow[${i}].date`);
    const amount = toDecimal(cf.amount, `cashflow[${i}].amount`);
    if (amount.isNegative()) {
      throw new Error(
        `privatemarkets: cashflow[${i}].amount must be a positive magnitude (direction comes from kind)`,
      );
    }
    if (cf.kind !== "call" && cf.kind !== "distribution") {
      throw new Error(`privatemarkets: cashflow[${i}].kind must be "call" or "distribution"`);
    }
    // Calls are money out of the LP (negative); distributions are money in.
    const signed = cf.kind === "call" ? amount.negated() : amount;
    return { date: cf.date, signed, kind: cf.kind, _i: i };
  });
  // Stable sort by date, then original index.
  sorted.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a._i - b._i));

  let asOf = position.asOf;
  if (asOf !== undefined) {
    assertIsoDate(asOf, "asOf");
  } else if (sorted.length > 0) {
    asOf = sorted[sorted.length - 1].date;
  } else {
    asOf = `${position.commitment.vintageYear}-01-01`;
  }

  return {
    committed,
    nav,
    asOf,
    sorted: sorted.map(({ date, signed, kind }) => ({ date, signed, kind })),
  };
}

/**
 * Compute PE IRR for a fund position: the annualized dollar-weighted rate over
 * the dated cashflows, with the residual NAV added as a terminal inflow on the
 * as-of date. Returns `null` when the series has no sign change (e.g. only
 * calls and a zero NAV), since no real IRR exists.
 */
export function peIrr(position: FundPosition): Decimal | null {
  const { nav, asOf, sorted } = normalize(position);

  const flows: DatedCashflow[] = sorted.map((cf) => ({
    date: cf.date,
    amount: cf.signed,
  }));
  if (nav.greaterThan(0)) {
    flows.push({ date: asOf, amount: nav });
  }

  const hasPositive = flows.some((f) => new Decimal(f.amount).greaterThan(0));
  const hasNegative = flows.some((f) => new Decimal(f.amount).lessThan(0));
  if (!hasPositive || !hasNegative || flows.length < 2) {
    return null;
  }
  try {
    return xirr(flows);
  } catch {
    return null;
  }
}

/**
 * Compute the full set of lifecycle metrics (multiples, unfunded, IRR, and the
 * J-curve pacing series) for a single fund position.
 */
export function computeLifecycle(position: FundPosition): LifecycleMetrics {
  const { committed, nav, sorted } = normalize(position);

  let paidIn = ZERO;
  let distributed = ZERO;
  let cumulativePaidIn = ZERO;
  let cumulativeDistributions = ZERO;
  const jCurve: JCurvePoint[] = [];

  for (const cf of sorted) {
    if (cf.kind === "call") {
      const magnitude = cf.signed.negated();
      paidIn = paidIn.plus(magnitude);
      cumulativePaidIn = cumulativePaidIn.plus(magnitude);
    } else {
      distributed = distributed.plus(cf.signed);
      cumulativeDistributions = cumulativeDistributions.plus(cf.signed);
    }
    jCurve.push({
      date: cf.date,
      netCashflow: cf.signed,
      cumulativePaidIn,
      cumulativeDistributions,
      cumulativeNet: cumulativeDistributions.minus(cumulativePaidIn),
    });
  }

  const totalValue = distributed.plus(nav);
  const unfunded = Decimal.max(committed.minus(paidIn), ZERO);

  return {
    fundName: position.commitment.fundName,
    currency: position.commitment.currency,
    vintageYear: position.commitment.vintageYear,
    committed,
    paidIn,
    distributed,
    nav,
    unfunded,
    calledPct: ratio(paidIn, committed),
    tvpi: ratio(totalValue, paidIn),
    dpi: ratio(distributed, paidIn),
    rvpi: ratio(nav, paidIn),
    moic: ratio(totalValue, paidIn),
    irr: peIrr(position),
    jCurve,
  };
}
