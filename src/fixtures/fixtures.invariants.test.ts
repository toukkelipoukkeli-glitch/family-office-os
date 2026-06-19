import { describe, expect, it } from "vitest";

import {
  ASSET_CLASSES,
  type AssetClass,
  isCollectibleAssetClass,
  isLiquidAssetClass,
  Portfolio,
} from "@/lib/model";

import { seededHoldings, seededPortfolio } from "./index";

/**
 * Adversarial invariant tests for the seeded fixture portfolio.
 *
 * The base schema (Holding/Lot/Valuation) validates each record in isolation
 * but does NOT enforce cross-field semantics like "a holding's valuations are
 * denominated in the holding's own currency". Downstream rollup/FX code will
 * rely on those semantics, so we pin them here against the real fixtures.
 *
 * Everything stays deterministic and offline — no live API, no clock.
 */
describe("seeded fixtures: cross-field currency consistency", () => {
  it("every valuation is denominated in its holding's currency", () => {
    for (const h of seededHoldings) {
      for (const v of h.valuations) {
        expect(
          v.value.currency,
          `valuation ${v.id} on holding ${h.id} should be in ${h.currency}`,
        ).toBe(h.currency);
      }
    }
  });

  it("every lot's unitCost is denominated in its holding's currency", () => {
    for (const h of seededHoldings) {
      for (const lot of h.lots) {
        expect(
          lot.unitCost.currency,
          `lot ${lot.id} on holding ${h.id} should be in ${h.currency}`,
        ).toBe(h.currency);
      }
    }
  });

  it("every lot's fees (when present) are denominated in its holding's currency", () => {
    for (const h of seededHoldings) {
      for (const lot of h.lots) {
        if (lot.fees) {
          expect(lot.fees.currency).toBe(h.currency);
        }
      }
    }
  });
});

describe("seeded fixtures: asset-class coverage is exact and de-duplicated", () => {
  it("covers exactly the full ASSET_CLASSES set with no unknown classes", () => {
    const covered = new Set<AssetClass>(seededHoldings.map((h) => h.assetClass));
    expect([...covered].sort()).toEqual([...ASSET_CLASSES].sort());
  });

  it("includes both a liquid and a collectible holding", () => {
    expect(seededHoldings.some((h) => isLiquidAssetClass(h.assetClass))).toBe(
      true,
    );
    expect(
      seededHoldings.some((h) => isCollectibleAssetClass(h.assetClass)),
    ).toBe(true);
  });

  it("non-cash liquid holdings carry a live market valuation", () => {
    // Cash is liquid but is valued from a bank statement (manual), so exclude
    // it: the rule we actually want to pin is that priced instruments
    // (equity/bond/etf/crypto) carry a real market quote.
    const pricedLiquid = seededHoldings.filter(
      (h) => isLiquidAssetClass(h.assetClass) && h.assetClass !== "cash",
    );
    expect(pricedLiquid.length).toBeGreaterThan(0);
    for (const h of pricedLiquid) {
      expect(
        h.valuations.some((v) => v.source === "market"),
        `priced liquid holding ${h.id} should have a market valuation`,
      ).toBe(true);
    }
  });

  it("cash holdings are valued from a manual statement", () => {
    const cash = seededHoldings.filter((h) => h.assetClass === "cash");
    expect(cash.length).toBeGreaterThan(0);
    for (const h of cash) {
      expect(h.valuations.every((v) => v.source === "manual")).toBe(true);
    }
  });
});

describe("seeded fixtures: temporal sanity (deterministic literals)", () => {
  it("the seeded portfolio pins both createdAt and updatedAt", () => {
    expect(seededPortfolio.createdAt).toBeDefined();
    expect(seededPortfolio.updatedAt).toBeDefined();
  });

  // Both are pinned literals in the fixture; assert-and-narrow for the rest.
  const createdAt = seededPortfolio.createdAt ?? "";
  const updatedAt = seededPortfolio.updatedAt ?? "";
  const portfolioUpdatedAt = Date.parse(updatedAt);

  it("portfolio createdAt is not after updatedAt", () => {
    expect(Date.parse(createdAt)).toBeLessThanOrEqual(portfolioUpdatedAt);
  });

  it("no valuation is dated after the portfolio's updatedAt", () => {
    for (const h of seededHoldings) {
      for (const v of h.valuations) {
        expect(
          Date.parse(v.asOf),
          `valuation ${v.id} asOf must not be in the portfolio's future`,
        ).toBeLessThanOrEqual(portfolioUpdatedAt);
      }
    }
  });

  it("every lot acquisition date is a parseable past-or-present literal", () => {
    for (const h of seededHoldings) {
      for (const lot of h.lots) {
        const t = Date.parse(`${lot.acquiredOn}T00:00:00Z`);
        expect(Number.isNaN(t)).toBe(false);
        expect(t).toBeLessThanOrEqual(portfolioUpdatedAt);
      }
    }
  });
});

describe("seeded fixtures: confidence semantics", () => {
  it("market-sourced valuations are high confidence", () => {
    for (const h of seededHoldings) {
      for (const v of h.valuations) {
        if (v.source === "market") {
          expect(v.confidence).toBe("high");
        }
      }
    }
  });

  // NB: the numeric [0, 1] range of confidenceScore is asserted in
  // fixtures.test.ts; we intentionally don't duplicate that here.
});

describe("seeded fixtures: deep-clone immutability of seededPortfolio", () => {
  it("re-parsing produces an equal but independent object (no shared refs leak)", () => {
    const a = Portfolio.parse(seededPortfolio);
    const b = Portfolio.parse(seededPortfolio);
    expect(a).toEqual(b);
    // Zod returns fresh objects; mutating one parse result must not affect the
    // canonical fixture nor a second parse.
    a.holdings[0].tags.push("__mutation_probe__");
    expect(seededPortfolio.holdings[0].tags).not.toContain("__mutation_probe__");
    expect(b.holdings[0].tags).not.toContain("__mutation_probe__");
  });
});
