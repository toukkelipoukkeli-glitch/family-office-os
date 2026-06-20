import { describe, expect, it } from "vitest";

import { simulateNetWorth } from "@/lib/scenario/montecarlo";
import { applyScenario } from "@/lib/scenario/named";

import {
  buildStressModel,
  buildStressResult,
  GFC_2008,
  HISTORICAL_SCENARIOS,
  STRESS_BASE_INPUT,
  StressModelError,
} from "./index";

const netWorthToday = STRESS_BASE_INPUT.assets.reduce(
  (acc, a) => acc + a.value,
  0,
);

describe("buildStressModel", () => {
  const model = buildStressModel(STRESS_BASE_INPUT);

  it("reports today's net worth as the sum of the book", () => {
    expect(model.netWorthToday).toBe(netWorthToday);
  });

  it("carries the recovery horizon through", () => {
    expect(model.horizonYears).toBe(STRESS_BASE_INPUT.horizonYears);
  });

  it("produces one result per historical scenario", () => {
    expect(model.results).toHaveLength(HISTORICAL_SCENARIOS.length);
    const ids = new Set(model.results.map((r) => r.scenario.id));
    for (const s of HISTORICAL_SCENARIOS) expect(ids.has(s.id)).toBe(true);
  });

  it("orders results worst-drawdown first", () => {
    const drawdowns = model.results.map((r) => r.drawdown);
    const sorted = [...drawdowns].sort((a, b) => a - b);
    expect(drawdowns).toEqual(sorted);
    // The deepest is the GFC with this book (−55% equities, −24% PE, …).
    expect(model.results[0].scenario.id).toBe("gfc-2008");
  });

  it("every scenario is a real drawdown (after < before, negative pct)", () => {
    for (const r of model.results) {
      expect(r.netWorthAfter).toBeLessThan(r.netWorthBefore);
      expect(r.drawdown).toBeLessThan(0);
      expect(r.drawdownPct).toBeLessThan(0);
      // before is shared today's net worth.
      expect(r.netWorthBefore).toBe(netWorthToday);
      // drawdown reconciles exactly with after - before.
      expect(r.drawdown).toBeCloseTo(r.netWorthAfter - r.netWorthBefore, 6);
      // pct reconciles with the absolute drawdown.
      expect(r.drawdownPct).toBeCloseTo(r.drawdown / r.netWorthBefore, 9);
    }
  });

  it("the waterfall sums to the shocked net worth (after)", () => {
    for (const r of model.results) {
      const wf = r.waterfall;
      const summed =
        wf.initialNetWorth + wf.steps.reduce((acc, s) => acc + s.delta, 0);
      expect(summed).toBeCloseTo(wf.shockedNetWorth, 4);
      expect(wf.shockedNetWorth).toBeCloseTo(r.netWorthAfter, 6);
    }
  });

  it("forward impact degrades the distribution and raises tail risk", () => {
    for (const r of model.results) {
      // A crash drags the whole forward distribution lower.
      expect(r.forward.meanDelta).toBeLessThan(0);
      expect(r.forward.medianDelta).toBeLessThan(0);
      expect(r.forward.p5Delta).toBeLessThan(0);
      // probabilityOfLoss is a valid fraction.
      expect(r.forward.probabilityOfLoss).toBeGreaterThanOrEqual(0);
      expect(r.forward.probabilityOfLoss).toBeLessThanOrEqual(1);
    }
  });

  it("is deterministic for a fixed seed", () => {
    const again = buildStressModel(STRESS_BASE_INPUT);
    expect(again.results.map((r) => r.drawdown)).toEqual(
      model.results.map((r) => r.drawdown),
    );
    expect(again.results.map((r) => r.forward.meanDelta)).toEqual(
      model.results.map((r) => r.forward.meanDelta),
    );
  });

  it("throws on an empty book", () => {
    expect(() =>
      buildStressModel({ ...STRESS_BASE_INPUT, assets: [] }),
    ).toThrow(StressModelError);
  });
});

describe("buildStressResult", () => {
  const baseline = simulateNetWorth(STRESS_BASE_INPUT);

  it("its forward deltas match an independent shocked simulation", () => {
    const r = buildStressResult(STRESS_BASE_INPUT, GFC_2008, baseline);
    const shocked = simulateNetWorth(applyScenario(STRESS_BASE_INPUT, GFC_2008));
    expect(r.forward.meanDelta).toBeCloseTo(
      shocked.stats.mean - baseline.stats.mean,
      6,
    );
    expect(r.forward.probabilityOfLoss).toBe(shocked.probabilityOfLoss);
  });

  it("the day-zero drawdown is independent of the random seed (reprice only)", () => {
    const a = buildStressResult(STRESS_BASE_INPUT, GFC_2008, baseline);
    const b = buildStressResult(
      { ...STRESS_BASE_INPUT, seed: STRESS_BASE_INPUT.seed + 1 },
      GFC_2008,
      simulateNetWorth({ ...STRESS_BASE_INPUT, seed: STRESS_BASE_INPUT.seed + 1 }),
    );
    expect(a.drawdown).toBe(b.drawdown);
    expect(a.netWorthAfter).toBe(b.netWorthAfter);
  });
});
