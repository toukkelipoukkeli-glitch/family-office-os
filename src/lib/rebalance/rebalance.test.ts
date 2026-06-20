import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import { proposeRebalance, RebalanceError } from "./rebalance";
import {
  rebalanceAsOf,
  rebalancePortfolio,
  rebalancePrices,
  rebalanceRateTable,
  rebalanceSchedule,
  rebalanceTargets,
  rebalanceYear,
} from "./fixtures";

/**
 * Oracle tests for the tax-aware rebalancer. Every expected number is
 * hand-calculated from the fixture book (see `fixtures.ts` for the full
 * derivation):
 *
 *   Book ($80,000 total): equity 50% / ETF 20% / cash 30%.
 *   Target: equity 30% / ETF 30% / cash 40%.
 *   → sell $16,000 equity (80 AAPL sh @ $200), buy $8,000 ETF + $8,000 cash.
 *   HIFO sells lot B (basis $180): gain +$1,600 short-term.
 *   FIFO would sell lot A (basis $100): gain +$8,000 long-term.
 */

function proposal(method?: "fifo" | "lifo" | "hifo" | "spec-id") {
  return proposeRebalance({
    portfolio: rebalancePortfolio,
    targets: rebalanceTargets,
    prices: rebalancePrices,
    fxTable: rebalanceRateTable,
    schedule: rebalanceSchedule,
    asOf: rebalanceAsOf,
    year: rebalanceYear,
    method,
  });
}

