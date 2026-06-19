import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import { Money } from "@/lib/money";
import { ASSET_CLASSES, type AssetClass } from "@/lib/model/asset-class";
import type { Holding } from "@/lib/model/holding";
import type { Portfolio } from "@/lib/model/portfolio";
import type { FxRateTable } from "@/lib/allocation";

import {
  analyzeCapitalCall,
  ASSET_CLASS_LIQUIDITY,
  DEFAULT_HAIRCUTS,
  isLiquidTier,
  LIQUIDITY_TIERS,
  LiquidityError,
  liquidityTierFor,
  tierLiquidity,
  tierPriority,
} from "./liquidity";
import { liquidityFxTable, liquidityPortfolio } from "./fixtures";

// ── Small hand-built helpers so unit tests don't depend on the big seed ──────

function holding(
  id: string,
  assetClass: AssetClass,
  amount: string,
  currency = "USD",
): Holding {
  return {
    id,
    name: id,
    assetClass,
    currency,
    lots: [],
    valuations: [
      {
        id: `${id}-v1`,
        value: { amount, currency },
        asOf: "2026-06-18T00:00:00Z",
        source: "manual",
        confidence: "high",
      },
    ],
    tags: [],
  };
}

function portfolioOf(holdings: Holding[], baseCurrency = "USD"): Portfolio {
  return {
    id: "pf-test",
    name: "Test",
    baseCurrency,
    holdings,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-06-18T00:00:00Z",
  };
}

const usdTable: FxRateTable = { base: "USD", rates: {} };
const usd = (a: string) => Money.of(a, "USD");

// ── Tier classification ──────────────────────────────────────────────────────

describe("liquidity tiers", () => {
  it("lists tiers most-liquid first with stable priorities", () => {
    expect(LIQUIDITY_TIERS).toEqual(["cash", "near-cash", "marketable", "illiquid"]);
    expect(tierPriority("cash")).toBe(0);
    expect(tierPriority("near-cash")).toBe(1);
    expect(tierPriority("marketable")).toBe(2);
    expect(tierPriority("illiquid")).toBe(3);
  });

  it("only the illiquid tier is non-liquid", () => {
    expect(isLiquidTier("cash")).toBe(true);
    expect(isLiquidTier("near-cash")).toBe(true);
    expect(isLiquidTier("marketable")).toBe(true);
    expect(isLiquidTier("illiquid")).toBe(false);
  });

  it("classifies every asset class into exactly one known tier", () => {
    for (const ac of ASSET_CLASSES) {
      const tier = liquidityTierFor(ac);
      expect(LIQUIDITY_TIERS).toContain(tier);
      expect(ASSET_CLASS_LIQUIDITY[ac]).toBe(tier);
    }
  });

  it("maps the obvious classes sensibly", () => {
    expect(liquidityTierFor("cash")).toBe("cash");
    expect(liquidityTierFor("bond")).toBe("near-cash");
    expect(liquidityTierFor("equity")).toBe("marketable");
    expect(liquidityTierFor("etf")).toBe("marketable");
    expect(liquidityTierFor("crypto")).toBe("marketable");
    for (const ac of ["forest", "wine", "art", "lego", "car", "vineyard", "pe", "watch"] as const) {
      expect(liquidityTierFor(ac)).toBe("illiquid");
    }
  });

  it("default haircuts are monotone non-decreasing down the tiers", () => {
    let prev = new Decimal(-1);
    for (const tier of LIQUIDITY_TIERS) {
      const h = new Decimal(DEFAULT_HAIRCUTS[tier]);
      expect(h.greaterThanOrEqualTo(0)).toBe(true);
      expect(h.lessThanOrEqualTo(1)).toBe(true);
      expect(h.greaterThanOrEqualTo(prev)).toBe(true);
      prev = h;
    }
    expect(DEFAULT_HAIRCUTS.cash).toBe("0");
  });
});

// ── tierLiquidity roll-up ────────────────────────────────────────────────────

