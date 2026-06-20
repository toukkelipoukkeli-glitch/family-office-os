import { Decimal } from "decimal.js";

import { xirr, type DatedCashflow } from "@/lib/returns";

/**
 * m9-pe-lifecycle — Private-markets commitment lifecycle engine.
 *
 * Models a closed-end private-markets fund commitment (PE / VC / real assets)
 * the way an LP actually experiences it: a fixed `committed` amount, drawn down
 * over time via dated **capital calls**, and returned via dated **distributions**,
 * with a periodically reported **NAV** (residual fund value).
 *
 * From that ledger it derives the standard LP performance metrics —
 * TVPI / DPI / RVPI / MOIC, unfunded commitment, paid-in, and a true
 * dated-cashflow **PE IRR** (XIRR convention) — plus a **J-curve** pacing series
 * (cumulative net cashflow / NAV over time) that traces the characteristic
 * early-negative, later-positive shape of a private-markets investment.
 *
 * Everything is exact ({@link Decimal}); nothing is floating-point currency.
 * This is a READ-ONLY product: it *reports* on a commitment, it never moves
 * money or places trades.
 */

/** A dated capital movement on a commitment's ledger. */
export type CashflowKind = "call" | "distribution";

/**
 * One dated event on the commitment ledger.
 *
 * `amount` is always given as a **positive magnitude** — the {@link kind}
 * carries the direction. A `call` is capital the LP pays *into* the fund; a
 * `distribution` is capital returned *to* the LP.
 */
export interface LedgerEntry {
  /** ISO date (YYYY-MM-DD) the cashflow settled. */
  readonly date: string;
  /** Whether this is a capital call or a distribution. */
  readonly kind: CashflowKind;
  /** Positive magnitude of the cashflow (same currency as the commitment). */
  readonly amount: Decimal.Value;
  /** Optional human label (e.g. "Call #3", "Realization: Acme"). */
  readonly label?: string;
}

/** A private-markets fund commitment plus its cashflow ledger. */
export interface Commitment {
  /** Stable identifier. */
  readonly id: string;
  /** Fund / vehicle name. */
  readonly name: string;
  /** Strategy bucket, e.g. "Buyout", "Venture", "Real assets". */
  readonly strategy: string;
  /** Total capital committed to the fund. */
  readonly committed: Decimal.Value;
  /** Vintage (first-close / commitment) year. */
  readonly vintageYear: number;
  /** 3-letter ISO currency code. */
  readonly currency: string;
  /** Dated calls + distributions, in any order (sorted internally). */
  readonly ledger: readonly LedgerEntry[];
  /**
   * Latest reported residual NAV (unrealised fund value still held). Defaults
   * to zero (treated as fully wound down) when omitted.
   */
  readonly nav?: Decimal.Value;
  /** ISO date the {@link nav} was reported (defaults to the last ledger date). */
  readonly navDate?: string;
}

/** Fully-derived metrics for a single commitment. All amounts are {@link Decimal}. */
export interface CommitmentMetrics {
  readonly id: string;
  readonly name: string;
  readonly strategy: string;
  readonly vintageYear: number;
  readonly currency: string;
  /** Total committed capital. */
  readonly committed: Decimal;
  /** Cumulative capital called (paid-in). */
  readonly paidIn: Decimal;
  /** Cumulative distributions received. */
  readonly distributed: Decimal;
  /** Residual NAV (unrealised value still held). */
  readonly nav: Decimal;
  /**
   * Unfunded commitment = committed − paidIn, floored at zero. Recallable
   * distributions are out of scope; this is the simple drawn-vs-committed gap.
   */
  readonly unfunded: Decimal;
  /** Distributions to paid-in (realised multiple). 0 when nothing paid in. */
  readonly dpi: Decimal;
  /** Residual value to paid-in (unrealised multiple). 0 when nothing paid in. */
  readonly rvpi: Decimal;
  /** Total value to paid-in = DPI + RVPI. 0 when nothing paid in. */
  readonly tvpi: Decimal;
  /**
   * Multiple on invested capital. Here defined identically to TVPI —
   * (distributions + NAV) / paid-in — the standard LP MOIC. Exposed separately
   * because the two terms are used interchangeably in LP reporting.
   */
  readonly moic: Decimal;
  /**
   * Dated-cashflow PE IRR (XIRR convention, Act/365, annualised). `null` when
   * the cashflow series lacks the sign change XIRR requires (e.g. no
   * distributions and no NAV yet, so no positive flow).
   */
  readonly irr: Decimal | null;
}

const ZERO = new Decimal(0);

