/**
 * Run named scenarios through the Monte Carlo engine and compare against the
 * baseline.
 *
 * `runScenario` glues the named-scenario builder to the simulator: it shocks the
 * base input with a {@link Scenario}, runs it on the *same seed* as the baseline
 * so the two distributions are directly comparable, and returns both results
 * plus a small {@link ScenarioImpact} delta (change in mean / median / p5 /
 * value-at-risk and the day-zero repricing of net worth).
 *
 * Running every catalog scenario is the typical reporting call:
 * `runScenarioSuite(base)` returns one {@link ScenarioRun} per named scenario.
 *
 * Pure, deterministic, offline. READ-ONLY: projections only.
 */

import {
  type SimulationInput,
  type SimulationResult,
  simulateNetWorth,
  valueAtRisk,
} from "../montecarlo/montecarlo";
import { NAMED_SCENARIOS } from "./catalog";
import { applyScenario, type ClassifiedAsset, type Scenario } from "./scenarios";

/** A base simulation input whose assets carry asset-class tags for targeting. */
export type ScenarioBaseInput = SimulationInput & {
  readonly assets: readonly ClassifiedAsset[];
};

/** The change a scenario makes relative to the baseline run (all in value units). */
export interface ScenarioImpact {
  /**
   * Day-zero change in net worth from `reprice` shocks alone: the shocked
   * initial net worth minus the baseline initial net worth. Negative for a
   * drawdown scenario.
   */
  readonly initialDelta: number;
  /** Shocked mean terminal net worth minus baseline mean. */
  readonly meanDelta: number;
  /** Shocked median terminal net worth minus baseline median. */
  readonly medianDelta: number;
  /** Shocked p5 terminal net worth minus baseline p5 (left-tail shift). */
  readonly p5Delta: number;
  /**
   * Change in 95% value-at-risk (shocked VaR minus baseline VaR). Positive means
   * the scenario makes the tail loss larger / risk worse.
   */
  readonly varDelta: number;
}

/** A baseline-vs-scenario simulation pair plus the impact delta between them. */
export interface ScenarioRun {
  /** The scenario that was applied. */
  readonly scenario: Scenario;
  /** Baseline simulation (no shocks). */
  readonly baseline: SimulationResult;
  /** Shocked simulation (scenario applied). */
  readonly scenario_result: SimulationResult;
  /** Difference of the two, for reporting. */
  readonly impact: ScenarioImpact;
}

const VAR_LEVEL = 0.95;

function impactOf(
  baseline: SimulationResult,
  shocked: SimulationResult,
): ScenarioImpact {
  return {
    initialDelta: shocked.initialNetWorth - baseline.initialNetWorth,
    meanDelta: shocked.stats.mean - baseline.stats.mean,
    medianDelta: shocked.stats.median - baseline.stats.median,
    p5Delta: shocked.stats.percentiles[5] - baseline.stats.percentiles[5],
    varDelta: valueAtRisk(shocked, VAR_LEVEL) - valueAtRisk(baseline, VAR_LEVEL),
  };
}

/**
 * Simulate `base` both unshocked and under `scenario` (on the same seed) and
 * return the pair plus the {@link ScenarioImpact} delta. The shared seed makes
 * the comparison clean: every difference is attributable to the scenario, not
 * to sampling noise.
 */
export function runScenario(
  base: ScenarioBaseInput,
  scenario: Scenario,
): ScenarioRun {
  const baseline = simulateNetWorth(base);
  const shockedInput = applyScenario(base, scenario);
  const scenarioResult = simulateNetWorth(shockedInput);
  return {
    scenario,
    baseline,
    scenario_result: scenarioResult,
    impact: impactOf(baseline, scenarioResult),
  };
}

/**
 * Run a set of scenarios (default: the whole {@link NAMED_SCENARIOS} catalog)
 * against `base`, returning one {@link ScenarioRun} each, in the order given.
 * The baseline is recomputed per scenario but is identical across them by
 * determinism, so each run is self-contained and chartable on its own.
 */
export function runScenarioSuite(
  base: ScenarioBaseInput,
  scenarios: readonly Scenario[] = NAMED_SCENARIOS,
): ScenarioRun[] {
  return scenarios.map((s) => runScenario(base, s));
}
