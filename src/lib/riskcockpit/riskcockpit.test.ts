import { describe, expect, it } from "vitest";

import {
  LIQUIDITY_TIER_BY_CLASS,
  RISK_ENTITIES,
  RISK_HOLDINGS,
  RISK_ROOT_ID,
  evaluateRiskCockpit,
  liquidityTierLabel,
  sampleReturns,
  sampleReturnsPeriodsPerYear,
  sampleRiskLimits,
  validateLimit,
  validateLimitSet,
  type RiskLimitSet,
} from "./index";

const near = (actual: number, expected: number, dp = 6) =>
  expect(actual).toBeCloseTo(expected, dp);

function run(limitSet: RiskLimitSet = sampleRiskLimits) {
  return evaluateRiskCockpit(
    RISK_ENTITIES,
    RISK_HOLDINGS,
    RISK_ROOT_ID,
    limitSet,
    sampleReturns,
    { periodsPerYear: sampleReturnsPeriodsPerYear, riskFreeRate: 0 },
  );
}

describe("riskcockpit: limit validation", () => {
  it("accepts the sample limit set", () => {
    expect(() => validateLimitSet(sampleRiskLimits)).not.toThrow();
  });

  it("rejects a weight outside [0, 1]", () => {
    expect(() =>
      validateLimit({
        id: "bad",
        kind: "concentration",
        label: "bad",
        assetClass: "equity",
        max: 1.5,
      }),
    ).toThrow(/\[0, 1\]/);
    expect(() =>
      validateLimit({
        id: "bad2",
        kind: "liquidityFloor",
        label: "bad",
        min: -0.1,
      }),
    ).toThrow(/\[0, 1\]/);
  });

  it("rejects duplicate limit ids", () => {
    expect(() =>
      validateLimitSet({
        id: "dup",
        name: "dup",
        limits: [
          { id: "x", kind: "illiquidCap", label: "a", max: 0.1 },
          { id: "x", kind: "illiquidCap", label: "b", max: 0.2 },
        ],
      }),
    ).toThrow(/duplicate limit id x/);
  });
});

describe("riskcockpit: look-through concentration vs limits (oracle)", () => {
  const report = run();

  it("consolidates the look-through total of the family book", () => {
    expect(report.rootId).toBe("trust");
    expect(report.currency).toBe("USD");
    expect(report.total.amount.toString()).toBe("31792500");
  });

  it("reports true look-through concentration by asset class, weight-desc", () => {
    const byClass = Object.fromEntries(
      report.concentration.map((c) => [c.assetClass, c]),
    );
    // Real estate is the single most concentrated class.
    expect(report.concentration[0].assetClass).toBe("real_estate");
    near(byClass.real_estate.weight, 10880000 / 31792500);
    near(byClass.equity.weight, 9000000 / 31792500);
    near(byClass.fixed_income.weight, 4800000 / 31792500);
    near(byClass.private_equity.weight, 4462500 / 31792500);
    near(byClass.cash.weight, 2500000 / 31792500);
    near(byClass.crypto.weight, 150000 / 31792500);
    // Concentration weights are sorted descending.
    for (let i = 1; i < report.concentration.length; i++) {
      expect(report.concentration[i - 1].weight).toBeGreaterThanOrEqual(
        report.concentration[i].weight,
      );
    }
  });

  it("flags exactly the concentration caps that the look-through weight breaches", () => {
    const byClass = Object.fromEntries(
      report.concentration.map((c) => [c.assetClass, c]),
    );
    // Real estate 34.22% > 30% cap → breached.
    expect(byClass.real_estate.limit).toBe(0.3);
    expect(byClass.real_estate.breached).toBe(true);
    // Equity 28.31% <= 35% cap → not breached.
    expect(byClass.equity.limit).toBe(0.35);
    expect(byClass.equity.breached).toBe(false);
    // Private equity 14.04% > 12% cap → breached.
    expect(byClass.private_equity.limit).toBe(0.12);
    expect(byClass.private_equity.breached).toBe(true);
    // Cash has no cap configured.
    expect(byClass.cash.limit).toBeNull();
    expect(byClass.cash.breached).toBe(false);
  });

  it("identifies the top concentration line", () => {
    expect(report.topConcentration?.assetClass).toBe("real_estate");
    near(report.topConcentration!.weight, 10880000 / 31792500);
  });
});

