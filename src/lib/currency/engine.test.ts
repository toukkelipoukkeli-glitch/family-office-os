import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import { Money } from "../money";
import { eurLatestTable } from "../fx/fixtures";
import {
  applyHedge,
  buildExposure,
  type ExposureInput,
  type Position,
} from "./engine";
import { seededExposureInput, seededPositions } from "./fixtures";

/** The hand-computed EUR exposure of the seeded portfolio (rates: USD 1.08,
 *  GBP 0.85, CHF 0.96, JPY 168, SEK 11.25). */
const EXPECTED_BASE: Record<string, string> = {
  EUR: "6000000",
  USD: "6500000",
  GBP: "1800000",
  CHF: "1250000",
  JPY: "1250000",
  SEK: "1000000",
};
const EXPECTED_TOTAL = "17800000";

describe("buildExposure", () => {
  it("rolls positions up by currency and converts to the base exactly", () => {
    const model = buildExposure(seededExposureInput);
    expect(model.base).toBe("EUR");
    const got = new Map(
      model.exposures.map((e) => [e.currency, e.valueBase.amount.toFixed()]),
    );
    for (const [cur, expected] of Object.entries(EXPECTED_BASE)) {
      expect(got.get(cur)).toBe(expected);
    }
  });

  it("totals the whole portfolio in base currency", () => {
    const model = buildExposure(seededExposureInput);
    expect(model.totalBase.currency).toBe("EUR");
    expect(model.totalBase.amount.toFixed()).toBe(EXPECTED_TOTAL);
  });

  it("orders the base bucket first then foreign by descending value", () => {
    const model = buildExposure(seededExposureInput);
    expect(model.exposures[0].currency).toBe("EUR");
    expect(model.exposures[0].isBase).toBe(true);
    const foreign = model.exposures.slice(1);
    for (let i = 1; i < foreign.length; i++) {
      expect(
        foreign[i - 1].valueBase.amount.greaterThanOrEqualTo(
          foreign[i].valueBase.amount,
        ),
      ).toBe(true);
    }
  });

  it("counts positions per currency and marks the base bucket", () => {
    const model = buildExposure(seededExposureInput);
    const eur = model.exposures.find((e) => e.currency === "EUR")!;
    expect(eur.positionCount).toBe(2);
    expect(eur.isBase).toBe(true);
    expect(eur.rateToBase.equals(1)).toBe(true);
    const usd = model.exposures.find((e) => e.currency === "USD")!;
    expect(usd.positionCount).toBe(2);
    expect(usd.isBase).toBe(false);
    expect(usd.rateToBase.toFixed()).toBe("1.08");
  });

  it("synthesises an empty base bucket when no base-currency position exists", () => {
    const positions: Position[] = [
      {
        id: "us",
        label: "US",
        assetClass: "Equity",
        currency: "USD",
        value: Money.of("1080000", "USD"),
      },
    ];
    const input: ExposureInput = {
      base: "EUR",
      rates: eurLatestTable,
      positions,
      hedgeAssumptions: [],
    };
    const model = buildExposure(input);
    const eur = model.exposures.find((e) => e.currency === "EUR")!;
    expect(eur.isBase).toBe(true);
    expect(eur.positionCount).toBe(0);
    expect(eur.valueBase.amount.isZero()).toBe(true);
    // 1,080,000 USD / 1.08 = 1,000,000 EUR.
    expect(model.totalBase.amount.toFixed()).toBe("1000000");
  });

  it("throws on an empty portfolio", () => {
    expect(() =>
      buildExposure({
        base: "EUR",
        rates: eurLatestTable,
        positions: [],
        hedgeAssumptions: [],
      }),
    ).toThrow(/at least one position/);
  });

  it("rejects a position whose value currency disagrees with its currency", () => {
    const bad: Position[] = [
      {
        id: "x",
        label: "x",
        assetClass: "Equity",
        currency: "USD",
        value: Money.of("100", "EUR"),
      },
    ];
    expect(() =>
      buildExposure({
        base: "EUR",
        rates: eurLatestTable,
        positions: bad,
        hedgeAssumptions: [],
      }),
    ).toThrow(/does not match/);
  });
});

