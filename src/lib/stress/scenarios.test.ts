import { describe, expect, it } from "vitest";

import { validateScenario } from "@/lib/scenario/named";

import {
  COVID_2020,
  GFC_2008,
  getHistoricalScenario,
  HISTORICAL_SCENARIOS,
  RATE_SHOCK_2022,
  StressError,
  validateHistoricalScenario,
  type HistoricalScenario,
} from "./index";

describe("HISTORICAL_SCENARIOS", () => {
  it("contains the three named episodes with unique ids", () => {
    const ids = HISTORICAL_SCENARIOS.map((s) => s.id);
    expect(ids).toEqual(["rate-shock-2022", "covid-2020", "gfc-2008"]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("each scenario is a valid engine Scenario (shocks pass the engine validator)", () => {
    for (const s of HISTORICAL_SCENARIOS) {
      expect(() => validateScenario(s)).not.toThrow();
    }
  });

  it("each scenario passes historical-provenance validation", () => {
    for (const s of HISTORICAL_SCENARIOS) {
      expect(() => validateHistoricalScenario(s)).not.toThrow();
    }
  });

  it("each scenario carries a non-empty source list and a coherent window", () => {
    for (const s of HISTORICAL_SCENARIOS) {
      expect(s.sources.length).toBeGreaterThan(0);
      expect(Date.parse(s.window.end)).toBeGreaterThanOrEqual(
        Date.parse(s.window.start),
      );
      // Headline drawdown is a real loss in [-1, 0].
      expect(s.peakToTrough).toBeLessThan(0);
      expect(s.peakToTrough).toBeGreaterThanOrEqual(-1);
    }
  });
});

describe("calibration sanity", () => {
  it("the GFC is the deepest equity reprice of the three", () => {
    const eqReprice = (s: HistoricalScenario) =>
      s.shocks.find(
        (sh) => sh.kind === "reprice" && sh.targets.includes("equity"),
      )?.amount ?? 0;
    expect(eqReprice(GFC_2008)).toBeLessThan(eqReprice(COVID_2020));
    expect(eqReprice(GFC_2008)).toBeLessThan(eqReprice(RATE_SHOCK_2022));
  });

  it("2008 and 2020 rally bonds (flight-to-quality); 2022 sells them off", () => {
    const bondReprice = (s: HistoricalScenario) =>
      s.shocks.find(
        (sh) => sh.kind === "reprice" && sh.targets.includes("bond"),
      )?.amount ?? 0;
    expect(bondReprice(GFC_2008)).toBeGreaterThan(0);
    expect(bondReprice(RATE_SHOCK_2022)).toBeLessThan(0);
  });

  it("crypto is always hit at least as hard as equities in each episode", () => {
    for (const s of HISTORICAL_SCENARIOS) {
      const eq =
        s.shocks.find(
          (sh) => sh.kind === "reprice" && sh.targets.includes("equity"),
        )?.amount ?? 0;
      const crypto =
        s.shocks.find(
          (sh) => sh.kind === "reprice" && sh.targets.includes("crypto"),
        )?.amount ?? 0;
      expect(crypto).toBeLessThanOrEqual(eq);
    }
  });
});

describe("getHistoricalScenario", () => {
  it("returns the scenario for a known id", () => {
    expect(getHistoricalScenario("gfc-2008")).toBe(GFC_2008);
    expect(getHistoricalScenario("covid-2020")).toBe(COVID_2020);
  });

  it("throws StressError for an unknown id", () => {
    expect(() => getHistoricalScenario("nope")).toThrow(StressError);
    expect(() => getHistoricalScenario("nope")).toThrow(/unknown historical scenario/);
  });
});

describe("validateHistoricalScenario", () => {
  const base = GFC_2008;

  it("rejects a window whose end precedes its start", () => {
    expect(() =>
      validateHistoricalScenario({
        ...base,
        window: { start: "2009-03-09", end: "2007-10-09" },
      }),
    ).toThrow(/before start/);
  });

  it("rejects non-ISO window dates", () => {
    expect(() =>
      validateHistoricalScenario({
        ...base,
        window: { start: "not-a-date", end: "2009-03-09" },
      }),
    ).toThrow(/valid ISO dates/);
  });

  it("rejects a positive (gain) peak-to-trough", () => {
    expect(() =>
      validateHistoricalScenario({ ...base, peakToTrough: 0.1 }),
    ).toThrow(/peakToTrough/);
  });

  it("rejects a drawdown worse than -100%", () => {
    expect(() =>
      validateHistoricalScenario({ ...base, peakToTrough: -1.5 }),
    ).toThrow(/peakToTrough/);
  });

  it("rejects an empty source list", () => {
    expect(() =>
      validateHistoricalScenario({ ...base, sources: [] }),
    ).toThrow(/source/);
  });

  it("rejects a negative recovery", () => {
    expect(() =>
      validateHistoricalScenario({ ...base, recoveryMonths: -3 }),
    ).toThrow(/recoveryMonths/);
  });
});
