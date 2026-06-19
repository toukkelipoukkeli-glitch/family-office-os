/**
 * Scenario-cockpit view model.
 *
 * This module is the *oracle* behind the scenario-cockpit page: it turns the
 * scenario engine (Monte Carlo simulator + named-scenario suite + liquidity
 * analysis) into a small, fully deterministic, plain-data view model that the
 * React page renders as fan charts, a tornado chart, and a funding waterfall.
 * Keeping every derivation here (and out of the components) means the visuals
 * have a machine-checkable test surface.
 *
 * Three derived views:
 *
 *  - **Fan chart** — a projection cone of total net worth over the horizon. We
 *    build it by simulating the *same* book at increasing horizons (on one
 *    fixed seed) and reading the p5/p25/p50/p75/p95 percentile band at each
 *    step, anchored at t=0 on today's net worth.
 *  - **Tornado chart** — the named scenarios ranked by their impact on mean
 *    terminal net worth (most damaging first), the classic "what hurts most"
 *    sensitivity bar chart.
 *  - **Waterfall** — for a selected scenario, the day-zero repricing decomposed
 *    by asset class: start at baseline net worth, step down/up per shocked
 *    class, and land on the shocked net worth.
 *
 * Pure, deterministic, offline. READ-ONLY product: it projects hypothetical
 * outcomes for planning and reporting; nothing here moves money.
 */

import { assetClassLabel, type AssetClass } from "@/lib/model/asset-class";
import {
  type SimulationInput,
  type SimulationResult,
  simulateNetWorth,
  valueAtRisk,
  percentileSorted,
} from "@/lib/scenario/montecarlo";
import {
  applyScenario,
  NAMED_SCENARIOS,
  type ClassifiedAsset,
  type Scenario,
  type ScenarioBaseInput,
} from "@/lib/scenario/named";

/** Thrown when cockpit inputs are structurally invalid. */
export class CockpitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CockpitError";
  }
}

/** Percentile points the fan chart reports, low → high. */
export const FAN_PERCENTILES = [5, 25, 50, 75, 95] as const;

/** One point on the fan chart: the percentile band of net worth at a horizon. */
export interface FanPoint {
  /** Years from today (0 = now). */
  readonly year: number;
  /** 5th percentile (pessimistic) net worth at this horizon. */
  readonly p5: number;
  /** 25th percentile. */
  readonly p25: number;
  /** Median (p50) net worth. */
  readonly p50: number;
  /** 75th percentile. */
  readonly p75: number;
  /** 95th percentile (optimistic) net worth. */
  readonly p95: number;
}

/** A net-worth projection fan over the horizon. */
export interface FanChartModel {
  /** Net worth today (t=0 anchor of every band). */
  readonly initialNetWorth: number;
  /** Percentile bands at each yearly step, including t=0. */
  readonly points: readonly FanPoint[];
}

/** One bar of the tornado chart: a scenario's impact on mean terminal net worth. */
export interface TornadoBar {
  readonly scenarioId: string;
  readonly scenarioName: string;
  /** Signed change in mean terminal net worth vs. baseline (negative = worse). */
  readonly meanDelta: number;
  /** Signed day-zero repricing of net worth under the scenario. */
  readonly initialDelta: number;
  /** Change in 95% value-at-risk (positive = the tail loss got bigger). */
  readonly varDelta: number;
}

/** The tornado chart: scenarios ranked by absolute mean impact, worst first. */
export interface TornadoModel {
  /** Bars ordered by descending absolute mean impact. */
  readonly bars: readonly TornadoBar[];
}

/** One step of the day-zero repricing waterfall, by asset class. */
export interface WaterfallStep {
  readonly assetClass: AssetClass;
  readonly label: string;
  /** Signed value change for this asset class from the day-zero reprice shocks. */
  readonly delta: number;
  /** Cumulative net worth *before* this step is applied. */
  readonly runningBefore: number;
  /** Cumulative net worth *after* this step is applied. */
  readonly runningAfter: number;
}