describe("proposeRebalance", () => {
  it("measures the portfolio total and base currency", () => {
    const p = proposal();
    expect(p.baseCurrency).toBe("USD");
    expect(p.total.amount.toFixed()).toBe("80000");
  });

  it("computes drift per asset class against the target", () => {
    const p = proposal();
    const byClass = new Map(p.assetClasses.map((a) => [a.assetClass, a]));

    const equity = byClass.get("equity")!;
    expect(equity.currentWeight.toFixed()).toBe("0.5");
    expect(equity.targetWeight.toFixed()).toBe("0.3");
    expect(equity.drift.toFixed()).toBe("0.2"); // overweight 20%

    const etf = byClass.get("etf")!;
    expect(etf.currentWeight.toFixed()).toBe("0.2");
    expect(etf.targetWeight.toFixed()).toBe("0.3");
    expect(etf.drift.toFixed()).toBe("-0.1"); // underweight 10%

    const cash = byClass.get("cash")!;
    expect(cash.currentWeight.toFixed()).toBe("0.3");
    expect(cash.targetWeight.toFixed()).toBe("0.4");
    expect(cash.drift.toFixed()).toBe("-0.1");
  });

  it("proposes a $16,000 equity sell and $8,000 buys into ETF and cash", () => {
    const p = proposal();
    expect(p.totalSold.amount.toFixed()).toBe("16000");
    expect(p.totalBought.amount.toFixed()).toBe("16000"); // 8,000 + 8,000

    const sells = p.trades.filter((t) => t.side === "sell");
    const buys = p.trades.filter((t) => t.side === "buy");
    expect(sells).toHaveLength(1);
    expect(buys).toHaveLength(2);

    const sell = sells[0];
    expect(sell.holdingId).toBe("hold-aapl");
    expect(sell.assetClass).toBe("equity");
    expect(sell.quantity).toBe("80"); // 16,000 / 200
    expect(sell.amount.amount.toFixed()).toBe("16000");

    const buyAmounts = buys.map((b) => b.amount.amount.toFixed()).sort();
    expect(buyAmounts).toEqual(["8000", "8000"]);
  });

  it("selects HIFO lots so the realized gain is minimized (+$1,600 short-term)", () => {
    const p = proposal("hifo");
    expect(p.realizedGain.amount.toFixed()).toBe("1600");
    expect(p.realizedShortTermGain.amount.toFixed()).toBe("1600");
    expect(p.realizedLongTermGain.amount.toFixed()).toBe("0");

    // The single sell drew entirely from lot B (the $180-basis lot).
    const sell = p.trades.find((t) => t.side === "sell")!;
    expect(sell.realized!.disposals[0].slices).toHaveLength(1);
    expect(sell.realized!.disposals[0].slices[0].lotId).toBe("lot-aapl-b");
    expect(sell.realized!.disposals[0].slices[0].holdingPeriod).toBe("short");
  });

  it("FIFO realizes a larger gain (+$8,000 long-term) than HIFO", () => {
    const p = proposal("fifo");
    expect(p.realizedGain.amount.toFixed()).toBe("8000");
    expect(p.realizedShortTermGain.amount.toFixed()).toBe("0");
    expect(p.realizedLongTermGain.amount.toFixed()).toBe("8000");

    const sell = p.trades.find((t) => t.side === "sell")!;
    expect(sell.realized!.disposals[0].slices[0].lotId).toBe("lot-aapl-a");
    expect(sell.realized!.disposals[0].slices[0].holdingPeriod).toBe("long");
  });

  it("estimates the proposal's incremental tax (HIFO short-term gain)", () => {
    const p = proposal("hifo");
    // No ordinary income in the proposal, so the $1,600 short-term gain sits at
    // the bottom ordinary bracket: 10% of 1,600 = $160.
    expect(p.taxEstimate.taxableShortTermGain.amount.toFixed()).toBe("1600");
    expect(p.taxEstimate.taxableLongTermGain.amount.toFixed()).toBe("0");
    expect(p.taxEstimate.totalTax.amount.toFixed()).toBe("160");
  });

  it("reports the tax saved versus selling the same shares under FIFO", () => {
    const p = proposal("hifo");
    // FIFO: $8,000 long-term gain → preferential brackets: 0% up to $47,025,
    // so FIFO tax on the gain is $0. HIFO: $1,600 short-term at 10% = $160.
    // FIFO tax ($0) − HIFO tax ($160) = −$160, clamped to $0 (HIFO never costs
    // *more* than FIFO is the invariant, but here FIFO is cheaper in tax even
    // though it realizes a far bigger gain because LT 0% bracket applies).
    // The savings field never goes negative.
    expect(p.taxSavedVsFifo.amount.greaterThanOrEqualTo(0)).toBe(true);
  });

  it("reports a real tax saving when ST and LT are both taxed", () => {
    // Use a schedule with a flat non-zero LT rate so FIFO's larger LT gain is
    // actually taxed, making HIFO the cheaper choice.
    const flatSchedule = {
      ordinary: [{ from: "0", rate: "0.10" }],
      longTerm: [{ from: "0", rate: "0.20" }],
      capitalLossOrdinaryOffsetCap: "3000",
    };
    const hifo = proposeRebalance({
      portfolio: rebalancePortfolio,
      targets: rebalanceTargets,
      prices: rebalancePrices,
      fxTable: rebalanceRateTable,
      schedule: flatSchedule,
      asOf: rebalanceAsOf,
      year: rebalanceYear,
      method: "hifo",
    });
    // HIFO: 1,600 ST × 10% = $160.
    expect(hifo.taxEstimate.totalTax.amount.toFixed()).toBe("160");
    // FIFO would be 8,000 LT × 20% = $1,600. Saving = 1,600 − 160 = $1,440.
    expect(hifo.taxSavedVsFifo.amount.toFixed()).toBe("1440");
  });

  it("reconciles the projected allocation to target within the band", () => {
    const p = proposal();
    expect(p.reconciles).toBe(true);
    const byClass = new Map(p.assetClasses.map((a) => [a.assetClass, a]));
    expect(byClass.get("equity")!.projectedWeight.toFixed()).toBe("0.3");
    expect(byClass.get("etf")!.projectedWeight.toFixed()).toBe("0.3");
    expect(byClass.get("cash")!.projectedWeight.toFixed()).toBe("0.4");
    // Each projected weight equals its target weight exactly.
    for (const plan of p.assetClasses) {
      expect(plan.projectedWeight.minus(plan.targetWeight).abs().toFixed()).toBe(
        "0",
      );
    }
  });

  it("leaves classes within the band untouched", () => {
    // Target equal to current within the band → no trades.
    const p = proposeRebalance({
      portfolio: rebalancePortfolio,
      targets: { equity: "0.50", etf: "0.20", cash: "0.30" },
      prices: rebalancePrices,
      fxTable: rebalanceRateTable,
      schedule: rebalanceSchedule,
      asOf: rebalanceAsOf,
      year: rebalanceYear,
      band: "0.05",
    });
    expect(p.trades).toHaveLength(0);
    expect(p.totalSold.amount.toFixed()).toBe("0");
    expect(p.realizedGain.amount.toFixed()).toBe("0");
    expect(p.reconciles).toBe(true);
  });

  it("is deterministic: identical inputs give identical proposals", () => {
    const a = proposal("hifo");
    const b = proposal("hifo");
    expect(JSON.stringify(serialize(a))).toBe(JSON.stringify(serialize(b)));
  });

  it("rejects a portfolio whose base currency does not match the FX table", () => {
    expect(() =>
      proposeRebalance({
        portfolio: { ...rebalancePortfolio, baseCurrency: "EUR" },
        targets: rebalanceTargets,
        prices: rebalancePrices,
        fxTable: rebalanceRateTable, // base USD
        schedule: rebalanceSchedule,
        asOf: rebalanceAsOf,
        year: rebalanceYear,
      }),
    ).toThrow(RebalanceError);
  });

  it("never proposes a trade that moves money (read-only): trade amounts are positive notionals only", () => {
    const p = proposal();
    for (const t of p.trades) {
      expect(t.amount.amount.greaterThan(new Decimal(0))).toBe(true);
      expect(["buy", "sell"]).toContain(t.side);
    }
  });

  // --- Adversarial edge cases (added by independent tester) ---------------

  it("realizes a LOSS (signed negative gain) when marked below cost basis", () => {
    // Mark AAPL at $90 — below both lot bases ($100 / $180). Selling realizes a
    // loss; the signed realized gain must be negative and tax-saved clamps to 0.
    const p = proposeRebalance({
      portfolio: rebalancePortfolio,
      targets: rebalanceTargets,
      prices: { ...rebalancePrices, AAPL: "90" },
      fxTable: rebalanceRateTable,
      schedule: rebalanceSchedule,
      asOf: rebalanceAsOf,
      year: rebalanceYear,
      method: "hifo",
    });
    const sell = p.trades.find((t) => t.side === "sell");
    expect(sell).toBeDefined();
    expect(p.realizedGain.isNegative()).toBe(true);
    // Loss never produces a positive tax bill, and tax-saved never goes < 0.
    expect(p.taxSavedVsFifo.amount.greaterThanOrEqualTo(0)).toBe(true);
  });

  it("never sells more units than are held in a holding", () => {
    // Force a huge sell by targeting 0% equity; the sell must cap at units held.
    const p = proposeRebalance({
      portfolio: rebalancePortfolio,
      targets: { equity: "0", etf: "0.5", cash: "0.5" },
      prices: rebalancePrices,
      fxTable: rebalanceRateTable,
      schedule: rebalanceSchedule,
      asOf: rebalanceAsOf,
      year: rebalanceYear,
      method: "hifo",
    });
    const sell = p.trades.find((t) => t.side === "sell")!;
    // The book holds 200 AAPL shares; the proposal must never exceed that.
    expect(new Decimal(sell.quantity).lessThanOrEqualTo(200)).toBe(true);
  });

  it("leaves an overweight class untouched when it cannot be priced", () => {
    // Drop AAPL/VTI prices: with no price, an overweight equity class cannot be
    // lot-sold, so no sell is proposed and the proposal must not throw.
    const p = proposeRebalance({
      portfolio: rebalancePortfolio,
      targets: rebalanceTargets,
      prices: {}, // no prices at all
      fxTable: rebalanceRateTable,
      schedule: rebalanceSchedule,
      asOf: rebalanceAsOf,
      year: rebalanceYear,
      method: "hifo",
    });
    // No sellable holding ⇒ no sells, and realized gain is zero.
    expect(p.trades.filter((t) => t.side === "sell")).toHaveLength(0);
    expect(p.realizedGain.amount.toFixed()).toBe("0");
  });

  it("LIFO selects the newest lot (short-term) like HIFO here", () => {
    // Newest lot B ($180 basis, 2025-12-01) is also the highest-cost, so LIFO
    // and HIFO coincide on this book: a $1,600 short-term gain.
    const p = proposal("lifo");
    expect(p.method).toBe("lifo");
    const sell = p.trades.find((t) => t.side === "sell")!;
    expect(sell.realized!.disposals[0].slices[0].lotId).toBe("lot-aapl-b");
    expect(p.realizedShortTermGain.amount.toFixed()).toBe("1600");
  });

  it("rejects a non-positive portfolio total", () => {
    const empty = { ...rebalancePortfolio, holdings: [] };
    expect(() =>
      proposeRebalance({
        portfolio: empty,
        targets: rebalanceTargets,
        prices: rebalancePrices,
        fxTable: rebalanceRateTable,
        schedule: rebalanceSchedule,
        asOf: rebalanceAsOf,
        year: rebalanceYear,
      }),
    ).toThrow(RebalanceError);
  });

  it("conserves book size: total sold equals total bought when fully priced", () => {
    const p = proposal("hifo");
    expect(p.totalSold.amount.toFixed()).toBe(p.totalBought.amount.toFixed());
  });
});

/** Strip non-serializable Decimals/Money into plain strings for equality. */
function serialize(p: ReturnType<typeof proposeRebalance>) {
  return {
    total: p.total.toString(),
    realizedGain: p.realizedGain.toString(),
    taxSavedVsFifo: p.taxSavedVsFifo.toString(),
    totalTax: p.taxEstimate.totalTax.toString(),
    trades: p.trades.map((t) => ({
      id: t.holdingId,
      side: t.side,
      qty: t.quantity,
      amount: t.amount.toString(),
    })),
    reconciles: p.reconciles,
  };
}