describe("riskcockpit: liquidity tiers", () => {
  const report = run();

  it("maps every look-through class to a liquidity tier", () => {
    for (const line of report.concentration) {
      expect(line.liquidityTier).toBe(
        LIQUIDITY_TIER_BY_CLASS[line.assetClass],
      );
    }
  });

  it("rolls the book into liquid / semi-liquid / illiquid tiers that sum to 100%", () => {
    const byTier = Object.fromEntries(
      report.liquidityTiers.map((t) => [t.tier, t]),
    );
    near(byTier.liquid.weight, (9000000 + 4800000 + 2500000 + 150000) / 31792500);
    near(byTier.semi_liquid.weight, 10880000 / 31792500);
    near(byTier.illiquid.weight, 4462500 / 31792500);
    const sum = report.liquidityTiers.reduce((s, t) => s + t.weight, 0);
    near(sum, 1);
    // Tier order is liquid → semi-liquid → illiquid.
    expect(report.liquidityTiers.map((t) => t.tier)).toEqual([
      "liquid",
      "semi_liquid",
      "illiquid",
    ]);
    expect(report.liquidityTiers.map((t) => t.label)).toEqual([
      liquidityTierLabel("liquid"),
      liquidityTierLabel("semi_liquid"),
      liquidityTierLabel("illiquid"),
    ]);
  });

  it("sums tier values to the look-through total in exact decimal", () => {
    const total = report.liquidityTiers.reduce(
      (acc, t) => acc.plus(t.value.amount),
      report.liquidityTiers[0].value.amount.minus(
        report.liquidityTiers[0].value.amount,
      ),
    );
    expect(total.toString()).toBe(report.total.amount.toString());
  });
});

describe("riskcockpit: breach report", () => {
  const report = run();

  it("produces exactly 1 critical + 3 warning breaches", () => {
    expect(report.compliant).toBe(false);
    expect(report.counts).toEqual({ critical: 1, warning: 3 });
    expect(report.breaches).toHaveLength(4);
  });

  it("orders breaches first, criticals before warnings", () => {
    // The first breach is the critical real-estate concentration cap.
    expect(report.breaches[0].limit.id).toBe("conc-real-estate");
    expect(report.breaches[0].severity).toBe("critical");
    // Every check before the first non-breach is a breach.
    const firstClean = report.checks.findIndex((c) => !c.breached);
    expect(firstClean).toBe(4);
    expect(report.checks.slice(0, 4).every((c) => c.breached)).toBe(true);
  });

  it("breaches the liquidity floor and the illiquid cap on the tier rollups", () => {
    const liq = report.breaches.find((b) => b.kind === "liquidityFloor");
    expect(liq).toBeDefined();
    expect(liq!.bound).toBe("min");
    near(liq!.weight, (9000000 + 4800000 + 2500000 + 150000) / 31792500);
    expect(liq!.threshold).toBe(0.6);

    const ill = report.breaches.find((b) => b.kind === "illiquidCap");
    expect(ill).toBeDefined();
    expect(ill!.bound).toBe("max");
    near(ill!.weight, 4462500 / 31792500);
    expect(ill!.threshold).toBe(0.1);
    expect(ill!.exceedance).toBeGreaterThan(0);
  });

  it("is compliant when the limits are wide enough", () => {
    const lenient = run({
      id: "lenient",
      name: "lenient",
      limits: [
        {
          id: "conc-re",
          kind: "concentration",
          label: "RE",
          assetClass: "real_estate",
          max: 0.5,
        },
        { id: "liq", kind: "liquidityFloor", label: "Liq", min: 0.4 },
        { id: "ill", kind: "illiquidCap", label: "Ill", max: 0.2 },
      ],
    });
    expect(lenient.compliant).toBe(true);
    expect(lenient.breaches).toHaveLength(0);
    expect(lenient.counts).toEqual({ critical: 0, warning: 0 });
  });
});

describe("riskcockpit: risk metrics", () => {
  const report = run();

  it("computes annualized volatility, max drawdown and Sharpe from the series", () => {
    expect(report.metrics.periods).toBe(24);
    expect(report.metrics.periodsPerYear).toBe(12);
    near(report.metrics.volatility, 0.0679166688894816);
    near(report.metrics.maxDrawdown.maxDrawdown, 0.052508, 5);
    near(report.metrics.sharpe, 1.2883435161165757);
  });

  it("degrades to zeroed metrics for a too-short series rather than throwing", () => {
    const r = evaluateRiskCockpit(
      RISK_ENTITIES,
      RISK_HOLDINGS,
      RISK_ROOT_ID,
      sampleRiskLimits,
      [],
    );
    expect(r.metrics.periods).toBe(0);
    expect(r.metrics.volatility).toBe(0);
    expect(r.metrics.maxDrawdown.maxDrawdown).toBe(0);
    expect(r.metrics.sharpe).toBe(0);
    // The concentration / breach analysis is unaffected by the empty series.
    expect(r.breaches).toHaveLength(4);
  });
});
