import { describe, expect, it } from "vitest";

import { ASSET_CLASSES, type AssetClass } from "../../model/asset-class";
import {
  DROUGHT,
  FX_MOVE,
  getScenario,
  MARKET_CORRECTION,
  NAMED_SCENARIOS,
  RATE_SHOCK,
  SCENARIO_RATIONALE,
} from "./catalog";
import {
  type ClassifiedAsset,
  ScenarioError,
  shockAssets,
  validateScenario,
} from "./scenarios";

/** One holding per asset class, so every shock target is exercised. */
const BOOK: ClassifiedAsset[] = ASSET_CLASSES.map((c) => ({
  key: c,
  assetClass: c,
  value: 100_000,
  expectedReturn: 0.05,
  volatility: 0.2,
}));

function byClass(assets: readonly ClassifiedAsset[]): Record<string, ClassifiedAsset> {
  return Object.fromEntries(assets.map((a) => [a.assetClass ?? a.key, a]));
}

const ASSET_CLASS_SET = new Set<string>(ASSET_CLASSES);

describe("catalog: structure", () => {
  it("exposes exactly the four named scenarios", () => {
    expect(NAMED_SCENARIOS.map((s) => s.id)).toEqual([
      "rate-shock",
      "fx-move",
      "drought",
      "market-correction",
    ]);
  });

  it("every scenario is structurally valid", () => {
    for (const s of NAMED_SCENARIOS) {
      expect(() => validateScenario(s)).not.toThrow();
    }
  });

  it("every scenario has a unique id, a name and a description", () => {
    const ids = new Set<string>();
    for (const s of NAMED_SCENARIOS) {
      expect(s.id).toBeTruthy();
      expect(s.name).toBeTruthy();
      expect(s.description).toBeTruthy();
      expect(ids.has(s.id)).toBe(false);
      ids.add(s.id);
    }
  });

  it("every scenario has a documented rationale", () => {
    for (const s of NAMED_SCENARIOS) {
      expect(SCENARIO_RATIONALE[s.id]).toBeTruthy();
    }
  });

  it("every shock target is a real asset class", () => {
    for (const s of NAMED_SCENARIOS) {
      for (const shock of s.shocks) {
        for (const t of shock.targets) {
          expect(ASSET_CLASS_SET.has(t)).toBe(true);
        }
      }
    }
  });
});

describe("catalog: getScenario", () => {
  it("returns the scenario for a known id", () => {
    expect(getScenario("drought")).toBe(DROUGHT);
    expect(getScenario("rate-shock")).toBe(RATE_SHOCK);
  });

  it("throws ScenarioError for an unknown id", () => {
    expect(() => getScenario("nope")).toThrow(ScenarioError);
    expect(() => getScenario("nope")).toThrow(/unknown scenario id/);
  });
});

describe("RATE_SHOCK", () => {
  const out = byClass(shockAssets(BOOK, RATE_SHOCK));

  it("marks bonds down the hardest of the repriced classes", () => {
    expect(out.bond.value).toBeLessThan(100_000);
    expect(out.bond.value).toBeLessThan(out.equity.value);
  });

  it("marks equities, ETFs, PE and crypto down", () => {
    for (const c of ["equity", "etf", "pe", "crypto"] as AssetClass[]) {
      expect(out[c].value).toBeLessThan(100_000);
    }
  });

  it("lifts forward carry on cash and bonds (drift up)", () => {
    expect(out.cash.expectedReturn).toBeGreaterThan(0.05);
    expect(out.bond.expectedReturn).toBeGreaterThan(0.05);
  });

  it("leaves real assets (forest, vineyard, wine) untouched", () => {
    for (const c of ["forest", "vineyard", "wine"] as AssetClass[]) {
      expect(out[c].value).toBe(100_000);
      expect(out[c].expectedReturn).toBe(0.05);
    }
  });
});

describe("FX_MOVE", () => {
  const out = byClass(shockAssets(BOOK, FX_MOVE));

  it("marks foreign-quoted liquid assets up by 15%", () => {
    for (const c of ["equity", "etf", "crypto"] as AssetClass[]) {
      expect(out[c].value).toBeCloseTo(115_000, 6);
    }
  });

  it("bumps the volatility of the FX-exposed assets", () => {
    expect(out.equity.volatility).toBeGreaterThan(0.2);
  });

  it("leaves cash and domestic real assets flat", () => {
    for (const c of ["cash", "forest", "vineyard"] as AssetClass[]) {
      expect(out[c].value).toBe(100_000);
    }
  });
});

describe("DROUGHT", () => {
  const out = byClass(shockAssets(BOOK, DROUGHT));

  it("writes the vineyard down the most", () => {
    expect(out.vineyard.value).toBeLessThan(out.forest.value);
    expect(out.forest.value).toBeLessThan(100_000);
    expect(out.wine.value).toBeLessThan(100_000);
  });

  it("slows farmland growth (drift down) and widens its vol", () => {
    expect(out.vineyard.expectedReturn).toBeLessThan(0.05);
    expect(out.forest.expectedReturn).toBeLessThan(0.05);
    expect(out.vineyard.volatility).toBeGreaterThan(0.2);
  });

  it("leaves financial assets entirely untouched", () => {
    for (const c of ["equity", "bond", "cash", "etf", "crypto", "pe"] as AssetClass[]) {
      expect(out[c].value).toBe(100_000);
      expect(out[c].expectedReturn).toBe(0.05);
      expect(out[c].volatility).toBe(0.2);
    }
  });
});

describe("MARKET_CORRECTION", () => {
  const out = byClass(shockAssets(BOOK, MARKET_CORRECTION));

  it("takes equities/ETFs down ~30%", () => {
    expect(out.equity.value).toBeCloseTo(70_000, 6);
    expect(out.etf.value).toBeCloseTo(70_000, 6);
  });

  it("takes crypto down more and PE down less than equities", () => {
    expect(out.crypto.value).toBeLessThan(out.equity.value);
    expect(out.pe.value).toBeGreaterThan(out.equity.value);
    expect(out.pe.value).toBeLessThan(100_000);
  });

  it("rallies high-grade bonds (flight to quality)", () => {
    expect(out.bond.value).toBeGreaterThan(100_000);
  });

  it("spikes volatility across risk assets", () => {
    for (const c of ["equity", "etf", "crypto", "pe"] as AssetClass[]) {
      expect(out[c].volatility).toBeGreaterThan(0.2);
    }
  });
});
