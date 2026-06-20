/**
 * Private-markets **view model**: turns a sleeve of commitments into the small,
 * fully-deterministic, plain-`number` model the React page renders — portfolio
 * KPIs, a paid-in-vs-distributed-vs-NAV bar per fund, a J-curve line series, and
 * a per-commitment metrics table.
 *
 * Keeping every derivation here (and out of the components) gives the visuals a
 * machine-checkable test surface. Pure, deterministic, offline, READ-ONLY.
 */

import { buildJCurve } from "./jcurve";
import { portfolioMetrics } from "./portfolio";
import { seededCommitments } from "./fixtures";
import type { Commitment } from "./commitment";

/** Headline KPIs for the private-markets page (plain numbers). */
export interface PmKpis {
  readonly committed: number;
  readonly paidIn: number;
  readonly distributed: number;
  readonly nav: number;
  readonly unfunded: number;
  readonly tvpi: number;
  readonly dpi: number;
  readonly rvpi: number;
  /** Pooled IRR as a fraction (0.15 = 15%), or `null` when undefined. */
  readonly irr: number | null;
}

/** A row in the per-commitment table / paid-in bar chart. */
export interface CommitmentRow {
  readonly id: string;
  readonly name: string;
  readonly strategy: string;
  readonly vintageYear: number;
  readonly committed: number;
  readonly paidIn: number;
  readonly distributed: number;
  readonly nav: number;
  readonly unfunded: number;
  readonly tvpi: number;
  readonly dpi: number;
  readonly rvpi: number;
  readonly moic: number;
  /** IRR fraction, or `null` when undefined for this fund. */
  readonly irr: number | null;
}

/** One point on the J-curve line chart for the whole sleeve. */
export interface JCurveViewPoint {
  readonly date: string;
  readonly cumulativeNet: number;
  readonly totalValue: number;
}

/** Per-fund J-curve series, for small-multiple rendering. */
export interface FundJCurve {
  readonly id: string;
  readonly name: string;
  readonly points: readonly JCurveViewPoint[];
  readonly trough: number;
  readonly troughDate: string | null;
  readonly breakevenDate: string | null;
}

/** The full plain-data model the private-markets page renders. */
export interface PrivateMarketsModel {
  readonly currency: string;
  readonly kpis: PmKpis;
  /** Per-commitment rows, largest committed first. */
  readonly commitments: readonly CommitmentRow[];
  /** Per-fund J-curve series. */
  readonly jcurves: readonly FundJCurve[];
}

/** Inputs to {@link buildPrivateMarketsModel}; defaults to the seeded sleeve. */
export interface PrivateMarketsModelInput {
  readonly commitments?: readonly Commitment[];
}

function num(value: { toNumber(): number } | null): number | null {
  return value === null ? null : value.toNumber();
}

/**
 * Build the {@link PrivateMarketsModel} from a sleeve of commitments. Defaults
 * to the seeded fixtures. Commitment rows are sorted by committed capital,
 * largest first (matching the bar chart's most-material-first ordering).
 */
export function buildPrivateMarketsModel(
  input: PrivateMarketsModelInput = {},
): PrivateMarketsModel {
  const commitments = input.commitments ?? seededCommitments;
  const portfolio = portfolioMetrics(commitments);

  const kpis: PmKpis = {
    committed: portfolio.committed.toNumber(),
    paidIn: portfolio.paidIn.toNumber(),
    distributed: portfolio.distributed.toNumber(),
    nav: portfolio.nav.toNumber(),
    unfunded: portfolio.unfunded.toNumber(),
    tvpi: portfolio.tvpi.toNumber(),
    dpi: portfolio.dpi.toNumber(),
    rvpi: portfolio.rvpi.toNumber(),
    irr: num(portfolio.irr),
  };

  const rows: CommitmentRow[] = portfolio.commitments
    .map((m) => ({
      id: m.id,
      name: m.name,
      strategy: m.strategy,
      vintageYear: m.vintageYear,
      committed: m.committed.toNumber(),
      paidIn: m.paidIn.toNumber(),
      distributed: m.distributed.toNumber(),
      nav: m.nav.toNumber(),
      unfunded: m.unfunded.toNumber(),
      tvpi: m.tvpi.toNumber(),
      dpi: m.dpi.toNumber(),
      rvpi: m.rvpi.toNumber(),
      moic: m.moic.toNumber(),
      irr: num(m.irr),
    }))
    .sort((a, b) => b.committed - a.committed);

  // Preserve the bar/J-curve order to match the (sorted) table rows.
  const byId = new Map(commitments.map((c) => [c.id, c]));
  const jcurves: FundJCurve[] = rows.map((row) => {
    const commitment = byId.get(row.id)!;
    const jc = buildJCurve(commitment);
    return {
      id: commitment.id,
      name: commitment.name,
      points: jc.points.map((p) => ({
        date: p.date,
        cumulativeNet: p.cumulativeNet.toNumber(),
        totalValue: p.totalValue.toNumber(),
      })),
      trough: jc.trough.toNumber(),
      troughDate: jc.troughDate,
      breakevenDate: jc.breakevenDate,
    };
  });

  return {
    currency: portfolio.currency,
    kpis,
    commitments: rows,
    jcurves,
  };
}

/** The seeded private-markets model used by the page and its tests. */
export const seededPrivateMarketsModel: PrivateMarketsModel =
  buildPrivateMarketsModel();
