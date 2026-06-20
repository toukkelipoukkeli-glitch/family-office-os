import { describe, expect, it } from "vitest";

import {
  RISK_ENTITIES,
  RISK_HOLDINGS,
  RISK_ROOT_ID,
  evaluateRiskCockpit,
  sampleReturns,
  sampleRiskLimits,
  validateLimit,
  validateLimitSet,
  type RiskLimitSet,
} from "./index";

/**
 * Adversarial edge-case tests for the risk-limits cockpit engine
 * (independent-tester hardening for unit m9-risk-limits). These target the
 * boundary and degenerate cases that the primary oracle test does not pin:
 * exact-threshold semantics, tie-breaking, single-period metrics, a
 * concentration cap on a class the book does not hold, and validation of
 * malformed limit shapes.
 */

const RE_WEIGHT = 10880000 / 31792500; // real_estate look-through weight ≈ 0.342221

function run(limitSet: RiskLimitSet, returns: readonly number[] = sampleReturns) {
  return evaluateRiskCockpit(
    RISK_ENTITIES,
    RISK_HOLDINGS,
    RISK_ROOT_ID,
    limitSet,
    returns,
    { periodsPerYear: 12, riskFreeRate: 0 },
  );
}

describe("riskcockpit edge: exact-threshold breach semantics", () => {
  it("does NOT breach a concentration cap exactly equal to the weight (strictly-above)", () => {
    // Set the cap to exactly the look-through weight: weight === max must be OK.
    const r = run({
      id: "exact",
      name: "exact",
      limits: [
        {
          id: "conc-re",
          kind: "concentration",
          label: "RE exact",
          assetClass: "real_estate",
          max: RE_WEIGHT,
        },
      ],
    });
    const re = r.concentration.find((c) => c.assetClass === "real_estate")!;
    expect(re.breached).toBe(false);
    const check = r.checks.find((c) => c.limit.id === "conc-re")!;
    expect(check.breached).toBe(false);
    expect(r.compliant).toBe(true);
  });

  it("breaches just below the weight and clears just above it", () => {
    const justBelow = run({
      id: "below",
      name: "below",
      limits: [
        {
          id: "c",
          kind: "concentration",
          label: "RE",
          assetClass: "real_estate",
          max: RE_WEIGHT - 1e-9,
        },
      ],
    });
    expect(justBelow.compliant).toBe(false);

    const justAbove = run({
      id: "above",
      name: "above",
      limits: [
        {
          id: "c",
          kind: "concentration",
          label: "RE",
          assetClass: "real_estate",
          max: RE_WEIGHT + 1e-9,
        },
      ],
    });
    expect(justAbove.compliant).toBe(true);
  });

  it("does NOT breach a liquidity floor exactly equal to the liquid weight", () => {
    const liquidWeight = (9000000 + 4800000 + 2500000 + 150000) / 31792500;
    const r = run({
      id: "floor",
      name: "floor",
      limits: [
        { id: "f", kind: "liquidityFloor", label: "Floor", min: liquidWeight },
      ],
    });
    expect(r.compliant).toBe(true);
  });
});

describe("riskcockpit edge: a cap on a class the book does not hold", () => {
  it("treats a missing asset class as zero weight and never breaches a max cap", () => {
    // The Ravenscroft book holds no commodities.
    const r = run({
      id: "missing",
      name: "missing",
      limits: [
        {
          id: "conc-commodities",
          kind: "concentration",
          label: "Commodities cap",
          assetClass: "commodities",
          max: 0.05,
        },
      ],
    });
    const check = r.checks.find((c) => c.limit.id === "conc-commodities")!;
    expect(check.weight).toBe(0);
    expect(check.value.amount.toString()).toBe("0");
    expect(check.breached).toBe(false);
    // No concentration line is fabricated for a class the book does not hold.
    expect(
      r.concentration.some((c) => c.assetClass === "commodities"),
    ).toBe(false);
  });
});

