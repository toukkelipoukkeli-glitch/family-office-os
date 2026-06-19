import { describe, expect, it } from "vitest";

import type { SimulationInput } from "../montecarlo/montecarlo";
import {
  applyScenario,
  type ClassifiedAsset,
  type Scenario,
  ScenarioError,
  type Shock,
  shockAssets,
  validateScenario,
} from "./scenarios";

const ASSETS: ClassifiedAsset[] = [
  { key: "vti", assetClass: "equity", value: 1_000_000, expectedReturn: 0.07, volatility: 0.16 },
  { key: "agg", assetClass: "bond", value: 500_000, expectedReturn: 0.03, volatility: 0.05 },
  { key: "savings", assetClass: "cash", value: 250_000, expectedReturn: 0.01, volatility: 0.0 },
];

function scenario(shocks: Shock[], overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: "test",
    name: "Test",
    description: "test scenario",
    shocks,
    ...overrides,
  };
}

describe("validateScenario", () => {
  it("accepts a well-formed scenario", () => {
    expect(() =>
      validateScenario(scenario([{ kind: "reprice", targets: ["equity"], amount: -0.3 }])),
    ).not.toThrow();
  });

  it("accepts a scenario with no shocks (a no-op)", () => {
    expect(() => validateScenario(scenario([]))).not.toThrow();
  });

  it("rejects an empty id", () => {
    expect(() => validateScenario(scenario([], { id: "" }))).toThrow(ScenarioError);
  });

  it("rejects a shock with no targets", () => {
    expect(() =>
      validateScenario(scenario([{ kind: "drift", targets: [], amount: 0.01 }])),
    ).toThrow(/at least one asset class/);
  });

  it("rejects a non-finite shock amount", () => {
    expect(() =>
      validateScenario(scenario([{ kind: "drift", targets: ["bond"], amount: NaN }])),
    ).toThrow(/finite/);
    expect(() =>
      validateScenario(scenario([{ kind: "drift", targets: ["bond"], amount: Infinity }])),
    ).toThrow(/finite/);
  });

  it("rejects a reprice that loses more than 100%", () => {
    expect(() =>
      validateScenario(scenario([{ kind: "reprice", targets: ["equity"], amount: -1 }])),
    ).toThrow(/> -1/);
    expect(() =>
      validateScenario(scenario([{ kind: "reprice", targets: ["equity"], amount: -1.5 }])),
    ).toThrow(/> -1/);
  });

  it("allows a reprice that loses exactly up to but not including 100%", () => {
    expect(() =>
      validateScenario(scenario([{ kind: "reprice", targets: ["equity"], amount: -0.999 }])),
    ).not.toThrow();
  });

  it("rejects a negative vol multiplier", () => {
    expect(() =>
      validateScenario(scenario([{ kind: "vol", targets: ["equity"], amount: -0.1 }])),
    ).toThrow(/>= 0/);
  });

  it("allows a zero vol multiplier (kills volatility)", () => {
    expect(() =>
      validateScenario(scenario([{ kind: "vol", targets: ["equity"], amount: 0 }])),
    ).not.toThrow();
  });
});

describe("shockAssets: reprice", () => {
  it("multiplies the value of targeted assets by (1 + amount)", () => {
    const out = shockAssets(ASSETS, scenario([
      { kind: "reprice", targets: ["equity"], amount: -0.3 },
    ]));
    expect(out[0].value).toBeCloseTo(700_000, 6);
    // untargeted assets are unchanged
    expect(out[1].value).toBe(500_000);
    expect(out[2].value).toBe(250_000);
  });

  it("can mark an asset up", () => {
    const out = shockAssets(ASSETS, scenario([
      { kind: "reprice", targets: ["equity"], amount: 0.15 },
    ]));
    expect(out[0].value).toBeCloseTo(1_150_000, 6);
  });

  it("leaves expectedReturn and volatility untouched", () => {
    const out = shockAssets(ASSETS, scenario([
      { kind: "reprice", targets: ["equity"], amount: -0.3 },
    ]));
    expect(out[0].expectedReturn).toBe(0.07);
    expect(out[0].volatility).toBe(0.16);
  });
});

describe("shockAssets: drift", () => {
  it("adds amount to expectedReturn of targeted assets", () => {
    const out = shockAssets(ASSETS, scenario([
      { kind: "drift", targets: ["cash"], amount: 0.02 },
    ]));
    expect(out[2].expectedReturn).toBeCloseTo(0.03, 9);
    expect(out[2].value).toBe(250_000); // value untouched
  });

  it("can be negative", () => {
    const out = shockAssets(ASSETS, scenario([
      { kind: "drift", targets: ["equity"], amount: -0.04 },
    ]));
    expect(out[0].expectedReturn).toBeCloseTo(0.03, 9);
  });
});

describe("shockAssets: vol", () => {
  it("multiplies volatility of targeted assets", () => {
    const out = shockAssets(ASSETS, scenario([
      { kind: "vol", targets: ["equity"], amount: 1.5 },
    ]));
    expect(out[0].volatility).toBeCloseTo(0.24, 9);
    expect(out[0].value).toBe(1_000_000); // value untouched
    expect(out[0].expectedReturn).toBe(0.07);
  });

  it("a zero multiplier removes volatility", () => {
    const out = shockAssets(ASSETS, scenario([
      { kind: "vol", targets: ["equity"], amount: 0 },
    ]));
    expect(out[0].volatility).toBe(0);
  });
});