describe("tierLiquidity", () => {
  it("returns one entry per tier, in tier order, even for empty tiers", () => {
    const pf = portfolioOf([holding("c", "cash", "100")]);
    const tiers = tierLiquidity(pf, usdTable);
    expect(tiers.map((t) => t.tier)).toEqual([...LIQUIDITY_TIERS]);
    const near = tiers.find((t) => t.tier === "near-cash")!;
    expect(near.holdingCount).toBe(0);
    expect(near.gross.isZero()).toBe(true);
    expect(near.net.isZero()).toBe(true);
  });

  it("sums same-tier holdings and converts to the base currency", () => {
    const pf = portfolioOf([
      holding("usd-cash", "cash", "100", "USD"),
      holding("eur-cash", "cash", "100", "EUR"),
    ]);
    const table: FxRateTable = { base: "USD", rates: { EUR: "1.50" } };
    const tiers = tierLiquidity(pf, table);
    const cash = tiers.find((t) => t.tier === "cash")!;
    // 100 USD + 100 EUR * 1.50 = 250 USD; cash has a zero haircut so net == gross.
    expect(cash.gross.toString()).toBe("250 USD");
    expect(cash.net.toString()).toBe("250 USD");
    expect(cash.holdingCount).toBe(2);
  });

  it("applies the per-tier haircut to net proceeds", () => {
    const pf = portfolioOf([holding("e", "equity", "1000")]);
    const tiers = tierLiquidity(pf, usdTable, { marketable: "0.10" });
    const mk = tiers.find((t) => t.tier === "marketable")!;
    expect(mk.gross.toString()).toBe("1000 USD");
    expect(mk.haircut.toString()).toBe("0.1");
    expect(mk.net.toString()).toBe("900 USD");
  });

  it("skips holdings with no valuation (they contribute nothing and aren't counted)", () => {
    const noVal: Holding = {
      id: "ghost",
      name: "ghost",
      assetClass: "cash",
      currency: "USD",
      lots: [],
      valuations: [],
      tags: [],
    };
    const pf = portfolioOf([noVal, holding("c", "cash", "50")]);
    const cash = tierLiquidity(pf, usdTable).find((t) => t.tier === "cash")!;
    expect(cash.holdingCount).toBe(1);
    expect(cash.gross.toString()).toBe("50 USD");
  });

  it("throws when the FX base does not match the portfolio base", () => {
    const pf = portfolioOf([holding("c", "cash", "1")], "USD");
    const wrong: FxRateTable = { base: "EUR", rates: { USD: "0.9" } };
    expect(() => tierLiquidity(pf, wrong)).toThrow(LiquidityError);
  });

  it("throws when a holding currency has no FX rate", () => {
    const pf = portfolioOf([holding("c", "cash", "1", "JPY")], "USD");
    expect(() => tierLiquidity(pf, usdTable)).toThrow(/No FX rate/);
  });

  it("rejects float, out-of-range, and malformed haircuts", () => {
    const pf = portfolioOf([holding("c", "cash", "1")]);
    // @ts-expect-error number is intentionally rejected at runtime
    expect(() => tierLiquidity(pf, usdTable, { marketable: 0.1 })).toThrow(/not a number/);
    expect(() => tierLiquidity(pf, usdTable, { marketable: "1.5" })).toThrow(/\[0, 1\]/);
    expect(() => tierLiquidity(pf, usdTable, { marketable: "-0.1" })).toThrow(/\[0, 1\]/);
    expect(() => tierLiquidity(pf, usdTable, { marketable: "abc" })).toThrow(/invalid haircut/);
  });
});

// ── analyzeCapitalCall: core coverage logic ──────────────────────────────────

