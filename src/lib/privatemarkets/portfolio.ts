import { Decimal } from "decimal.js";

import { xirr } from "@/lib/returns";

import {
  commitmentMetrics,
  irrCashflows,
  type Commitment,
  type CommitmentMetrics,
} from "./commitment";

/**
 * Portfolio-level roll-up across a sleeve of private-markets commitments.
 *
 * Aggregates committed / paid-in / distributed / NAV across funds (currencies
 * must match — this is a single-currency sleeve), derives the pooled
 * DPI / RVPI / TVPI / MOIC and unfunded, and computes a **pooled IRR** by
 * concatenating every commitment's dated cashflows (calls, distributions, and
 * each fund's terminal NAV) into one series and running XIRR over it — the
 * standard way to express the whole sleeve's money-weighted return.
 *
 * Pure, deterministic, exact ({@link Decimal}); READ-ONLY.
 */

/** Aggregate metrics for a whole private-markets sleeve. */
export interface PortfolioMetrics {
  readonly currency: string;
  /** Number of commitments in the sleeve. */
  readonly count: number;
  readonly committed: Decimal;
  readonly paidIn: Decimal;
  readonly distributed: Decimal;
  readonly nav: Decimal;
  readonly unfunded: Decimal;
  readonly dpi: Decimal;
  readonly rvpi: Decimal;
  readonly tvpi: Decimal;
  readonly moic: Decimal;
  /** Pooled dated-cashflow IRR across all funds, or `null` when undefined. */
  readonly irr: Decimal | null;
  /** Per-commitment metrics, in input order. */
  readonly commitments: readonly CommitmentMetrics[];
}

const ZERO = new Decimal(0);

function ratio(numerator: Decimal, denominator: Decimal): Decimal {
  return denominator.isZero() ? ZERO : numerator.div(denominator);
}

/**
 * Pooled IRR across the sleeve: concatenate every commitment's signed dated
 * cashflows (via {@link irrCashflows}) and run XIRR once. Returns `null` when
 * the combined series lacks the sign change XIRR needs.
 */
export function portfolioIrr(commitments: readonly Commitment[]): Decimal | null {
  const flows = commitments.flatMap((c) => irrCashflows(c));
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

/**
 * Roll a sleeve of commitments up into {@link PortfolioMetrics}. All commitments
 * must share a currency; throws otherwise (mixing currencies would silently sum
 * incomparable amounts).
 */
export function portfolioMetrics(
  commitments: readonly Commitment[],
): PortfolioMetrics {
  if (commitments.length === 0) {
    throw new Error("privatemarkets: portfolioMetrics requires ≥ 1 commitment");
  }
  const currency = commitments[0].currency;
  for (const c of commitments) {
    if (c.currency !== currency) {
      throw new Error(
        `privatemarkets: currency mismatch in sleeve (${currency} vs ${c.currency})`,
      );
    }
  }

  const perCommitment = commitments.map(commitmentMetrics);

  const committed = perCommitment.reduce((a, m) => a.plus(m.committed), ZERO);
  const paidIn = perCommitment.reduce((a, m) => a.plus(m.paidIn), ZERO);
  const distributed = perCommitment.reduce(
    (a, m) => a.plus(m.distributed),
    ZERO,
  );
  const nav = perCommitment.reduce((a, m) => a.plus(m.nav), ZERO);
  const unfunded = perCommitment.reduce((a, m) => a.plus(m.unfunded), ZERO);

  const dpi = ratio(distributed, paidIn);
  const rvpi = ratio(nav, paidIn);
  const tvpi = dpi.plus(rvpi);

  return {
    currency,
    count: commitments.length,
    committed,
    paidIn,
    distributed,
    nav,
    unfunded,
    dpi,
    rvpi,
    tvpi,
    moic: tvpi,
    irr: portfolioIrr(commitments),
    commitments: perCommitment,
  };
}
