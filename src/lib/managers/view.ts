/**
 * View model for the manager / fund due-diligence scorecard page.
 *
 * Wraps the {@link scoreManager} oracle output in plain numbers ready for the
 * UI: a ranked roster table, the selected manager's net-vs-gross growth curve,
 * a per-period detail series, and the composite-score breakdown. Pure,
 * deterministic and offline.
 */

import {
  scoreManager,
  scoreRoster,
  type Manager,
  type ManagerScorecard,
  type ScorecardOptions,
} from "./scorecard";

/** One row in the ranked roster table (all numbers, render-ready). */
export interface RosterRow {
  readonly id: string;
  readonly name: string;
  readonly strategy: string;
  readonly vintage: number;
  readonly aum: number;
  /** Total compounded gross return over the window (fraction). */
  readonly grossTotal: number;
  /** Total compounded net return over the window (fraction). */
  readonly netTotal: number;
  /** Net excess over benchmark (fraction). */
  readonly excessReturn: number;
  /** Annualized information ratio. */
  readonly informationRatio: number;
  /** Fraction of gross profit lost to fees. */
  readonly feeDragShare: number;
  /** Composite score 0–100. */
  readonly score: number;
  /** 1-based rank within the roster (best score = 1). */
  readonly rank: number;
}

/** One period of the selected manager's net-vs-gross detail. */
export interface PeriodPoint {
  readonly period: number;
  readonly gross: number;
  readonly net: number;
  readonly benchmark: number;
  /** Cumulative gross growth multiple from 1.0. */
  readonly grossGrowth: number;
  /** Cumulative net growth multiple from 1.0. */
  readonly netGrowth: number;
  /** Cumulative benchmark growth multiple from 1.0. */
  readonly benchmarkGrowth: number;
}

/** The detail view for one selected manager. */
export interface ManagerDetail {
  readonly id: string;
  readonly name: string;
  readonly strategy: string;
  readonly vintage: number;
  readonly aum: number;
  readonly fees: ManagerScorecard["fees"];
  readonly grossTotal: number;
  readonly netTotal: number;
  readonly feeDrag: number;
  readonly feeDragShare: number;
  readonly excessReturn: number;
  readonly benchmarkReturn: number;
  readonly trackingError: number;
  readonly informationRatio: number;
  readonly beta: number;
  readonly hitRate: number;
  readonly score: ManagerScorecard["score"];
  readonly points: readonly PeriodPoint[];
}

/** Build the per-period net/gross/benchmark detail for one scorecard. */
export function buildDetail(card: ManagerScorecard): ManagerDetail {
  const gross = card.netGross.grossReturns;
  const net = card.netGross.netReturns;
  const points: PeriodPoint[] = [];
  let g = 1;
  let n = 1;
  let b = 1;
  for (let i = 0; i < gross.length; i++) {
    g *= 1 + gross[i];
    n *= 1 + net[i];
    const benchR = card.benchmarkReturns[i] ?? 0;
    b *= 1 + benchR;
    points.push({
      period: i + 1,
      gross: gross[i],
      net: net[i],
      benchmark: benchR,
      grossGrowth: g,
      netGrowth: n,
      benchmarkGrowth: b,
    });
  }
  return {
    id: card.id,
    name: card.name,
    strategy: card.strategy,
    vintage: card.vintage,
    aum: card.aum,
    fees: card.fees,
    grossTotal: card.netGross.grossTotal.toNumber(),
    netTotal: card.netGross.netTotal.toNumber(),
    feeDrag: card.feeDrag.drag.toNumber(),
    feeDragShare: card.feeDrag.dragShareOfProfit.toNumber(),
    excessReturn: card.relative.excessReturn,
    benchmarkReturn: card.relative.benchmarkReturn,
    trackingError: card.relative.trackingError,
    informationRatio: card.relative.informationRatio,
    beta: card.relative.beta,
    hitRate: card.relative.hitRate,
    score: card.score,
    points,
  };
}

/** The whole scorecard view: ranked roster + the selected manager's detail. */
export interface ScorecardView {
  readonly roster: readonly RosterRow[];
  readonly detail: ManagerDetail;
  readonly selectedId: string;
}

export interface BuildScorecardViewInput {
  readonly managers: readonly Manager[];
  /** Which manager to show in detail; defaults to the top-ranked. */
  readonly selectedId?: string;
  readonly options?: ScorecardOptions;
}

/**
 * Build the full {@link ScorecardView}: a ranked roster of all managers and the
 * detailed breakdown for the selected one (defaulting to the highest-scoring).
 */
export function buildScorecardView({
  managers,
  selectedId,
  options,
}: BuildScorecardViewInput): ScorecardView {
  if (managers.length === 0) {
    throw new Error("buildScorecardView requires at least one manager");
  }
  const ranked = scoreRoster(managers, options);
  const roster: RosterRow[] = ranked.map((card, i) => ({
    id: card.id,
    name: card.name,
    strategy: card.strategy,
    vintage: card.vintage,
    aum: card.aum,
    grossTotal: card.netGross.grossTotal.toNumber(),
    netTotal: card.netGross.netTotal.toNumber(),
    excessReturn: card.relative.excessReturn,
    informationRatio: card.relative.informationRatio,
    feeDragShare: card.feeDrag.dragShareOfProfit.toNumber(),
    score: card.score.composite,
    rank: i + 1,
  }));

  const targetId = selectedId ?? ranked[0].id;
  const selected =
    managers.find((m) => m.id === targetId) ?? managers[0];
  const card = scoreManager(selected, options);
  const detail = buildDetail(card);

  return { roster, detail, selectedId: card.id };
}