describe("applyHedge", () => {
  it("at a 0% hedge leaves the full foreign exposure unhedged and costs nothing", () => {
    const model = buildExposure(seededExposureInput);
    const s = applyHedge(model, { defaultRatio: 0 });
    expect(s.hedgedForeignBase.amount.isZero()).toBe(true);
    expect(s.totalAnnualCost.amount.isZero()).toBe(true);
    expect(s.effectiveHedgeRatio.isZero()).toBe(true);
    // Gross foreign = total - EUR bucket = 17.8M - 6.0M = 11.8M.
    expect(s.grossForeignBase.amount.toFixed()).toBe("11800000");
    expect(s.residualForeignBase.amount.toFixed()).toBe("11800000");
  });

  it("at a 100% hedge neutralises all foreign exposure", () => {
    const model = buildExposure(seededExposureInput);
    const s = applyHedge(model, { defaultRatio: 1 });
    expect(s.residualForeignBase.amount.isZero()).toBe(true);
    expect(s.hedgedForeignBase.amount.toFixed()).toBe("11800000");
    expect(s.effectiveHedgeRatio.equals(1)).toBe(true);
  });

  it("splits gross into hedged + residual at a 50% ratio", () => {
    const model = buildExposure(seededExposureInput);
    const s = applyHedge(model, { defaultRatio: 0.5 });
    expect(s.hedgedForeignBase.amount.toFixed()).toBe("5900000");
    expect(s.residualForeignBase.amount.toFixed()).toBe("5900000");
    expect(s.effectiveHedgeRatio.equals(new Decimal("0.5"))).toBe(true);
    for (const c of s.currencies) {
      expect(
        c.hedgedBase.amount.plus(c.residualBase.amount).toFixed(),
      ).toBe(c.grossBase.amount.toFixed());
    }
  });

  it("computes indicative annual cost = hedged notional × rate (signed)", () => {
    const model = buildExposure(seededExposureInput);
    const s = applyHedge(model, { defaultRatio: 1 });
    const usd = s.currencies.find((c) => c.currency === "USD")!;
    // 6,500,000 hedged × -0.0125 = -81,250 (USD earns carry for the hedger).
    expect(usd.annualCost.amount.toFixed()).toBe("-81250");
    const chf = s.currencies.find((c) => c.currency === "CHF")!;
    // 1,250,000 × 0.0185 = 23,125.
    expect(chf.annualCost.amount.toFixed()).toBe("23125");

    // Total = sum of all per-currency costs at full hedge.
    // USD -81250, GBP 1.8M*0.0045=8100, CHF 23125, JPY 1.25M*0.026=32500,
    // SEK 1.0M*0.0075=7500 -> -9, 1, 2, 5: -81250+8100+23125+32500+7500.
    expect(s.totalAnnualCost.amount.toFixed()).toBe("-10025");
  });

  it("applies per-currency overrides and clamps ratios to [0,1]", () => {
    const model = buildExposure(seededExposureInput);
    const s = applyHedge(model, {
      defaultRatio: 0,
      overrides: { USD: 2, GBP: -1, CHF: 0.25 },
    });
    const usd = s.currencies.find((c) => c.currency === "USD")!;
    const gbp = s.currencies.find((c) => c.currency === "GBP")!;
    const chf = s.currencies.find((c) => c.currency === "CHF")!;
    const jpy = s.currencies.find((c) => c.currency === "JPY")!;
    expect(usd.ratio.equals(1)).toBe(true); // clamped from 2
    expect(gbp.ratio.isZero()).toBe(true); // clamped from -1
    expect(chf.ratio.equals(new Decimal("0.25"))).toBe(true);
    expect(jpy.ratio.isZero()).toBe(true); // default 0
  });

  it("never includes the base currency among hedged currencies", () => {
    const model = buildExposure(seededExposureInput);
    const s = applyHedge(model, { defaultRatio: 0.5 });
    expect(s.currencies.some((c) => c.currency === "EUR")).toBe(false);
    expect(s.currencies).toHaveLength(5);
  });

  it("yields a zero effective ratio when there is no foreign exposure", () => {
    const eurOnly: Position[] = [
      {
        id: "eu",
        label: "EU",
        assetClass: "Equity",
        currency: "EUR",
        value: Money.of("1000000", "EUR"),
      },
    ];
    const model = buildExposure({
      base: "EUR",
      rates: eurLatestTable,
      positions: eurOnly,
      hedgeAssumptions: [],
    });
    const s = applyHedge(model, { defaultRatio: 1 });
    expect(s.currencies).toHaveLength(0);
    expect(s.effectiveHedgeRatio.isZero()).toBe(true);
    expect(s.totalAnnualCost.amount.isZero()).toBe(true);
  });

  it("uses a zero cost rate for currencies without a hedge assumption", () => {
    // Drop the SEK assumption; its hedge should then cost nothing.
    const input: ExposureInput = {
      ...seededExposureInput,
      hedgeAssumptions: seededExposureInput.hedgeAssumptions.filter(
        (h) => h.currency !== "SEK",
      ),
    };
    const model = buildExposure(input);
    const s = applyHedge(model, { defaultRatio: 1 });
    const sek = s.currencies.find((c) => c.currency === "SEK")!;
    expect(sek.costRate.isZero()).toBe(true);
    expect(sek.annualCost.amount.isZero()).toBe(true);
  });
});

describe("seeded fixtures", () => {
  it("has eight positions across six currencies", () => {
    expect(seededPositions).toHaveLength(8);
    const currencies = new Set(seededPositions.map((p) => p.currency));
    expect([...currencies].sort()).toEqual([
      "CHF",
      "EUR",
      "GBP",
      "JPY",
      "SEK",
      "USD",
    ]);
  });
});