function toDecimal(value: Decimal.Value, context: string): Decimal {
  const dec = value instanceof Decimal ? value : new Decimal(value);
  if (!dec.isFinite()) {
    throw new Error(`privatemarkets: non-finite ${context}`);
  }
  return dec;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertIsoDate(date: string, context: string): string {
  if (!ISO_DATE.test(date)) {
    throw new Error(
      `privatemarkets: ${context} must be ISO YYYY-MM-DD, got ${JSON.stringify(date)}`,
    );
  }
  return date;
}

/**
 * Normalize + validate a commitment, returning sorted ledger entries with
 * non-negative magnitudes. Throws on malformed dates, negative amounts, or a
 * non-positive committed amount.
 */
function prepare(commitment: Commitment): {
  committed: Decimal;
  entries: { date: string; kind: CashflowKind; amount: Decimal }[];
  nav: Decimal;
  navDate: string | null;
} {
  const committed = toDecimal(commitment.committed, "committed amount");
  if (committed.lessThanOrEqualTo(0)) {
    throw new Error("privatemarkets: committed amount must be positive");
  }
  if (!Number.isInteger(commitment.vintageYear)) {
    throw new Error("privatemarkets: vintageYear must be an integer");
  }

  const entries = commitment.ledger.map((e, i) => {
    const amount = toDecimal(e.amount, `ledger amount at index ${i}`);
    if (amount.isNegative()) {
      throw new Error(
        `privatemarkets: ledger amounts must be non-negative magnitudes (index ${i})`,
      );
    }
    return {
      date: assertIsoDate(e.date, `ledger date at index ${i}`),
      kind: e.kind,
      amount,
    };
  });
  // Stable chronological sort.
  entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const nav =
    commitment.nav === undefined ? ZERO : toDecimal(commitment.nav, "nav");
  if (nav.isNegative()) {
    throw new Error("privatemarkets: nav must be non-negative");
  }
  const navDate =
    commitment.navDate !== undefined
      ? assertIsoDate(commitment.navDate, "navDate")
      : (entries.length > 0 ? entries[entries.length - 1].date : null);

  return { committed, entries, nav, navDate };
}

/** Sum of all call magnitudes (paid-in capital). */
function sumCalls(
  entries: { kind: CashflowKind; amount: Decimal }[],
): Decimal {
  return entries.reduce(
    (acc, e) => (e.kind === "call" ? acc.plus(e.amount) : acc),
    ZERO,
  );
}

/** Sum of all distribution magnitudes. */
function sumDistributions(
  entries: { kind: CashflowKind; amount: Decimal }[],
): Decimal {
  return entries.reduce(
    (acc, e) => (e.kind === "distribution" ? acc.plus(e.amount) : acc),
    ZERO,
  );
}

/**
 * Build the signed, dated cashflow series an LP IRR is computed over, using the
 * standard sign convention for {@link xirr} (money *into* the investor is
 * positive): a call is a negative flow, a distribution a positive flow, and the
 * residual NAV is appended as a terminal positive flow on `navDate` (the fund
 * being "liquidated" at its carrying value).
 *
 * Exported so the IRR is transparently testable against an external oracle.
 */
export function irrCashflows(commitment: Commitment): DatedCashflow[] {
  const { entries, nav, navDate } = prepare(commitment);
  const flows: DatedCashflow[] = entries.map((e) => ({
    date: e.date,
    amount: e.kind === "call" ? e.amount.negated() : e.amount,
  }));
  if (nav.isPositive() && navDate !== null) {
    flows.push({ date: navDate, amount: nav });
  }
  return flows;
}

/**
 * Compute the dated-cashflow PE IRR for a commitment, or `null` when the
 * cashflow series has no sign change (XIRR is undefined). Annualised, Act/365.
 */
export function commitmentIrr(commitment: Commitment): Decimal | null {
  const flows = irrCashflows(commitment);
  const hasPositive = flows.some((f) => new Decimal(f.amount).isPositive());
  const hasNegative = flows.some((f) => new Decimal(f.amount).isNegative());
  if (flows.length < 2 || !hasPositive || !hasNegative) {
    return null;
  }
  try {
    return xirr(flows);
  } catch {
    return null;
  }
}

/** Safe ratio: `numerator / denominator`, or 0 when the denominator is 0. */
function ratio(numerator: Decimal, denominator: Decimal): Decimal {
  return denominator.isZero() ? ZERO : numerator.div(denominator);
}

/**
 * Derive the full {@link CommitmentMetrics} for one commitment from its
 * committed amount + dated ledger + reported NAV. Pure and deterministic.
 */
export function commitmentMetrics(commitment: Commitment): CommitmentMetrics {
  const { committed, entries, nav } = prepare(commitment);

  const paidIn = sumCalls(entries);
  const distributed = sumDistributions(entries);
  const unfunded = Decimal.max(committed.minus(paidIn), ZERO);

  const dpi = ratio(distributed, paidIn);
  const rvpi = ratio(nav, paidIn);
  const tvpi = dpi.plus(rvpi);

  return {
    id: commitment.id,
    name: commitment.name,
    strategy: commitment.strategy,
    vintageYear: commitment.vintageYear,
    currency: commitment.currency,
    committed,
    paidIn,
    distributed,
    nav,
    unfunded,
    dpi,
    rvpi,
    tvpi,
    moic: tvpi,
    irr: commitmentIrr(commitment),
  };
}