describe("shockAssets: targeting", () => {
  it("falls back to the asset key when assetClass is omitted", () => {
    const untagged: ClassifiedAsset[] = [
      { key: "equity", value: 100, expectedReturn: 0.07, volatility: 0.16 },
    ];
    const out = shockAssets(untagged, scenario([
      { kind: "reprice", targets: ["equity"], amount: -0.5 },
    ]));
    expect(out[0].value).toBeCloseTo(50, 6);
  });

  it("applies one shock to every asset of the targeted class", () => {
    const twoEquities: ClassifiedAsset[] = [
      { key: "vti", assetClass: "equity", value: 100, expectedReturn: 0.07, volatility: 0.16 },
      { key: "aapl", assetClass: "equity", value: 200, expectedReturn: 0.07, volatility: 0.16 },
    ];
    const out = shockAssets(twoEquities, scenario([
      { kind: "reprice", targets: ["equity"], amount: -0.1 },
    ]));
    expect(out[0].value).toBeCloseTo(90, 6);
    expect(out[1].value).toBeCloseTo(180, 6);
  });

  it("can target multiple classes in one shock", () => {
    const out = shockAssets(ASSETS, scenario([
      { kind: "reprice", targets: ["equity", "bond"], amount: -0.1 },
    ]));
    expect(out[0].value).toBeCloseTo(900_000, 6);
    expect(out[1].value).toBeCloseTo(450_000, 6);
    expect(out[2].value).toBe(250_000); // cash untouched
  });
});

describe("shockAssets: composition and purity", () => {
  it("applies shocks in order; two shocks on one class compose", () => {
    const out = shockAssets(ASSETS, scenario([
      { kind: "reprice", targets: ["equity"], amount: -0.5 },
      { kind: "reprice", targets: ["equity"], amount: -0.5 },
    ]));
    // 1,000,000 * 0.5 * 0.5 = 250,000
    expect(out[0].value).toBeCloseTo(250_000, 6);
  });

  it("does not mutate the input assets", () => {
    const before = JSON.parse(JSON.stringify(ASSETS));
    shockAssets(ASSETS, scenario([
      { kind: "reprice", targets: ["equity"], amount: -0.3 },
      { kind: "vol", targets: ["equity"], amount: 2 },
      { kind: "drift", targets: ["bond"], amount: 0.02 },
    ]));
    expect(ASSETS).toEqual(before);
  });

  it("returns the same asset reference when nothing targets it", () => {
    const out = shockAssets(ASSETS, scenario([
      { kind: "reprice", targets: ["equity"], amount: -0.3 },
    ]));
    // cash was never targeted -> identical reference, cheap to detect no-op
    expect(out[2]).toBe(ASSETS[2]);
  });

  it("a no-op scenario returns equal assets", () => {
    const out = shockAssets(ASSETS, scenario([]));
    expect(out).toEqual(ASSETS);
  });

  it("validates before applying (throws on a bad shock)", () => {
    expect(() =>
      shockAssets(ASSETS, scenario([{ kind: "reprice", targets: ["equity"], amount: -2 }])),
    ).toThrow(ScenarioError);
  });
});

describe("applyScenario", () => {
  const base: SimulationInput & { assets: ClassifiedAsset[] } = {
    assets: ASSETS,
    correlation: [
      [1, -0.1, 0],
      [-0.1, 1, 0.2],
      [0, 0.2, 1],
    ],
    paths: 1000,
    horizonYears: 5,
    steps: 12,
    seed: 42,
  };

  it("carries through every non-asset field unchanged", () => {
    const out = applyScenario(base, scenario([
      { kind: "reprice", targets: ["equity"], amount: -0.3 },
    ]));
    expect(out.paths).toBe(1000);
    expect(out.horizonYears).toBe(5);
    expect(out.steps).toBe(12);
    expect(out.seed).toBe(42);
  });

  it("shocks the assets", () => {
    const out = applyScenario(base, scenario([
      { kind: "reprice", targets: ["equity"], amount: -0.3 },
    ]));
    expect(out.assets[0].value).toBeCloseTo(700_000, 6);
  });

  it("keeps the base correlation when the scenario has none", () => {
    const out = applyScenario(base, scenario([]));
    expect(out.correlation).toEqual(base.correlation);
  });

  it("lets a scenario override the correlation", () => {
    const stressed = [
      [1, 0.9, 0.9],
      [0.9, 1, 0.9],
      [0.9, 0.9, 1],
    ];
    const out = applyScenario(base, scenario([], { correlation: stressed }));
    expect(out.correlation).toEqual(stressed);
  });

  it("does not mutate the base input", () => {
    const before = JSON.parse(JSON.stringify(base));
    applyScenario(base, scenario([{ kind: "reprice", targets: ["equity"], amount: -0.3 }]));
    expect(base).toEqual(before);
  });
});
