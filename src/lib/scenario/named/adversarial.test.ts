import { describe, expect, it } from "vitest";

import { simulateNetWorth } from "../montecarlo/montecarlo";
import { MARKET_CORRECTION } from "./catalog";
import { type ScenarioBaseInput, runScenario } from "./run";
import {
  applyScenario,
  type ClassifiedAsset,
  type Scenario,
  ScenarioError,
  type Shock,
  shockAssets,
} from "./scenarios";

const ASSETS: ClassifiedAsset[] = [
  { key: "vti", assetClass: "equity", value: 1_000_000, expectedReturn: 0.07, volatility: 0.16 },
  { key: "agg", assetClass: "bond", value: 500_000, expectedReturn: 0.03, volatility: 0.05 },
  { key: "savings", assetClass: "cash", value: 250_000, expectedReturn: 0.01, volatility: 0.0 },
];

function scenario(shocks: Shock[], overrides: Partial<Scenario> = {}): Scenario {
  return { id: "adv", name: "Adv", description: "adversarial", shocks, ...overrides };
}

describe("adversarial: shock composition across kinds", () => {
  it("reprice, then vol, then drift on the same class all compose independently", () => {
    const out = shockAssets(ASSETS, scenario([
      { kind: "reprice", targets: ["equity"], amount: -0.5 },
      { kind: "vol", targets: ["equity"], amount: 2 },
      { kind: "drift", targets: ["equity"], amount: 0.03 },
    ]));
    expect(out[0].value).toBeCloseTo(500_000, 6);
    expect(out[0].volatility).toBeCloseTo(0.32, 9);
    expect(out[0].expectedReturn).toBeCloseTo(0.1, 9);
  });

  it("a later shock sees the value a prior reprice produced (order matters)", () => {
    // -50% then +100% => back to original, proving they chain rather than sum.
    const out = shockAssets(ASSETS, scenario([
      { kind: "reprice", targets: ["equity"], amount: -0.5 },
      { kind: "reprice", targets: ["equity"], amount: 1 },
    ]));
    expect(out[0].value).toBeCloseTo(1_000_000, 6);
  });
});

describe("adversarial: targeting edge cases", () => {
  it("duplicate targets in one shock apply the shock only once", () => {
    const out = shockAssets(ASSETS, scenario([
      { kind: "reprice", targets: ["equity", "equity", "equity"], amount: -0.1 },
    ]));
    // single -10%, not stacked
    expect(out[0].value).toBeCloseTo(900_000, 6);
  });

  it("a shock targeting a class no asset has is a silent no-op", () => {
    const out = shockAssets(ASSETS, scenario([
      { kind: "reprice", targets: ["wine"], amount: -0.9 },
    ]));
    expect(out).toEqual(ASSETS);
    // untargeted assets keep their identity
    expect(out[0]).toBe(ASSETS[0]);
  });

  it("a vol multiplier of exactly 1 leaves volatility numerically unchanged", () => {
    const out = shockAssets(ASSETS, scenario([
      { kind: "vol", targets: ["equity"], amount: 1 },
    ]));
    expect(out[0].volatility).toBe(0.16);
  });
});

describe("adversarial: applyScenario correlation precedence", () => {
  const baseNoCorr: ScenarioBaseInput = {
    assets: ASSETS,
    paths: 100,
    horizonYears: 1,
    steps: 1,
    seed: 7,
  };

  it("adds the scenario correlation when the base had none", () => {
    const stressed = [
      [1, 0.9, 0.9],
      [0.9, 1, 0.9],
      [0.9, 0.9, 1],
    ];
    const out = applyScenario(baseNoCorr, scenario([], { correlation: stressed }));
    expect(out.correlation).toEqual(stressed);
  });

  it("omits correlation entirely when neither base nor scenario supplies one", () => {
    const out = applyScenario(baseNoCorr, scenario([]));
    expect("correlation" in out).toBe(false);
  });
});

describe("adversarial: runScenario invariants", () => {
  const BASE: ScenarioBaseInput = {
    assets: ASSETS,
    correlation: [
      [1, -0.1, 0],
      [-0.1, 1, 0.2],
      [0, 0.2, 1],
    ],
    paths: 2000,
    horizonYears: 5,
    steps: 12,
    seed: 20260620,
  };

  it("the baseline matches a direct simulateNetWorth call (no hidden shock)", () => {
    const run = runScenario(BASE, MARKET_CORRECTION);
    const direct = simulateNetWorth(BASE);
    expect(run.baseline.stats.mean).toBe(direct.stats.mean);
    expect(run.baseline.initialNetWorth).toBe(direct.initialNetWorth);
  });

  it("a no-op scenario has zero impact on every delta", () => {
    const run = runScenario(BASE, scenario([]));
    expect(run.impact.initialDelta).toBe(0);
    expect(run.impact.meanDelta).toBe(0);
    expect(run.impact.medianDelta).toBe(0);
    expect(run.impact.p5Delta).toBe(0);
    expect(run.impact.varDelta).toBe(0);
  });

  it("a scenario-level correlation override flows through into the shocked run", () => {
    const stressed = [
      [1, 0.95, 0.95],
      [0.95, 1, 0.95],
      [0.95, 0.95, 1],
    ];
    const withCorr = runScenario(BASE, scenario([], { correlation: stressed }));
    const withoutCorr = runScenario(BASE, scenario([]));
    // Same shocks (none) but different correlation => the shocked distribution
    // must differ from the base-correlation no-op run.
    expect(withCorr.scenario_result.stats.mean).not.toBe(
      withoutCorr.scenario_result.stats.mean,
    );
  });

  it("propagates a ScenarioError from an invalid shock", () => {
    expect(() =>
      runScenario(BASE, scenario([{ kind: "reprice", targets: ["equity"], amount: -1 }])),
    ).toThrow(ScenarioError);
  });
});
