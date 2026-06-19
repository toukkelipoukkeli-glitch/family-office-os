/**
 * Adversarial / property-style coverage for the liquidity capital-call engine.
 *
 * These tests are independent of the worker's own suite: they hammer the
 * invariants that must hold for *any* input, plus a few nasty edge cases the
 * happy-path tests don't reach. Deterministic and offline — every "random"
 * portfolio is generated from a fixed integer seed.
 */
import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import { Money } from "@/lib/money";
import { ASSET_CLASSES, type AssetClass } from "@/lib/model/asset-class";
import type { Holding } from "@/lib/model/holding";
import type { Portfolio } from "@/lib/model/portfolio";
import type { FxRateTable } from "@/lib/allocation";

import {
  analyzeCapitalCall,
  isLiquidTier,
  LIQUIDITY_TIERS,
  LiquidityError,
  liquidityTierFor,
  tierLiquidity,
} from "./liquidity";

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
    id: "pf-adv",
    name: "Adversarial",
    baseCurrency,
    holdings,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-06-18T00:00:00Z",
  };
}

const usdTable: FxRateTable = { base: "USD", rates: {} };
const usd = (a: string) => Money.of(a, "USD");

/** Tiny deterministic LCG so generated portfolios are reproducible. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function randomPortfolio(seed: number, n: number): Portfolio {
  const rnd = lcg(seed);
  const holdings: Holding[] = [];
  for (let i = 0; i < n; i++) {
    const ac = ASSET_CLASSES[Math.floor(rnd() * ASSET_CLASSES.length)];
    // Integer minor-unit-ish amounts, 0..1,000,000.
    const amt = Math.floor(rnd() * 1_000_000).toString();
    holdings.push(holding(`h${i}`, ac, amt));
  }
  return portfolioOf(holdings);
}

describe("liquidity invariants (property style)", () => {
  it("per-tier: used + remaining == net, and used <= net, for many random books", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const pf = randomPortfolio(seed, 12);
      const callAmt = Math.floor(lcg(seed * 7 + 1)() * 5_000_000).toString();
      const cov = analyzeCapitalCall({
        portfolio: pf,
        fxTable: usdTable,
        call: usd(callAmt),
      });
      for (const step of cov.waterfall) {
        const tier = cov.tiers.find((t) => t.tier === step.tier)!;
        // reconcile
        expect(step.used.plus(step.remaining).toString()).toBe(tier.net.toString());
        // never over-draw a tier
        expect(step.used.amount.lessThanOrEqualTo(tier.net.amount)).toBe(true);
        // never negative
        expect(step.used.isNegative()).toBe(false);
        expect(step.remaining.isNegative()).toBe(false);
      }
    }
  });

  it("total drawn == min(call, totalAvailable); shortfall == max(0, call - total)", () => {
    for (let seed = 100; seed <= 140; seed++) {
      const pf = randomPortfolio(seed, 10);
      const callAmt = Math.floor(lcg(seed * 3 + 5)() * 8_000_000).toString();
      const call = usd(callAmt);
      const cov = analyzeCapitalCall({ portfolio: pf, fxTable: usdTable, call });

      const totalUsed = cov.waterfall.reduce(
        (acc, w) => acc.plus(w.used),
        Money.zero("USD"),
      );
      const expectedUsed = call.amount.lessThan(cov.totalAvailable.amount)
        ? call.amount
        : cov.totalAvailable.amount;
      expect(totalUsed.amount.toString()).toBe(expectedUsed.toString());

      const expectedShortfall = Decimal.max(
        0,
        call.amount.minus(cov.totalAvailable.amount),
      );
      expect(cov.shortfall.amount.toString()).toBe(expectedShortfall.toString());
      expect(cov.coveredByTotal).toBe(cov.shortfall.isZero());
    }
  });

  it("coveredByLiquid implies coveredByTotal and no forced illiquid sale", () => {
    for (let seed = 200; seed <= 240; seed++) {
      const pf = randomPortfolio(seed, 9);
      const callAmt = Math.floor(lcg(seed * 11 + 2)() * 3_000_000).toString();
      const cov = analyzeCapitalCall({
        portfolio: pf,
        fxTable: usdTable,
        call: usd(callAmt),
      });
      if (cov.coveredByLiquid) {
        expect(cov.coveredByTotal).toBe(true);
        expect(cov.requiresIlliquidSale).toBe(false);
        // liquid buffer must be >= 0 when liquid covers the call
        expect(cov.liquidBufferAfterCall.isNegative()).toBe(false);
      }
    }
  });

  it("monotonic: a larger call never reduces total drawn nor shortfall", () => {
    const pf = randomPortfolio(7, 14);
    let prevUsed = new Decimal(-1);
    let prevShortfall = new Decimal(-1);
    for (const c of ["0", "100000", "500000", "2000000", "9000000", "50000000"]) {
      const cov = analyzeCapitalCall({ portfolio: pf, fxTable: usdTable, call: usd(c) });
      const used = cov.waterfall.reduce(
        (acc, w) => acc.plus(w.used),
        Money.zero("USD"),
      ).amount;
      expect(used.greaterThanOrEqualTo(prevUsed)).toBe(true);
      expect(cov.shortfall.amount.greaterThanOrEqualTo(prevShortfall)).toBe(true);
      prevUsed = used;
      prevShortfall = cov.shortfall.amount;
    }
  });
});

describe("liquidity nasty edge cases", () => {
  it("a self-rate for the base currency is harmless (base==1)", () => {
    const pf = portfolioOf([holding("c", "cash", "100", "USD")]);
    const table: FxRateTable = { base: "USD", rates: { USD: "1" } };
    const tiers = tierLiquidity(pf, table);
    expect(tiers.find((t) => t.tier === "cash")!.gross.toString()).toBe("100 USD");
  });

  it("a 100% haircut zeroes a tier's net even with large gross", () => {
    const pf = portfolioOf([holding("art", "art", "1000000")]);
    const cov = analyzeCapitalCall({
      portfolio: pf,
      fxTable: usdTable,
      call: usd("1"),
      haircuts: { illiquid: "1" },
    });
    expect(cov.illiquidAvailable.isZero()).toBe(true);
    expect(cov.totalAvailable.isZero()).toBe(true);
    expect(cov.coveredByTotal).toBe(false);
    expect(cov.shortfall.toString()).toBe("1 USD");
    // The illiquid tier was *not* drawn (nothing to draw), so no forced sale flag.
    expect(cov.requiresIlliquidSale).toBe(false);
  });

  it("fractional haircuts keep exact decimal proceeds (no float drift)", () => {
    const pf = portfolioOf([holding("eq", "equity", "333.33")]);
    const cov = analyzeCapitalCall({
      portfolio: pf,
      fxTable: usdTable,
      call: usd("0"),
      haircuts: { marketable: "0.333333" },
    });
    const mk = cov.tiers.find((t) => t.tier === "marketable")!;
    // 333.33 * (1 - 0.333333) = 333.33 * 0.666667 = 222.22011111 (exact decimal)
    expect(mk.net.amount.toFixed(8)).toBe("222.22011111");
  });

  it("every asset class lands in a liquid-or-illiquid tier with consistent flags", () => {
    for (const ac of ASSET_CLASSES) {
      const tier = liquidityTierFor(ac);
      expect(LIQUIDITY_TIERS).toContain(tier);
      // isLiquidTier must agree with the illiquid label exactly.
      expect(isLiquidTier(tier)).toBe(tier !== "illiquid");
    }
  });

  it("rejects a haircut object with an unknown/extra key silently (only known tiers applied)", () => {
    const pf = portfolioOf([holding("eq", "equity", "1000")]);
    // Extra key is ignored; marketable still uses its default 0.03.
    const cov = analyzeCapitalCall({
      portfolio: pf,
      fxTable: usdTable,
      call: usd("0"),
      // @ts-expect-error bogus tier key is not part of the type
      haircuts: { bogus: "0.5" },
    });
    const mk = cov.tiers.find((t) => t.tier === "marketable")!;
    expect(mk.net.toString()).toBe("970 USD");
  });

  it("a forced illiquid sale that exactly clears the call leaves zero shortfall and a negative liquid buffer", () => {
    const pf = portfolioOf([
      holding("cash", "cash", "100"),
      holding("art", "art", "900"),
    ]);
    const cov = analyzeCapitalCall({
      portfolio: pf,
      fxTable: usdTable,
      call: usd("1000"),
      haircuts: { illiquid: "0" },
    });
    expect(cov.coveredByTotal).toBe(true);
    expect(cov.requiresIlliquidSale).toBe(true);
    expect(cov.shortfall.isZero()).toBe(true);
    expect(cov.liquidBufferAfterCall.toString()).toBe("-900 USD");
  });

  it("throws on NaN-ish / non-finite haircut strings", () => {
    const pf = portfolioOf([holding("c", "cash", "1")]);
    expect(() => tierLiquidity(pf, usdTable, { marketable: "Infinity" })).toThrow(
      LiquidityError,
    );
    expect(() => tierLiquidity(pf, usdTable, { marketable: "NaN" })).toThrow(
      LiquidityError,
    );
  });
});