describe("analyzeCapitalCall", () => {
  it("covers a small call out of cash alone, no forced illiquid sale", () => {
    const pf = portfolioOf([
      holding("cash", "cash", "1000"),
      holding("eq", "equity", "5000"),
      holding("art", "art", "100000"),
    ]);
    const cov = analyzeCapitalCall({
      portfolio: pf,
      fxTable: usdTable,
      call: usd("400"),
    });
    expect(cov.coveredByLiquid).toBe(true);
    expect(cov.requiresIlliquidSale).toBe(false);
    expect(cov.shortfall.isZero()).toBe(true);
    // Only the cash tier is drawn (cash is drained first and already covers it).
    const drawn = cov.waterfall.filter((w) => w.used.isPositive());
    expect(drawn).toHaveLength(1);
    expect(drawn[0].tier).toBe("cash");
    expect(drawn[0].used.toString()).toBe("400 USD");
    // Buffer = liquid net (cash 1000 + equity 5000*0.97) minus the 400 call.
    expect(cov.liquidBufferAfterCall.toString()).toBe("5450 USD");
  });

  it("drains tiers in priority order, spilling into the next tier", () => {
    const pf = portfolioOf([
      holding("cash", "cash", "1000"),
      holding("bond", "bond", "1000"),
      holding("eq", "equity", "1000"),
    ]);
    // Call 1500: exhausts cash (1000), takes 500 from near-cash, leaves marketable.
    const cov = analyzeCapitalCall({
      portfolio: pf,
      fxTable: usdTable,
      call: usd("1500"),
      haircuts: { "near-cash": "0", marketable: "0" },
    });
    const byTier = Object.fromEntries(cov.waterfall.map((w) => [w.tier, w]));
    expect(byTier.cash.used.toString()).toBe("1000 USD");
    expect(byTier.cash.remaining.isZero()).toBe(true);
    expect(byTier["near-cash"].used.toString()).toBe("500 USD");
    expect(byTier["near-cash"].remaining.toString()).toBe("500 USD");
    expect(byTier.marketable.used.isZero()).toBe(true);
    expect(byTier.marketable.remaining.toString()).toBe("1000 USD");
    expect(cov.coveredByLiquid).toBe(true);
    expect(cov.requiresIlliquidSale).toBe(false);
  });

  it("flags a forced illiquid sale when liquid assets fall short but total covers", () => {
    const pf = portfolioOf([
      holding("cash", "cash", "1000"),
      holding("art", "art", "1000000"),
    ]);
    const cov = analyzeCapitalCall({
      portfolio: pf,
      fxTable: usdTable,
      call: usd("50000"),
      haircuts: { illiquid: "0" },
    });
    expect(cov.coveredByLiquid).toBe(false);
    expect(cov.coveredByTotal).toBe(true);
    expect(cov.requiresIlliquidSale).toBe(true);
    expect(cov.shortfall.isZero()).toBe(true);
    const illiquidStep = cov.waterfall.find((w) => w.tier === "illiquid")!;
    expect(illiquidStep.forcedIlliquidSale).toBe(true);
    // cash 1000 first, then 49000 from the illiquid art.
    expect(illiquidStep.used.toString()).toBe("49000 USD");
    // Liquid buffer is negative: liquid assets (1000) minus the 50000 call.
    expect(cov.liquidBufferAfterCall.toString()).toBe("-49000 USD");
  });

  it("reports a residual shortfall when even selling everything is not enough", () => {
    const pf = portfolioOf([
      holding("cash", "cash", "1000"),
      holding("art", "art", "1000"),
    ]);
    const cov = analyzeCapitalCall({
      portfolio: pf,
      fxTable: usdTable,
      call: usd("5000"),
      haircuts: { illiquid: "0" },
    });
    expect(cov.coveredByTotal).toBe(false);
    expect(cov.coveredByLiquid).toBe(false);
    // total available 2000, call 5000 => shortfall 3000.
    expect(cov.shortfall.toString()).toBe("3000 USD");
    // Both tiers fully drained.
    expect(cov.waterfall.find((w) => w.tier === "cash")!.remaining.isZero()).toBe(true);
    expect(cov.waterfall.find((w) => w.tier === "illiquid")!.remaining.isZero()).toBe(true);
  });

  it("computes coverage ratios against liquid and total assets", () => {
    const pf = portfolioOf([
      holding("cash", "cash", "2000"),
      holding("art", "art", "8000"),
    ]);
    const cov = analyzeCapitalCall({
      portfolio: pf,
      fxTable: usdTable,
      call: usd("1000"),
      haircuts: { illiquid: "0" },
    });
    expect(cov.liquidCoverageRatio?.toString()).toBe("2");
    expect(cov.totalCoverageRatio?.toString()).toBe("10");
  });

  it("haircuts reduce net proceeds and can flip coverage", () => {
    const pf = portfolioOf([holding("eq", "equity", "1000")]);
    const noCut = analyzeCapitalCall({
      portfolio: pf,
      fxTable: usdTable,
      call: usd("950"),
      haircuts: { marketable: "0" },
    });
    expect(noCut.coveredByLiquid).toBe(true);
    const cut = analyzeCapitalCall({
      portfolio: pf,
      fxTable: usdTable,
      call: usd("950"),
      haircuts: { marketable: "0.10" }, // net 900 < 950
    });
    expect(cut.coveredByLiquid).toBe(false);
    expect(cut.shortfall.toString()).toBe("50 USD");
  });
});