describe("riskcockpit edge: tie-breaking and ordering", () => {
  it("breaks ties between equal-severity, equal-exceedance breaches by limit id", () => {
    // Two illiquid caps with the same threshold → identical exceedance + severity.
    const r = run({
      id: "ties",
      name: "ties",
      limits: [
        { id: "ill-b", kind: "illiquidCap", label: "B", max: 0.1 },
        { id: "ill-a", kind: "illiquidCap", label: "A", max: 0.1 },
      ],
    });
    expect(r.breaches).toHaveLength(2);
    // Deterministic order: id "ill-a" before "ill-b".
    expect(r.breaches.map((b) => b.limit.id)).toEqual(["ill-a", "ill-b"]);
  });

  it("orders non-breaching checks after breaches, by descending weight", () => {
    const r = run(sampleRiskLimits);
    const firstClean = r.checks.findIndex((c) => !c.breached);
    expect(firstClean).toBeGreaterThan(0);
    const clean = r.checks.slice(firstClean);
    expect(clean.every((c) => !c.breached)).toBe(true);
    for (let i = 1; i < clean.length; i++) {
      expect(clean[i - 1].weight).toBeGreaterThanOrEqual(clean[i].weight);
    }
  });
});

describe("riskcockpit edge: risk-metrics degenerate series", () => {
  it("degrades a single-period series to zeroed metrics (needs >= 2 returns)", () => {
    const r = run(sampleRiskLimits, [0.01]);
    expect(r.metrics.periods).toBe(1);
    expect(r.metrics.volatility).toBe(0);
    expect(r.metrics.sharpe).toBe(0);
    expect(r.metrics.maxDrawdown.maxDrawdown).toBe(0);
    expect(r.metrics.maxDrawdown.peakIndex).toBe(-1);
    // Concentration analysis is independent of the return series.
    expect(r.breaches).toHaveLength(4);
  });

  it("computes real metrics from exactly two returns", () => {
    const r = run(sampleRiskLimits, [0.02, -0.01]);
    expect(r.metrics.periods).toBe(2);
    expect(r.metrics.volatility).toBeGreaterThan(0);
    expect(Number.isFinite(r.metrics.sharpe)).toBe(true);
  });
});

describe("riskcockpit edge: malformed-limit validation", () => {
  it("rejects a non-finite weight (NaN / Infinity)", () => {
    expect(() =>
      validateLimit({
        id: "nan",
        kind: "concentration",
        label: "x",
        assetClass: "equity",
        max: Number.NaN,
      }),
    ).toThrow(/\[0, 1\]/);
    expect(() =>
      validateLimit({
        id: "inf",
        kind: "illiquidCap",
        label: "x",
        max: Number.POSITIVE_INFINITY,
      }),
    ).toThrow(/\[0, 1\]/);
  });

  it("rejects an unknown limit kind", () => {
    expect(() =>
      validateLimit({
        id: "weird",
        // @ts-expect-error deliberately invalid kind for the adversarial path
        kind: "drawdownCap",
        label: "x",
        max: 0.1,
      }),
    ).toThrow(/unknown kind/);
  });

  it("evaluateRiskCockpit validates the limit set before evaluating", () => {
    expect(() =>
      run({
        id: "dup",
        name: "dup",
        limits: [
          { id: "z", kind: "illiquidCap", label: "a", max: 0.1 },
          { id: "z", kind: "illiquidCap", label: "b", max: 0.2 },
        ],
      }),
    ).toThrow(/duplicate limit id z/);
  });

  it("accepts an empty limit set and reports a fully compliant book", () => {
    const r = run({ id: "none", name: "none", limits: [] });
    expect(() => validateLimitSet({ id: "none", name: "none", limits: [] })).not.toThrow();
    expect(r.checks).toHaveLength(0);
    expect(r.breaches).toHaveLength(0);
    expect(r.compliant).toBe(true);
    // Concentration + liquidity views still populate without any limits.
    expect(r.concentration.length).toBeGreaterThan(0);
    expect(r.liquidityTiers).toHaveLength(3);
  });
});
