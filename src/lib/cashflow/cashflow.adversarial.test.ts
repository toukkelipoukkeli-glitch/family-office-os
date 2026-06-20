/**
 * Adversarial / boundary tests for the cashflow forecast (independent tester).
 *
 * These pin behaviors at the exact edges of the runway/depletion contract that
 * the primary suite leaves implicit: the zero-balance boundary, the inclusive
 * `end` window, lowest-balance tie-breaking, and the view-layer's breach flag.
 */
import { describe, expect, it } from "vitest";

import { Money } from "@/lib/money";
import {
  closingBalances,
  forecastCashflow,
  itemOccursIn,
  type FlowItem,
} from "./cashflow";
import {
  compactCurrency,
  flowRows,
  runwayKpis,
} from "@/cashflow/cashflow-view";

const usd = (v: string | number) => Money.of(v, "USD");

function item(
  partial: Partial<FlowItem> & Pick<FlowItem, "id" | "kind">,
): FlowItem {
  return {
    label: partial.label ?? partial.id,
    frequency: partial.frequency ?? "once",
    amount: partial.amount ?? usd(100),
    start: partial.start ?? 0,
    end: partial.end,
    ...partial,
  };
}

describe("cashflow — zero-balance boundary", () => {
  it("a closing balance of exactly 0 is NOT depletion and NOT breached", () => {
    // Opening 100, single 100 outflow at p0 → closes at exactly 0.
    const f = forecastCashflow({
      baseCurrency: "USD",
      openingCash: usd(100),
      periods: 2,
      items: [item({ id: "call", kind: "commitment", amount: usd(100), start: 0 })],
    });
    expect(closingBalances(f)).toEqual([0, 0]);
    expect(f.depletionPeriod).toBeNull();
    expect(f.runwayExhausted).toBe(false);
    expect(f.runwayPeriods).toBe(f.periods);
    // View layer agrees: exact-zero rows are not flagged breached.
    expect(flowRows(f).every((r) => r.breached === false)).toBe(true);
    // A zero lowest balance is toned "up" (not below zero).
    expect(runwayKpis(f).lowestTone).toBe("up");
  });

  it("one cent below zero IS depletion", () => {
    const f = forecastCashflow({
      baseCurrency: "USD",
      openingCash: usd("100.00"),
      periods: 1,
      items: [item({ id: "call", kind: "commitment", amount: usd("100.01"), start: 0 })],
    });
    expect(f.depletionPeriod).toBe(0);
    expect(f.runwayExhausted).toBe(true);
    expect(flowRows(f)[0].breached).toBe(true);
    expect(runwayKpis(f).lowestTone).toBe("down");
  });
});

describe("cashflow — inclusive end window", () => {
  it("a recurring item fires through `end` inclusive and never after", () => {
    const monthly = item({
      id: "rent",
      kind: "expense",
      frequency: "monthly",
      start: 1,
      end: 3,
    });
    expect(itemOccursIn(monthly, 0)).toBe(false);
    expect([1, 2, 3].every((p) => itemOccursIn(monthly, p))).toBe(true);
    expect(itemOccursIn(monthly, 4)).toBe(false);
  });

  it("an item whose start lands off the frequency grid still anchors on start", () => {
    // quarterly anchored at start=2 → fires at 2,5,8 (not 0,3,6).
    const q = item({ id: "q", kind: "expense", frequency: "quarterly", start: 2 });
    expect([2, 5, 8].every((p) => itemOccursIn(q, p))).toBe(true);
    expect([3, 4].every((p) => !itemOccursIn(q, p))).toBe(true);
  });
});

describe("cashflow — lowest-balance tie-breaking", () => {
  it("keeps the FIRST period when the trough is hit more than once", () => {
    // Flat: opening 50, no flows → every closing is 50, lowest is the start.
    const flat = forecastCashflow({
      baseCurrency: "USD",
      openingCash: usd(50),
      periods: 3,
      items: [],
    });
    expect(flat.lowestBalance.amount.toNumber()).toBe(50);
    // First period (p0) wins the tie, never a later equal one.
    expect(flat.lowestBalancePeriod).toBe(0);
  });

  it("ties at a negative trough still report the first occurrence", () => {
    const f = forecastCashflow({
      baseCurrency: "USD",
      openingCash: usd(10),
      periods: 3,
      items: [item({ id: "burn", kind: "expense", amount: usd(30), start: 0 })],
    });
    // p0 closes -20, then flat at -20.
    expect(closingBalances(f)).toEqual([-20, -20, -20]);
    expect(f.lowestBalancePeriod).toBe(0);
  });
});

describe("cashflow — view rows survive a no-flow forecast", () => {
  it("emits all-zero per-kind breakdown with stable signs", () => {
    const f = forecastCashflow({
      baseCurrency: "USD",
      openingCash: usd(1000),
      periods: 2,
      items: [],
    });
    const rows = flowRows(f);
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      // No negative-zero leaks into any rendered number (would print "-$0").
      for (const v of [
        r.byKind.expense,
        r.byKind.commitment,
        r.byKind.distribution,
        r.inflow,
        r.outflow,
        r.net,
        r.opening,
        r.closing,
      ]) {
        expect(Object.is(v, -0)).toBe(false);
      }
      expect(r.outflow).toBe(0);
      expect(r.net).toBe(0);
    }
  });

  it("compactCurrency never renders a negative zero as -$0", () => {
    expect(compactCurrency(-0, "USD")).toBe("$0");
    expect(compactCurrency(0, "USD")).toBe("$0");
  });
});