// ── Edge cases ───────────────────────────────────────────────────────────────

describe("analyzeCapitalCall: edge cases", () => {
  it("treats a zero call as covered with undefined coverage ratios", () => {
    const pf = portfolioOf([holding("cash", "cash", "100")]);
    const cov = analyzeCapitalCall({ portfolio: pf, fxTable: usdTable, call: usd("0") });
    expect(cov.coveredByLiquid).toBe(true);
    expect(cov.coveredByTotal).toBe(true);
    expect(cov.requiresIlliquidSale).toBe(false);
    expect(cov.shortfall.isZero()).toBe(true);
    expect(cov.liquidCoverageRatio).toBeNull();
    expect(cov.totalCoverageRatio).toBeNull();
    expect(cov.waterfall.every((w) => w.used.isZero())).toBe(true);
  });

  it("an empty portfolio cannot cover any positive call", () => {
    const pf = portfolioOf([]);
    const cov = analyzeCapitalCall({ portfolio: pf, fxTable: usdTable, call: usd("100") });
    expect(cov.totalAvailable.isZero()).toBe(true);
    expect(cov.coveredByTotal).toBe(false);
    expect(cov.shortfall.toString()).toBe("100 USD");
    expect(cov.liquidCoverageRatio?.toString()).toBe("0");
  });

  it("throws when the call currency differs from the portfolio base", () => {
    const pf = portfolioOf([holding("cash", "cash", "100")], "USD");
    expect(() =>
      analyzeCapitalCall({ portfolio: pf, fxTable: usdTable, call: Money.of("100", "EUR") }),
    ).toThrow(/must match portfolio base/);
  });

  it("throws on a negative call", () => {
    const pf = portfolioOf([holding("cash", "cash", "100")]);
    expect(() =>
      analyzeCapitalCall({ portfolio: pf, fxTable: usdTable, call: usd("-1") }),
    ).toThrow(/non-negative/);
  });

  it("a call exactly equal to liquid assets is covered with a zero buffer", () => {
    const pf = portfolioOf([holding("cash", "cash", "1000")]);
    const cov = analyzeCapitalCall({ portfolio: pf, fxTable: usdTable, call: usd("1000") });
    expect(cov.coveredByLiquid).toBe(true);
    expect(cov.requiresIlliquidSale).toBe(false);
    expect(cov.liquidBufferAfterCall.isZero()).toBe(true);
    expect(cov.liquidCoverageRatio?.toString()).toBe("1");
    expect(cov.shortfall.isZero()).toBe(true);
  });

  it("the waterfall draws never exceed the call (no over-funding)", () => {
    const pf = portfolioOf([
      holding("cash", "cash", "1000"),
      holding("bond", "bond", "1000"),
      holding("art", "art", "1000"),
    ]);
    const cov = analyzeCapitalCall({
      portfolio: pf,
      fxTable: usdTable,
      call: usd("1500"),
      haircuts: { "near-cash": "0", illiquid: "0" },
    });
    const totalUsed = cov.waterfall.reduce(
      (acc, w) => acc.plus(w.used),
      Money.zero("USD"),
    );
    expect(totalUsed.toString()).toBe("1500 USD");
  });
});