/** The day-zero repricing waterfall for one scenario. */
export interface WaterfallModel {
  readonly scenarioId: string;
  readonly scenarioName: string;
  /** Net worth today, before any shock. */
  readonly initialNetWorth: number;
  /** Net worth after the scenario's day-zero reprice shocks. */
  readonly shockedNetWorth: number;
  /** The per-asset-class repricing steps (only classes that actually moved). */
  readonly steps: readonly WaterfallStep[];
}

/** Headline KPIs for the cockpit, computed from the baseline simulation. */
export interface CockpitKpis {
  /** Net worth today. */
  readonly initialNetWorth: number;
  /** Expected (mean) terminal net worth over the horizon. */
  readonly expectedTerminal: number;
  /** Median terminal net worth. */
  readonly medianTerminal: number;
  /** 95% value-at-risk of terminal net worth (loss vs. today; >0 = a loss). */
  readonly valueAtRisk95: number;
  /** Probability terminal net worth ends below today's (0..1). */
  readonly probabilityOfLoss: number;
}

/** The complete cockpit view model. */
export interface CockpitModel {
  readonly horizonYears: number;
  readonly kpis: CockpitKpis;
  readonly fan: FanChartModel;
  readonly tornado: TornadoModel;
  /** One ready-to-render waterfall per named scenario, keyed by scenario id. */
  readonly waterfalls: Readonly<Record<string, WaterfallModel>>;
}

const VAR_LEVEL = 0.95;

/** Sum of asset values at t=0. */
function sumValues(assets: readonly ClassifiedAsset[]): number {
  return assets.reduce((acc, a) => acc + a.value, 0);
}

/**
 * Build the net-worth fan by simulating `base` at 1..horizon-year horizons on a
 * shared seed and reading the percentile band at each. The t=0 band is a
 * degenerate point at today's net worth (the cone starts closed). Each per-year
 * run keeps the same per-step `dt` (so volatility accumulates consistently) by
 * scaling `steps` with the horizon.
 */
export function buildFanChart(base: ScenarioBaseInput): FanChartModel {
  const horizon = base.horizonYears ?? 1;
  if (!(horizon > 0) || !Number.isFinite(horizon)) {
    throw new CockpitError(`horizonYears must be positive, got ${horizon}`);
  }
  const totalSteps = base.steps ?? 1;
  if (!(totalSteps > 0) || !Number.isFinite(totalSteps)) {
    throw new CockpitError(`steps must be positive, got ${totalSteps}`);
  }
  const initialNetWorth = sumValues(base.assets);

  const points: FanPoint[] = [
    {
      year: 0,
      p5: initialNetWorth,
      p25: initialNetWorth,
      p50: initialNetWorth,
      p75: initialNetWorth,
      p95: initialNetWorth,
    },
  ];

  // Whole-year horizons up to and including the full horizon.
  const years = Math.max(1, Math.round(horizon));
  for (let y = 1; y <= years; y++) {
    const frac = y / years;
    const stepsForYear = Math.max(1, Math.round(totalSteps * frac));
    const result = simulateNetWorth({
      ...base,
      horizonYears: horizon * frac,
      steps: stepsForYear,
    });
    const sorted = result.terminalNetWorth;
    points.push({
      year: Math.round(horizon * frac * 100) / 100,
      p5: percentileSorted(sorted, 5),
      p25: percentileSorted(sorted, 25),
      p50: percentileSorted(sorted, 50),
      p75: percentileSorted(sorted, 75),
      p95: percentileSorted(sorted, 95),
    });
  }

  return { initialNetWorth, points };
}

/** The class label a shock matches an asset against (mirrors the scenario engine). */
function classOf(asset: ClassifiedAsset): string {
  return asset.assetClass ?? asset.key;
}

/**
 * Decompose a scenario's **day-zero reprice** shocks into a per-asset-class
 * waterfall. Only `reprice` shocks move net worth on day zero (drift/vol bend
 * the future, not the starting value), so the waterfall sums exactly to the
 * shocked initial net worth. Steps are ordered by the asset order in `base`.
 */
