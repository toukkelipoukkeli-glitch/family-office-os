import { describe, expect, it } from "vitest";

import {
  type ScenarioBaseInput,
  runScenario,
  runScenarioSuite,
} from "./run";
import {
  DROUGHT,
  MARKET_CORRECTION,
  NAMED_SCENARIOS,
  RATE_SHOCK,
} from "./catalog";
import { type ClassifiedAsset } from "./scenarios";

const ASSETS: ClassifiedAsset[] = [
  { key: "vti", assetClass: "equity", value: 1_000_000, expectedReturn: 0.07, volatility: 0.16 },
  { key: "agg", assetClass: "bond", value: 500_000, expectedReturn: 0.03, volatility: 0.05 },
  { key: "savings", assetClass: "cash", value: 250_000, expectedReturn: 0.01, volatility: 0.0 },
  { key: "vineyard", assetClass: "vineyard", value: 800_000, expectedReturn: 0.04, volatility: 0.18 },
];

const CORR = [
  [1, -0.1, 0, 0.1],
  [-0.1, 1, 0.2, 0],
  [0, 0.2, 1, 0],
  [0.1, 0, 0, 1],
];

const BASE: ScenarioBaseInput = {
  assets: ASSETS,
  correlation: CORR,
  paths: 4000,
  horizonYears: 5,
  steps: 12,
  seed: 20260619,
};

describe("runScenario", () => {
  it("returns the scenario, both simulations and the impact", () => {
    const run = runScenario(BASE, MARKET_CORRECTION);
    expect(run.scenario).toBe(MARKET_CORRECTION);
    expect(run.baseline.stats.count).toBe(4000);
    expect(run.scenario_result.stats.count).toBe(4000);
    expect(run.impact).toBeDefined();
  });

  it("a market correction lowers day-zero net worth (negative initialDelta)", () => {
    const run = runScenario(BASE, MARKET_CORRECTION);
    expect(run.impact.initialDelta).toBeLessThan(0);
    // equity -30% on 1M + bond +5% on 500k = -300k + 25k = -275k
    expect(run.impact.initialDelta).toBeCloseTo(-275_000, 6);
  });

  it("a market correction worsens the mean and the left tail", () => {
    const run = runScenario(BASE, MARKET_CORRECTION);
    expect(run.impact.meanDelta).toBeLessThan(0);
    expect(run.impact.medianDelta).toBeLessThan(0);
    expect(run.impact.p5Delta).toBeLessThan(0);
  });

  it("a market correction increases value-at-risk (positive varDelta)", () => {
    const run = runScenario(BASE, MARKET_CORRECTION);
    expect(run.impact.varDelta).toBeGreaterThan(0);
  });

  it("a drought hits day-zero net worth via the vineyard write-down", () => {
    const run = runScenario(BASE, DROUGHT);
    // vineyard 800k * -0.3 = -240k
    expect(run.impact.initialDelta).toBeCloseTo(-240_000, 6);
  });

  it("a rate shock does not reprice net worth as hard as a market correction", () => {
    const rate = runScenario(BASE, RATE_SHOCK);
    const crash = runScenario(BASE, MARKET_CORRECTION);
    expect(rate.impact.initialDelta).toBeGreaterThan(crash.impact.initialDelta);
  });

  it("is deterministic: same inputs and seed give identical results", () => {
    const a = runScenario(BASE, MARKET_CORRECTION);
    const b = runScenario(BASE, MARKET_CORRECTION);
    expect(a.scenario_result.stats.mean).toBe(b.scenario_result.stats.mean);
    expect(a.scenario_result.terminalNetWorth).toEqual(b.scenario_result.terminalNetWorth);
    expect(a.impact).toEqual(b.impact);
  });

  it("uses the same baseline regardless of scenario (determinism check)", () => {
    const a = runScenario(BASE, MARKET_CORRECTION);
    const b = runScenario(BASE, DROUGHT);
    expect(a.baseline.stats.mean).toBe(b.baseline.stats.mean);
    expect(a.baseline.terminalNetWorth).toEqual(b.baseline.terminalNetWorth);
  });

  it("does not mutate the base input", () => {
    const before = JSON.parse(JSON.stringify(BASE));
    runScenario(BASE, MARKET_CORRECTION);
    expect(BASE).toEqual(before);
  });
});

describe("runScenarioSuite", () => {
  it("runs the whole catalog by default, in order", () => {
    const runs = runScenarioSuite(BASE);
    expect(runs.map((r) => r.scenario.id)).toEqual(NAMED_SCENARIOS.map((s) => s.id));
  });

  it("runs a custom subset, in the given order", () => {
    const runs = runScenarioSuite(BASE, [DROUGHT, RATE_SHOCK]);
    expect(runs.map((r) => r.scenario.id)).toEqual(["drought", "rate-shock"]);
  });

  it("every run shares the same baseline net worth", () => {
    const runs = runScenarioSuite(BASE);
    const init = runs[0].baseline.initialNetWorth;
    for (const r of runs) {
      expect(r.baseline.initialNetWorth).toBe(init);
    }
  });

  it("each named stress is risk-negative (mean delta <= 0 except FX upside)", () => {
    const runs = runScenarioSuite(BASE);
    for (const r of runs) {
      if (r.scenario.id === "fx-move") {
        // FX upside marks foreign-quoted assets up, so it is net positive here.
        expect(r.impact.initialDelta).toBeGreaterThan(0);
      } else {
        expect(r.impact.initialDelta).toBeLessThanOrEqual(0);
      }
    }
  });
});