// ── Multi-currency + invariants ──────────────────────────────────────────────

describe("analyzeCapitalCall: invariants", () => {
  it("net proceeds + remaining always reconcile per tier", () => {
    const cov = analyzeCapitalCall({
      portfolio: liquidityPortfolio,
      fxTable: liquidityFxTable,
      call: usd("500000"),
    });
    for (const step of cov.waterfall) {
      const tier = cov.tiers.find((t) => t.tier === step.tier)!;
      expect(step.used.plus(step.remaining).toString()).toBe(tier.net.toString());
    }
  });

  it("liquidAvailable + illiquidAvailable == totalAvailable", () => {
    const cov = analyzeCapitalCall({
      portfolio: liquidityPortfolio,
      fxTable: liquidityFxTable,
      call: usd("1000000"),
    });
    expect(cov.liquidAvailable.plus(cov.illiquidAvailable).toString()).toBe(
      cov.totalAvailable.toString(),
    );
  });

  it("a larger call never decreases the shortfall (monotonic)", () => {
    const small = analyzeCapitalCall({
      portfolio: liquidityPortfolio,
      fxTable: liquidityFxTable,
      call: usd("100000"),
    });
    const big = analyzeCapitalCall({
      portfolio: liquidityPortfolio,
      fxTable: liquidityFxTable,
      call: usd("9000000"),
    });
    expect(small.shortfall.isZero()).toBe(true);
    expect(big.shortfall.amount.greaterThan(small.shortfall.amount)).toBe(true);
  });
});

// ── Fixed-seed snapshot: pins the deterministic fixture roll-up ──────────────

describe("analyzeCapitalCall: fixture snapshot", () => {
  // These pin the deterministic output for the seeded portfolio + FX table.
  // A change here is an intentional, visible diff.
  it("matches the recorded seeded-portfolio liquidity", () => {
    const cov = analyzeCapitalCall({
      portfolio: liquidityPortfolio,
      fxTable: liquidityFxTable,
      call: usd("500000"),
    });
    expect(cov.baseCurrency).toBe("USD");

    const grossByTier = Object.fromEntries(
      cov.tiers.map((t) => [t.tier, t.gross.toString()]),
    );
    expect(grossByTier).toMatchInlineSnapshot(`
      {
        "cash": "343500 USD",
        "illiquid": "6054176 USD",
        "marketable": "601375 USD",
        "near-cash": "217512 USD",
      }
    `);

    expect(cov.liquidAvailable.toString()).toMatchInlineSnapshot(`"1142170.63 USD"`);
    expect(cov.illiquidAvailable.toString()).toMatchInlineSnapshot(`"4540632 USD"`);
    expect(cov.liquidCoverageRatio?.toFixed(6)).toMatchInlineSnapshot(`"2.284341"`);
    expect(cov.coveredByLiquid).toBe(true);
    expect(cov.requiresIlliquidSale).toBe(false);
    expect(cov.shortfall.toString()).toBe("0 USD");

    // The waterfall: cash fully drained, the rest taken from near-cash.
    expect(cov.waterfall.find((w) => w.tier === "cash")!.used.toString()).toBe(
      "343500 USD",
    );
    expect(
      cov.waterfall.find((w) => w.tier === "near-cash")!.used.toString(),
    ).toMatchInlineSnapshot(`"156500 USD"`);
    expect(cov.waterfall.find((w) => w.tier === "marketable")!.used.isZero()).toBe(true);
    expect(cov.waterfall.find((w) => w.tier === "illiquid")!.used.isZero()).toBe(true);
  });
});
