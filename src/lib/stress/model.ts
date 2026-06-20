/**
 * Stress-library view model.
 *
 * This module is the *oracle* behind the historical stress-test page. It runs
 * each {@link HistoricalScenario} through the existing scenario engine and
 * distils the result into a small, fully deterministic, plain-data view model
 * the React page renders as a before/after net-worth comparison plus a day-zero
 * repricing waterfall. Keeping every derivation here (and out of the components)
 * gives the visuals a machine-checkable test surface.
 *
 * For each scenario we report:
 *
 *  - **before/after net worth** — today's net worth, the net worth the instant
 *    the scenario hits (day-zero reprice), and the drawdown between them in both
 *    absolute and percentage terms. This is the headline "what would this have
 *    done to us" number.
 *  - **forward impact** — the change in expected (mean), median and 5th-
 *    percentile terminal net worth over the recovery horizon, plus the change in
 *    95% value-at-risk, from running the shocked book through Monte Carlo on the
 *    same seed as the baseline.
 *  - **waterfall** — the day-zero reprice decomposed by asset class (reusing the
 *    cockpit's {@link buildWaterfall}), so the page can show which holdings drove
 *    the loss.
 *
 * Pure, deterministic, offline. READ-ONLY product: this projects hypothetical
 * outcomes for planning and reporting; nothing here moves money.
 */

import {
  simulateNetWorth,
  valueAtRisk,
  type SimulationResult,
} from "@/lib/scenario/montecarlo";
import {
  applyScenario,
  type ClassifiedAsset,
  type ScenarioBaseInput,
} from "@/lib/scenario/named";
import { buildWaterfall, type WaterfallModel } from "@/lib/scenario/cockpit";

import {
  HISTORICAL_SCENARIOS,
  validateHistoricalScenario,
  type HistoricalScenario,
} from "./scenarios";

/** Thrown when stress view-model inputs are structurally invalid. */
export class StressModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StressModelError";
  }
}

const VAR_LEVEL = 0.95;

/** The change a scenario makes to the forward terminal distribution. */
export interface ForwardImpact {
  /** Shocked mean terminal net worth minus baseline mean. */
  readonly meanDelta: number;
  /** Shocked median terminal net worth minus baseline median. */
  readonly medianDelta: number;
  /** Shocked p5 terminal net worth minus baseline p5 (left-tail shift). */
  readonly p5Delta: number;
  /** Change in 95% value-at-risk (positive = the tail loss got bigger). */
  readonly varDelta: number;
  /** Shocked probability of ending below today's net worth (0..1). */
  readonly probabilityOfLoss: number;
}

/** The before/after net-worth impact of one historical scenario. */
export interface StressResult {
  /** The scenario that was applied (with its provenance metadata). */
  readonly scenario: HistoricalScenario;
  /** Net worth today, before any shock. */
  readonly netWorthBefore: number;
  /** Net worth the instant the scenario hits (after day-zero reprice). */
  readonly netWorthAfter: number;
  /** Signed day-zero change in net worth (`after - before`; negative = a loss). */
  readonly drawdown: number;
  /** Day-zero drawdown as a signed fraction of `netWorthBefore`. */
  readonly drawdownPct: number;
  /** Forward terminal-distribution impact over the recovery horizon. */
  readonly forward: ForwardImpact;
  /** Day-zero reprice decomposed by asset class (for the waterfall chart). */
  readonly waterfall: WaterfallModel;
}

/** The complete stress-library view model. */
export interface StressModel {
  /** Net worth today (shared baseline across every scenario). */
  readonly netWorthToday: number;
  /** Planning horizon in years (the recovery window). */
  readonly horizonYears: number;
  /**
   * One result per historical scenario, ordered worst-drawdown first so the
   * page leads with the most damaging episode.
   */
  readonly results: readonly StressResult[];
}

/** Sum of asset values at t=0. */
function sumValues(assets: readonly ClassifiedAsset[]): number {
  return assets.reduce((acc, a) => acc + a.value, 0);
}

function forwardImpactOf(
  baseline: SimulationResult,
  shocked: SimulationResult,
): ForwardImpact {
  return {
    meanDelta: shocked.stats.mean - baseline.stats.mean,
    medianDelta: shocked.stats.median - baseline.stats.median,
    p5Delta: shocked.stats.percentiles[5] - baseline.stats.percentiles[5],
    varDelta: valueAtRisk(shocked, VAR_LEVEL) - valueAtRisk(baseline, VAR_LEVEL),
    probabilityOfLoss: shocked.probabilityOfLoss,
  };
}

/**
 * Build the before/after {@link StressResult} for a single historical scenario
 * against `base`. The baseline simulation is supplied so the suite computes it
 * once and reuses it across every scenario.
 *
 * Validates the scenario's provenance first (the engine validates its shocks),
 * so a malformed scenario fails loudly. Deterministic in `base.seed`.
 */
export function buildStressResult(
  base: ScenarioBaseInput,
  scenario: HistoricalScenario,
  baseline: SimulationResult,
): StressResult {
  validateHistoricalScenario(scenario);

  const waterfall = buildWaterfall(base, scenario);
  const netWorthBefore = waterfall.initialNetWorth;
  const netWorthAfter = waterfall.shockedNetWorth;
  const drawdown = netWorthAfter - netWorthBefore;
  const drawdownPct = netWorthBefore !== 0 ? drawdown / netWorthBefore : 0;

  const shocked = simulateNetWorth(applyScenario(base, scenario));

  return {
    scenario,
    netWorthBefore,
    netWorthAfter,
    drawdown,
    drawdownPct,
    forward: forwardImpactOf(baseline, shocked),
    waterfall,
  };
}

/**
 * Build the whole stress view model from a classified base input and a set of
 * historical scenarios (default: the standing {@link HISTORICAL_SCENARIOS}
 * library).
 *
 * Deterministic in `base.seed`. Results are sorted worst-drawdown first (most
 * negative day-zero `drawdown`); ties break by scenario name for a stable order.
 * Throws {@link StressModelError} on an empty book.
 */
export function buildStressModel(
  base: ScenarioBaseInput,
  scenarios: readonly HistoricalScenario[] = HISTORICAL_SCENARIOS,
): StressModel {
  if (base.assets.length === 0) {
    throw new StressModelError("stress model requires at least one asset");
  }

  // The baseline is deterministic for a fixed `base`, so compute it once and
  // reuse it across every scenario rather than re-running it per scenario.
  const baseline = simulateNetWorth(base);

  const results = scenarios
    .map((s) => buildStressResult(base, s, baseline))
    .sort((a, b) => {
      if (a.drawdown !== b.drawdown) return a.drawdown - b.drawdown;
      return a.scenario.name.localeCompare(b.scenario.name);
    });

  return {
    netWorthToday: sumValues(base.assets),
    horizonYears: base.horizonYears ?? 1,
    results,
  };
}
