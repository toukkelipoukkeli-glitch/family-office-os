/**
 * Adversarial edge-case coverage for the historical stress library.
 *
 * These probe the boundaries the happy-path tests skip: validator edges
 * (exact-0 / exact-(-1) drawdowns, NaN metadata, empty id), an unknown-id
 * lookup, and the view model on a degenerate one-asset book. Independent of the
 * worker's own suite; everything is pure, deterministic and offline.
 */

import { describe, expect, it } from "vitest";

import type { ClassifiedAsset, ScenarioBaseInput } from "@/lib/scenario/named";

import {
  buildStressModel,
  GFC_2008,
  getHistoricalScenario,
  StressError,
  validateHistoricalScenario,
} from "./index";
import { STRESS_BASE_INPUT } from "./fixtures";

describe("validateHistoricalScenario — boundaries", () => {
  it("accepts a peakToTrough of exactly 0 (flat) and exactly -1 (wipeout)", () => {
    expect(() =>
      validateHistoricalScenario({ ...GFC_2008, peakToTrough: 0 }),
    ).not.toThrow();
    expect(() =>
      validateHistoricalScenario({ ...GFC_2008, peakToTrough: -1 }),
    ).not.toThrow();
  });

  it("rejects a NaN peakToTrough (comparison-based guard, not a range check)", () => {
    expect(() =>
      validateHistoricalScenario({ ...GFC_2008, peakToTrough: Number.NaN }),
    ).toThrow(StressError);
  });

  it("accepts a recoveryMonths of exactly 0 but rejects NaN/Infinity", () => {
    expect(() =>
      validateHistoricalScenario({ ...GFC_2008, recoveryMonths: 0 }),
    ).not.toThrow();
    expect(() =>
      validateHistoricalScenario({ ...GFC_2008, recoveryMonths: Number.NaN }),
    ).toThrow(/recoveryMonths/);
    expect(() =>
      validateHistoricalScenario({
        ...GFC_2008,
        recoveryMonths: Number.POSITIVE_INFINITY,
      }),
    ).toThrow(/recoveryMonths/);
  });

  it("rejects an empty id", () => {
    expect(() =>
      validateHistoricalScenario({ ...GFC_2008, id: "" }),
    ).toThrow(/non-empty id/);
  });

  it("accepts a same-day window (start === end)", () => {
    expect(() =>
      validateHistoricalScenario({
        ...GFC_2008,
        window: { start: "2008-09-15", end: "2008-09-15" },
      }),
    ).not.toThrow();
  });
});

describe("getHistoricalScenario — error message", () => {
  it("lists the known ids when given an unknown one", () => {
    expect(() => getHistoricalScenario("2008")).toThrow(/known: /);
    expect(() => getHistoricalScenario("2008")).toThrow(/gfc-2008/);
  });
});

describe("buildStressModel — degenerate book", () => {
  const oneAsset: ClassifiedAsset = {
    key: "only-equity",
    assetClass: "equity",
    value: 1_000_000,
    expectedReturn: 0.07,
    volatility: 0.17,
  };
  const base: ScenarioBaseInput = {
    ...STRESS_BASE_INPUT,
    assets: [oneAsset],
    correlation: [[1]],
  };

  it("runs on a single-asset book and reports a coherent drawdown", () => {
    const model = buildStressModel(base);
    expect(model.netWorthToday).toBe(1_000_000);
    for (const r of model.results) {
      // before is the whole (single-asset) book.
      expect(r.netWorthBefore).toBe(1_000_000);
      // every episode reprices equities down, so after < before.
      expect(r.netWorthAfter).toBeLessThan(r.netWorthBefore);
      // drawdownPct is bounded for a non-zero book.
      expect(r.drawdownPct).toBeGreaterThan(-1);
      expect(r.drawdownPct).toBeLessThan(0);
    }
  });

  it("is still sorted worst-drawdown first on the single-asset book", () => {
    const drawdowns = buildStressModel(base).results.map((r) => r.drawdown);
    expect(drawdowns).toEqual([...drawdowns].sort((a, b) => a - b));
  });
});
