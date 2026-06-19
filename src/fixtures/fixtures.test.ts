import { describe, expect, it } from "vitest";

import {
  ASSET_CLASSES,
  type AssetClass,
  CurrencyCode,
  Holding,
  Lot,
  MoneySchema,
  NonNegativeMoneySchema,
  Portfolio,
  Valuation,
} from "@/lib/model";

import {
  seededHoldings,
  seededPortfolio,
} from "./index";

describe("seeded fixtures: schema validity", () => {
  it("the whole portfolio parses against the Portfolio schema", () => {
    const parsed = Portfolio.parse(seededPortfolio);
    // strict() means a clean round-trip with no stripped/added keys.
    expect(parsed).toEqual(seededPortfolio);
  });

  it.each(seededHoldings.map((h) => [h.id, h] as const))(
    "holding %s parses against the Holding schema",
    (_id, holding) => {
      expect(Holding.parse(holding)).toEqual(holding);
    },
  );

  it("every lot in every holding parses against the Lot schema", () => {
    const lots = seededHoldings.flatMap((h) => h.lots);
    expect(lots.length).toBeGreaterThan(0);
    for (const lot of lots) {
      expect(Lot.parse(lot)).toEqual(lot);
    }
  });

  it("every valuation in every holding parses against the Valuation schema", () => {
    const valuations = seededHoldings.flatMap((h) => h.valuations);
    expect(valuations.length).toBeGreaterThan(0);
    for (const v of valuations) {
      expect(Valuation.parse(v)).toEqual(v);
    }
  });
});

describe("seeded fixtures: diversity coverage", () => {
  it("covers every asset class at least once", () => {
    const covered = new Set<AssetClass>(
      seededHoldings.map((h) => h.assetClass),
    );
    const missing = ASSET_CLASSES.filter((ac) => !covered.has(ac));
    expect(missing).toEqual([]);
    expect(covered.size).toBe(ASSET_CLASSES.length);
  });

  it("uses a spread of valuation sources (not a single source)", () => {
    const sources = new Set(
      seededHoldings.flatMap((h) => h.valuations.map((v) => v.source)),
    );
    // market (liquid), appraisal, manual, model, cost are all represented.
    expect(sources).toEqual(
      new Set(["market", "appraisal", "manual", "model", "cost"]),
    );
  });

  it("uses more than one currency (multi-currency portfolio)", () => {
    const currencies = new Set(seededHoldings.map((h) => h.currency));
    expect(currencies.size).toBeGreaterThan(1);
  });

  it("includes at least one holding with multiple lots and one with none", () => {
    expect(seededHoldings.some((h) => h.lots.length >= 2)).toBe(true);
    expect(seededHoldings.some((h) => h.lots.length === 0)).toBe(true);
  });

  it("includes at least one holding with multiple valuations over time", () => {
    expect(seededHoldings.some((h) => h.valuations.length >= 2)).toBe(true);
  });
});

describe("seeded fixtures: internal consistency", () => {
  it("the portfolio's holdings array matches the exported seededHoldings", () => {
    expect(seededPortfolio.holdings).toEqual([...seededHoldings]);
  });

  it("holding ids are unique within the portfolio", () => {
    const ids = seededHoldings.map((h) => h.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("lot ids are globally unique across the whole portfolio", () => {
    const lotIds = seededHoldings.flatMap((h) => h.lots.map((l) => l.id));
    expect(new Set(lotIds).size).toBe(lotIds.length);
  });

  it("valuation ids are globally unique across the whole portfolio", () => {
    const valIds = seededHoldings.flatMap((h) =>
      h.valuations.map((v) => v.id),
    );
    expect(new Set(valIds).size).toBe(valIds.length);
  });

  it("every holding has at least one valuation", () => {
    for (const h of seededHoldings) {
      expect(h.valuations.length).toBeGreaterThan(0);
    }
  });

  it("every money amount is a valid non-negative money value", () => {
    for (const h of seededHoldings) {
      for (const v of h.valuations) {
        expect(NonNegativeMoneySchema.parse(v.value)).toEqual(v.value);
      }
      for (const lot of h.lots) {
        expect(NonNegativeMoneySchema.parse(lot.unitCost)).toEqual(
          lot.unitCost,
        );
        if (lot.fees) {
          expect(MoneySchema.parse(lot.fees)).toEqual(lot.fees);
        }
      }
    }
  });

  it("the base currency is a valid ISO code", () => {
    expect(CurrencyCode.parse(seededPortfolio.baseCurrency)).toBe("USD");
  });

  it("lot fees, when present, share the lot's unitCost currency", () => {
    for (const h of seededHoldings) {
      for (const lot of h.lots) {
        if (lot.fees) {
          expect(lot.fees.currency).toBe(lot.unitCost.currency);
        }
      }
    }
  });

  it("confidenceScore, when present, lies within [0, 1]", () => {
    for (const h of seededHoldings) {
      for (const v of h.valuations) {
        if (v.confidenceScore !== undefined) {
          expect(v.confidenceScore).toBeGreaterThanOrEqual(0);
          expect(v.confidenceScore).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});
