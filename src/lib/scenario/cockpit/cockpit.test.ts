import { describe, expect, it } from "vitest";

import {
  buildCockpitModel,
  buildFanChart,
  buildWaterfall,
  CockpitError,
  COCKPIT_BASE_INPUT,
  FAN_PERCENTILES,
} from "./index";
import {
  getScenario,
  MARKET_CORRECTION,
  NAMED_SCENARIOS,
  RATE_SHOCK,
  type Scenario,
  type ScenarioBaseInput,
} from "@/lib/scenario/named";

const initialNetWorth = COCKPIT_BASE_INPUT.assets.reduce(
  (acc, a) => acc + a.value,
  0,
);

describe("FAN_PERCENTILES", () => {
  it("are strictly increasing and centred on the median", () => {
    expect([...FAN_PERCENTILES]).toEqual([5, 25, 50, 75, 95]);
  });
});

describe("buildFanChart", () => {
  const fan = buildFanChart(COCKPIT_BASE_INPUT);

  it("anchors at today's net worth at t=0 (a closed cone)", () => {
    const t0 = fan.points[0];
    expect(t0.year).toBe(0);
    expect(t0.p5).toBe(initialNetWorth);
    expect(t0.p50).toBe(initialNetWorth);
    expect(t0.p95).toBe(initialNetWorth);
    expect(fan.initialNetWorth).toBe(initialNetWorth);
  });

  it("produces one point per whole year plus t=0", () => {
    // horizon 5 → years 1..5 plus t0 = 6 points.
    expect(fan.points).toHaveLength(6);
    expect(fan.points.map((p) => p.year)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("keeps each band ordered p5 <= p25 <= p50 <= p75 <= p95", () => {
    for (const p of fan.points) {
      expect(p.p5).toBeLessThanOrEqual(p.p25);
      expect(p.p25).toBeLessThanOrEqual(p.p50);
      expect(p.p50).toBeLessThanOrEqual(p.p75);
      expect(p.p75).toBeLessThanOrEqual(p.p95);
    }
  });

  it("widens the cone over time (terminal spread > first-year spread)", () => {
    const firstYear = fan.points[1];
    const terminal = fan.points[fan.points.length - 1];
    const firstSpread = firstYear.p95 - firstYear.p5;
    const terminalSpread = terminal.p95 - terminal.p5;
    expect(terminalSpread).toBeGreaterThan(firstSpread);
  });

  it("is deterministic for a fixed seed", () => {
    const again = buildFanChart(COCKPIT_BASE_INPUT);
    expect(again.points).toEqual(fan.points);
  });

  it("rejects a non-positive horizon", () => {
    const bad: ScenarioBaseInput = { ...COCKPIT_BASE_INPUT, horizonYears: 0 };
    expect(() => buildFanChart(bad)).toThrow(CockpitError);
  });
});

describe("buildWaterfall", () => {
  it("decomposes a market correction's day-zero reprice by asset class", () => {
    const wf = buildWaterfall(COCKPIT_BASE_INPUT, MARKET_CORRECTION);
    expect(wf.scenarioId).toBe(MARKET_CORRECTION.id);
    expect(wf.initialNetWorth).toBe(initialNetWorth);

    // equity -30%, etf -30%, pe -20%, crypto -45%, bond +5% reprice → 5 steps.
    expect(wf.steps).toHaveLength(5);
    const byClass = Object.fromEntries(wf.steps.map((s) => [s.assetClass, s]));
    // equity 4.2M × -0.30 = -1.26M
    expect(byClass.equity.delta).toBeCloseTo(-1_260_000, 6);
    // etf 1.8M × -0.30 = -540k
    expect(byClass.etf.delta).toBeCloseTo(-540_000, 6);
    // pe 1.5M × -0.20 = -300k
    expect(byClass.pe.delta).toBeCloseTo(-300_000, 6);
    // crypto 0.7M × -0.45 = -315k
    expect(byClass.crypto.delta).toBeCloseTo(-315_000, 6);
    // bond 2.6M × +0.05 = +130k
    expect(byClass.bond.delta).toBeCloseTo(130_000, 6);
  });

  it("steps are cumulative and land exactly on the shocked net worth", () => {
    const wf = buildWaterfall(COCKPIT_BASE_INPUT, MARKET_CORRECTION);
    let running = wf.initialNetWorth;
    for (const step of wf.steps) {
      expect(step.runningBefore).toBeCloseTo(running, 6);
      running += step.delta;
      expect(step.runningAfter).toBeCloseTo(running, 6);
    }
    expect(wf.shockedNetWorth).toBeCloseTo(running, 6);
    // Sum of step deltas equals (shocked - initial).
    const sumDeltas = wf.steps.reduce((s, x) => s + x.delta, 0);
    expect(sumDeltas).toBeCloseTo(wf.shockedNetWorth - wf.initialNetWorth, 6);
  });

  it("skips classes a scenario does not reprice", () => {
    // Rate shock reprices bond/equity/etf/pe/crypto but NOT forest/wine/vineyard/cash.
    const wf = buildWaterfall(COCKPIT_BASE_INPUT, RATE_SHOCK);
    const classes = wf.steps.map((s) => s.assetClass);
    expect(classes).not.toContain("forest");
    expect(classes).not.toContain("wine");
    expect(classes).not.toContain("cash");
    // drift-only shocks (cash/bond carry) do not create reprice steps.
    expect(classes).toContain("bond"); // bond has a reprice shock too
  });

  it("an empty scenario produces no steps and no change", () => {
    const noop: Scenario = {
      id: "noop",
      name: "No-op",
      description: "nothing",
      shocks: [],
    };
    const wf = buildWaterfall(COCKPIT_BASE_INPUT, noop);
    expect(wf.steps).toHaveLength(0);
    expect(wf.shockedNetWorth).toBe(wf.initialNetWorth);
  });
});

describe("buildCockpitModel", () => {
  const model = buildCockpitModel(COCKPIT_BASE_INPUT);

  it("reports headline KPIs anchored on today's net worth", () => {
    expect(model.kpis.initialNetWorth).toBe(initialNetWorth);
    expect(model.kpis.probabilityOfLoss).toBeGreaterThanOrEqual(0);
    expect(model.kpis.probabilityOfLoss).toBeLessThanOrEqual(1);
    expect(Number.isFinite(model.kpis.expectedTerminal)).toBe(true);
    expect(Number.isFinite(model.kpis.valueAtRisk95)).toBe(true);
    expect(model.horizonYears).toBe(5);
  });

  it("has one tornado bar per named scenario", () => {
    expect(model.tornado.bars).toHaveLength(NAMED_SCENARIOS.length);
    const ids = model.tornado.bars.map((b) => b.scenarioId).sort();
    expect(ids).toEqual(NAMED_SCENARIOS.map((s) => s.id).sort());
  });

  it("ranks the tornado worst-first by mean impact", () => {
    const deltas = model.tornado.bars.map((b) => b.meanDelta);
    const sorted = [...deltas].sort((a, b) => a - b);
    expect(deltas).toEqual(sorted);
    // The market correction should be among the most damaging (negative).
    expect(model.tornado.bars[0].meanDelta).toBeLessThan(0);
  });

  it("a market correction is the most damaging scenario here", () => {
    // With a large equity/etf/pe/crypto book, the -30% correction dominates.
    expect(model.tornado.bars[0].scenarioId).toBe("market-correction");
    expect(model.tornado.bars[0].initialDelta).toBeLessThan(0);
    expect(model.tornado.bars[0].varDelta).toBeGreaterThan(0);
  });

  it("provides a waterfall for every named scenario", () => {
    for (const s of NAMED_SCENARIOS) {
      const wf = model.waterfalls[s.id];
      expect(wf).toBeDefined();
      expect(wf.scenarioId).toBe(s.id);
    }
  });

  it("is deterministic for a fixed seed", () => {
    const again = buildCockpitModel(COCKPIT_BASE_INPUT);
    expect(again.tornado.bars).toEqual(model.tornado.bars);
    expect(again.kpis).toEqual(model.kpis);
  });

  it("rejects an empty asset book", () => {
    const empty: ScenarioBaseInput = { ...COCKPIT_BASE_INPUT, assets: [] };
    expect(() => buildCockpitModel(empty)).toThrow(CockpitError);
  });

  it("respects a custom scenario subset", () => {
    const single = buildCockpitModel(COCKPIT_BASE_INPUT, [
      getScenario("drought"),
    ]);
    expect(single.tornado.bars).toHaveLength(1);
    expect(single.tornado.bars[0].scenarioId).toBe("drought");
  });
});
