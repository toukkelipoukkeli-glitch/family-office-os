import { describe, expect, it } from "vitest";

import {
  proposeRebalance,
  rebalanceAsOf,
  rebalancePortfolio,
  rebalancePrices,
  rebalanceRateTable,
  rebalanceSchedule,
  rebalanceTargets,
  rebalanceYear,
} from "@/lib/rebalance";

import { buildRebalanceViewModel } from "./rebalance-view";

function vmFor(method: "hifo" | "fifo" | "lifo") {
  return buildRebalanceViewModel(
    proposeRebalance({
      portfolio: rebalancePortfolio,
      targets: rebalanceTargets,
      prices: rebalancePrices,
      fxTable: rebalanceRateTable,
      schedule: rebalanceSchedule,
      asOf: rebalanceAsOf,
      year: rebalanceYear,
      method,
    }),
  );
}

describe("buildRebalanceViewModel", () => {
  it("formats the headline numbers", () => {
    const vm = vmFor("hifo");
    expect(vm.baseCurrency).toBe("USD");
    expect(vm.methodLabel).toBe("HIFO");
    expect(vm.totalLabel).toBe("$80,000.00");
    expect(vm.bandLabel).toBe("5.0%");
    expect(vm.totalSoldLabel).toBe("$16,000.00");
    expect(vm.totalBoughtLabel).toBe("$16,000.00");
    expect(vm.sellCount).toBe(1);
    expect(vm.buyCount).toBe(2);
    expect(vm.reconciles).toBe(true);
  });

  it("formats the realized gain with a sign and the tax estimate", () => {
    const vm = vmFor("hifo");
    expect(vm.realizedGainLabel).toBe("+$1,600.00");
    expect(vm.realizedIsLoss).toBe(false);
    expect(vm.realizedShortTermLabel).toBe("$1,600.00");
    expect(vm.realizedLongTermLabel).toBe("$0.00");
    expect(vm.estimatedTaxLabel).toBe("$160.00");
  });

  it("shows the equity row as a sell and the others as buys", () => {
    const vm = vmFor("hifo");
    const byClass = new Map(vm.assetClasses.map((r) => [r.assetClass, r]));
    const equity = byClass.get("equity")!;
    expect(equity.action).toBe("Sell");
    expect(equity.overweight).toBe(true);
    expect(equity.currentWeightLabel).toBe("50.0%");
    expect(equity.targetWeightLabel).toBe("30.0%");
    expect(equity.projectedWeightLabel).toBe("30.0%");
    expect(equity.driftLabel).toBe("+20.0%");

    expect(byClass.get("etf")!.action).toBe("Buy");
    expect(byClass.get("etf")!.driftLabel).toBe("−10.0%");
    expect(byClass.get("cash")!.action).toBe("Buy");
  });

  it("builds a sell trade row with quantity, amount and gain split", () => {
    const vm = vmFor("hifo");
    const sell = vm.trades.find((t) => t.side === "sell")!;
    expect(sell.sideLabel).toBe("Sell");
    expect(sell.holdingName).toBe("Apple Inc.");
    expect(sell.symbol).toBe("AAPL");
    expect(sell.quantityLabel).toBe("80");
    expect(sell.amountLabel).toBe("$16,000.00");
    expect(sell.realizedGainLabel).toBe("+$1,600.00");
    expect(sell.gainSplitLabel).toContain("ST");
    expect(sell.gainSplitLabel).toContain("LT");
  });

  it("builds buy trade rows without a quantity or gain", () => {
    const vm = vmFor("hifo");
    const buys = vm.trades.filter((t) => t.side === "buy");
    expect(buys).toHaveLength(2);
    for (const buy of buys) {
      expect(buy.sideLabel).toBe("Buy");
      expect(buy.quantityLabel).toBeUndefined();
      expect(buy.realizedGainLabel).toBeUndefined();
    }
  });

  it("FIFO shows a larger long-term realized gain than HIFO", () => {
    const hifo = vmFor("hifo");
    const fifo = vmFor("fifo");
    expect(hifo.realizedShortTermLabel).toBe("$1,600.00");
    expect(fifo.realizedLongTermLabel).toBe("$8,000.00");
    expect(fifo.realizedShortTermLabel).toBe("$0.00");
  });
});
