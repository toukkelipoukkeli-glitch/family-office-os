/**
 * Pure derivations for the deal pipeline board.
 *
 * These selectors take a {@link Pipeline} and a list of {@link Deal}s and
 * compute everything the board UI renders: deals grouped per stage, per-stage
 * totals, a probability-weighted pipeline estimate, and the win-rate over
 * closed deals. Kept free of React so the math is unit-testable in isolation
 * (see AGENTS.md: every unit needs a machine-checkable oracle).
 *
 * READ-ONLY product: nothing here moves money or advances a deal — these are
 * passive reports over the family's own tracking state.
 */

import { Money, sumMoney } from "../money";
import type { Deal } from "./deal";
import { isTerminalDealStatus } from "./deal";
import {
  type Pipeline,
  type PipelineStage,
  type StageKind,
  orderedStages,
} from "./pipeline-stage";

/**
 * The effective close-probability the board applies to a deal: the deal's own
 * `probability` override when present, otherwise the default probability of the
 * stage it sits in. Clamped to [0, 1] defensively.
 */
export function effectiveProbability(deal: Deal, stage: PipelineStage): number {
  const raw = deal.probability ?? stage.probability;
  return Math.min(1, Math.max(0, raw));
}

/** Parse a deal's optional `amount` into a {@link Money}, or `null` if unset. */
export function dealAmount(deal: Deal): Money | null {
  if (!deal.amount) return null;
  return Money.of(deal.amount.amount, deal.amount.currency);
}

/**
 * A single stage of the board: the stage definition plus the deals currently in
 * it and the rolled-up totals for that column.
 *
 * - `total` is the straight sum of deal amounts (same currency assumed).
 * - `weighted` is the probability-weighted sum (Σ amount × p), the column's
 *   contribution to the expected pipeline value.
 */
export interface StageColumn {
  stage: PipelineStage;
  deals: Deal[];
  count: number;
  total: Money;
  weighted: Money;
}

/**
 * Group deals into board columns, one per stage, in stage `order`. Deals whose
 * `stageId` does not match any stage in the pipeline are ignored (they belong
 * to a different pipeline). The `currency` is used for the zero/empty totals so
 * an empty column still reports a `Money` rather than throwing.
 */
export function buildBoard(
  pipeline: Pipeline,
  deals: Deal[],
  currency = "EUR",
): StageColumn[] {
  const stages = orderedStages(pipeline);
  const byStage = new Map<string, Deal[]>();
  for (const stage of stages) byStage.set(stage.id, []);
  for (const deal of deals) {
    const bucket = byStage.get(deal.stageId);
    if (bucket) bucket.push(deal);
  }

  return stages.map((stage) => {
    const stageDeals = byStage.get(stage.id) ?? [];
    const amounts: Money[] = [];
    const weightedAmounts: Money[] = [];
    for (const deal of stageDeals) {
      const amount = dealAmount(deal);
      if (!amount) continue;
      amounts.push(amount);
      weightedAmounts.push(amount.times(effectiveProbability(deal, stage)));
    }
    return {
      stage,
      deals: stageDeals,
      count: stageDeals.length,
      total: sumMoney(amounts, currency),
      weighted: sumMoney(weightedAmounts, currency).round(),
    };
  });
}

/** Headline metrics across the whole pipeline (the board summary bar). */
export interface PipelineSummary {
  /** Number of deals currently in flight (non-terminal status). */
  openCount: number;
  /** Number of closed deals (won + lost + abandoned). */
  closedCount: number;
  /** Total indicative size of all open deals. */
  openTotal: Money;
  /** Probability-weighted value of open deals (expected pipeline). */
  weightedTotal: Money;
  /** Number of won deals. */
  wonCount: number;
  /** Number of lost deals (excludes abandoned). */
  lostCount: number;
  /**
   * Win rate over *decided* deals (won / (won + lost)) as a fraction in
   * [0, 1], or `null` when no deal has been decided yet.
   */
  winRate: number | null;
}

/**
 * Roll the board up into a single summary. `openTotal` and `weightedTotal`
 * count only non-terminal deals — terminal deals are already decided and don't
 * belong in a forward-looking pipeline estimate.
 */
export function summarizePipeline(
  pipeline: Pipeline,
  deals: Deal[],
  currency = "EUR",
): PipelineSummary {
  const stageById = new Map<string, PipelineStage>(
    pipeline.stages.map((s) => [s.id, s]),
  );

  const openAmounts: Money[] = [];
  const weightedAmounts: Money[] = [];
  let openCount = 0;
  let closedCount = 0;
  let wonCount = 0;
  let lostCount = 0;

  for (const deal of deals) {
    if (deal.pipelineId !== pipeline.id) continue;
    if (isTerminalDealStatus(deal.status)) {
      closedCount += 1;
      if (deal.status === "won") wonCount += 1;
      if (deal.status === "lost") lostCount += 1;
      continue;
    }
    openCount += 1;
    const amount = dealAmount(deal);
    if (!amount) continue;
    openAmounts.push(amount);
    const stage = stageById.get(deal.stageId);
    const p = stage ? effectiveProbability(deal, stage) : (deal.probability ?? 0);
    weightedAmounts.push(amount.times(p));
  }

  const decided = wonCount + lostCount;
  return {
    openCount,
    closedCount,
    openTotal: sumMoney(openAmounts, currency),
    weightedTotal: sumMoney(weightedAmounts, currency).round(),
    wonCount,
    lostCount,
    winRate: decided === 0 ? null : wonCount / decided,
  };
}

/** Find a deal by id within a list (board drill-down lookup). */
export function findDeal(deals: Deal[], dealId: string): Deal | undefined {
  return deals.find((d) => d.id === dealId);
}

/** Resolve the stage a deal sits in, or `undefined` if not in this pipeline. */
export function stageOf(
  pipeline: Pipeline,
  deal: Deal,
): PipelineStage | undefined {
  return pipeline.stages.find((s) => s.id === deal.stageId);
}

/** A short human label for a stage kind, used for badges. */
export function stageKindLabel(kind: StageKind): string {
  switch (kind) {
    case "open":
      return "Open";
    case "won":
      return "Won";
    case "lost":
      return "Lost";
  }
}