export function buildWaterfall(
  base: ScenarioBaseInput,
  scenario: Scenario,
): WaterfallModel {
  const initialNetWorth = sumValues(base.assets);

  // Net reprice multiplier per asset class: compose every reprice shock that
  // targets the class (reprice multiplies, so we accumulate the product).
  const multiplierByClass = new Map<string, number>();
  for (const shock of scenario.shocks) {
    if (shock.kind !== "reprice") continue;
    for (const target of shock.targets) {
      const prev = multiplierByClass.get(target) ?? 1;
      multiplierByClass.set(target, prev * (1 + shock.amount));
    }
  }

  // Aggregate base value and shocked value per asset class, in asset order.
  const order: string[] = [];
  const baseValueByClass = new Map<string, number>();
  const shockedValueByClass = new Map<string, number>();
  for (const asset of base.assets) {
    const cls = classOf(asset);
    if (!baseValueByClass.has(cls)) order.push(cls);
    baseValueByClass.set(cls, (baseValueByClass.get(cls) ?? 0) + asset.value);
    const mult = multiplierByClass.get(cls) ?? 1;
    shockedValueByClass.set(
      cls,
      (shockedValueByClass.get(cls) ?? 0) + asset.value * mult,
    );
  }

  const steps: WaterfallStep[] = [];
  let running = initialNetWorth;
  for (const cls of order) {
    const delta =
      (shockedValueByClass.get(cls) ?? 0) - (baseValueByClass.get(cls) ?? 0);
    if (delta === 0) continue; // class not repriced — skip for a clean chart
    const before = running;
    running += delta;
    steps.push({
      assetClass: cls as AssetClass,
      label: assetClassLabel(cls as AssetClass),
      delta,
      runningBefore: before,
      runningAfter: running,
    });
  }

  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    initialNetWorth,
    shockedNetWorth: running,
    steps,
  };
}

/**
 * Run a scenario's baseline-vs-shocked simulation pair and produce a single
 * tornado bar (its mean / initial / VaR deltas). The baseline is supplied so
 * the suite computes it once.
 */
function tornadoBarFor(
  base: ScenarioBaseInput,
  scenario: Scenario,
  baseline: SimulationResult,
): TornadoBar {
  const shockedInput: SimulationInput = applyScenario(base, scenario);
  const shocked = simulateNetWorth(shockedInput);
  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    meanDelta: shocked.stats.mean - baseline.stats.mean,
    initialDelta: shocked.initialNetWorth - baseline.initialNetWorth,
    varDelta: valueAtRisk(shocked, VAR_LEVEL) - valueAtRisk(baseline, VAR_LEVEL),
  };
}

/**
 * Build the whole cockpit view model from a classified base input and a set of
 * named scenarios (default: the standing catalog).
 *
 * Deterministic in `base.seed`. The tornado is sorted worst-first (most negative
 * mean impact). Throws {@link CockpitError} on invalid structure.
 */
export function buildCockpitModel(
  base: ScenarioBaseInput,
  scenarios: readonly Scenario[] = NAMED_SCENARIOS,
): CockpitModel {
  if (base.assets.length === 0) {
    throw new CockpitError("cockpit requires at least one asset");
  }
  const horizonYears = base.horizonYears ?? 1;
  const baseline = simulateNetWorth(base);

  const kpis: CockpitKpis = {
    initialNetWorth: baseline.initialNetWorth,
    expectedTerminal: baseline.stats.mean,
    medianTerminal: baseline.stats.median,
    valueAtRisk95: valueAtRisk(baseline, VAR_LEVEL),
    probabilityOfLoss: baseline.probabilityOfLoss,
  };

  const bars = scenarios
    .map((s) => tornadoBarFor(base, s, baseline))
    // Worst (most negative mean impact) first; ties broken by VaR then name.
    .sort((a, b) => {
      if (a.meanDelta !== b.meanDelta) return a.meanDelta - b.meanDelta;
      if (a.varDelta !== b.varDelta) return b.varDelta - a.varDelta;
      return a.scenarioName.localeCompare(b.scenarioName);
    });

  const waterfalls: Record<string, WaterfallModel> = {};
  for (const s of scenarios) {
    waterfalls[s.id] = buildWaterfall(base, s);
  }

  return {
    horizonYears,
    kpis,
    fan: buildFanChart(base),
    tornado: { bars },
    waterfalls,
  };
}
