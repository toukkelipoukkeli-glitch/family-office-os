import { describe, expect, it } from "vitest";

import { Money } from "@/lib/money";
import {
  CashflowError,
  FLOW_DIRECTION,
  FLOW_KINDS,
  balanceTrajectory,
  closingBalances,
  forecastCashflow,
  inflowCoverageRatio,
  itemOccursIn,
  periodLabel,
  type FlowItem,
} from "./cashflow";
import {
  SAMPLE_FORECAST_INPUT,
  SAMPLE_FLOW_ITEMS,
  TIGHT_FORECAST_INPUT,
} from "./fixtures";

const usd = (v: string | number) => Money.of(v, "USD");

function item(partial: Partial<FlowItem> & Pick<FlowItem, "id" | "kind">): FlowItem {
  return {
    label: partial.label ?? partial.id,
    frequency: partial.frequency ?? "once",
    amount: partial.amount ?? usd(100),
    start: partial.start ?? 0,
    end: partial.end,
    ...partial,
  };
}

describe("FLOW direction", () => {
  it("treats commitments and expenses as outflows, distributions as inflows", () => {
    expect(FLOW_DIRECTION.commitment).toBe("outflow");
    expect(FLOW_DIRECTION.expense).toBe("outflow");
    expect(FLOW_DIRECTION.distribution).toBe("inflow");
    expect(new Set(FLOW_KINDS)).toEqual(
      new Set(["commitment", "distribution", "expense"]),
    );
  });
});

describe("itemOccursIn", () => {
  it("a `once` item occurs only in its start period", () => {
    const it = item({ id: "x", kind: "expense", frequency: "once", start: 3 });
    expect(itemOccursIn(it, 2)).toBe(false);
    expect(itemOccursIn(it, 3)).toBe(true);
    expect(itemOccursIn(it, 4)).toBe(false);
  });

  it("a monthly item recurs every period from start", () => {
    const it = item({ id: "x", kind: "expense", frequency: "monthly", start: 2 });
    expect(itemOccursIn(it, 1)).toBe(false);
    expect([2, 3, 4, 5].every((p) => itemOccursIn(it, p))).toBe(true);
  });

  it("a quarterly item recurs every 3rd period; annual every 12th", () => {
    const q = item({ id: "q", kind: "expense", frequency: "quarterly", start: 1 });
    expect([1, 4, 7, 10].every((p) => itemOccursIn(q, p))).toBe(true);
    expect([2, 3, 5, 6].some((p) => itemOccursIn(q, p))).toBe(false);

    const a = item({ id: "a", kind: "distribution", frequency: "annual", start: 0 });
    expect(itemOccursIn(a, 0)).toBe(true);
    expect(itemOccursIn(a, 12)).toBe(true);
    expect(itemOccursIn(a, 6)).toBe(false);
  });

  it("respects an inclusive end window", () => {
    const it = item({
      id: "x",
      kind: "expense",
      frequency: "monthly",
      start: 1,
      end: 3,
    });
    expect([1, 2, 3].every((p) => itemOccursIn(it, p))).toBe(true);
    expect(itemOccursIn(it, 4)).toBe(false);
  });
});

describe("forecastCashflow — hand-computed small case", () => {
  // Opening 1000; +200/mo distribution; -150/mo expense; one -500 call at p2.
  const input = {
    baseCurrency: "USD",
    openingCash: usd(1000),
    periods: 4,
    items: [
      item({ id: "rent", kind: "distribution", frequency: "monthly", amount: usd(200) }),
      item({ id: "opex", kind: "expense", frequency: "monthly", amount: usd(150) }),
      item({ id: "call", kind: "commitment", frequency: "once", amount: usd(500), start: 2 }),
    ],
  } as const;

  it("computes opening/net/closing per period exactly", () => {
    const f = forecastCashflow(input);
    // p0: +200 -150 = +50 -> 1050
    // p1: +50 -> 1100
    // p2: +200 -150 -500 = -450 -> 650
    // p3: +50 -> 700
    expect(closingBalances(f)).toEqual([1050, 1100, 650, 700]);
    expect(f.series[2].inflow.amount.toNumber()).toBe(200);
    expect(f.series[2].outflow.amount.toNumber()).toBe(650);
    expect(f.series[2].net.amount.toNumber()).toBe(-450);
    expect(f.series[0].opening.equals(usd(1000))).toBe(true);
  });

  it("aggregates the whole-horizon totals and ending balance", () => {
    const f = forecastCashflow(input);
    // inflow: 200*4 = 800; outflow: 150*4 + 500 = 1100; net -300; ending 700
    expect(f.totalInflow.amount.toNumber()).toBe(800);
    expect(f.totalOutflow.amount.toNumber()).toBe(1100);
    expect(f.netChange.amount.toNumber()).toBe(-300);
    expect(f.endingCash.amount.toNumber()).toBe(700);
  });

  it("tracks the lowest balance and its period", () => {
    const f = forecastCashflow(input);
    expect(f.lowestBalance.amount.toNumber()).toBe(650);
    expect(f.lowestBalancePeriod).toBe(2);
  });

  it("never goes negative, so runway equals the full horizon", () => {
    const f = forecastCashflow(input);
    expect(f.runwayExhausted).toBe(false);
    expect(f.runwayPeriods).toBe(4);
    expect(f.depletionPeriod).toBeNull();
  });

  it("balanceTrajectory prepends the opening cash", () => {
    const f = forecastCashflow(input);
    expect(balanceTrajectory(f)).toEqual([1000, 1050, 1100, 650, 700]);
  });

  it("splits each period into a signed per-kind breakdown", () => {
    const f = forecastCashflow(input);
    const p2 = f.series[2].byKind;
    const byKind = Object.fromEntries(
      p2.map((b) => [b.kind, b.signed.amount.toNumber()]),
    );
    expect(byKind).toEqual({
      commitment: -500,
      distribution: 200,
      expense: -150,
    });
  });
});

describe("forecastCashflow — runway depletion", () => {
  it("reports the first period whose closing goes negative", () => {
    const f = forecastCashflow({
      baseCurrency: "USD",
      openingCash: usd(100),
      periods: 3,
      items: [item({ id: "burn", kind: "expense", frequency: "monthly", amount: usd(60) })],
    });
    // p0: 40, p1: -20 (depleted), p2: -80
    expect(closingBalances(f)).toEqual([40, -20, -80]);
    expect(f.runwayExhausted).toBe(true);
    expect(f.depletionPeriod).toBe(1);
    expect(f.runwayPeriods).toBe(1);
  });

  it("runway is 0 when period 0 already closes negative", () => {
    const f = forecastCashflow({
      baseCurrency: "USD",
      openingCash: usd(10),
      periods: 2,
      items: [item({ id: "burn", kind: "expense", frequency: "monthly", amount: usd(60) })],
    });
    expect(f.depletionPeriod).toBe(0);
    expect(f.runwayPeriods).toBe(0);
  });

  it("a balance that recovers above zero keeps the FIRST depletion period", () => {
    const f = forecastCashflow({
      baseCurrency: "USD",
      openingCash: usd(50),
      periods: 3,
      items: [
        item({ id: "call", kind: "commitment", frequency: "once", amount: usd(100), start: 0 }),
        item({ id: "dist", kind: "distribution", frequency: "once", amount: usd(500), start: 1 }),
      ],
    });
    // p0: -50, p1: +450, p2: 450
    expect(closingBalances(f)).toEqual([-50, 450, 450]);
    expect(f.depletionPeriod).toBe(0);
    expect(f.runwayPeriods).toBe(0);
    expect(f.lowestBalance.amount.toNumber()).toBe(-50);
    expect(f.lowestBalancePeriod).toBe(0);
  });
});

describe("forecastCashflow — validation", () => {
  const ok = item({ id: "a", kind: "expense" });

  it("rejects a non-positive or non-integer horizon", () => {
    expect(() =>
      forecastCashflow({ baseCurrency: "USD", openingCash: usd(0), periods: 0, items: [] }),
    ).toThrow(CashflowError);
    expect(() =>
      forecastCashflow({ baseCurrency: "USD", openingCash: usd(0), periods: 2.5, items: [] }),
    ).toThrow(/positive integer/);
  });

  it("rejects an opening-cash currency mismatch", () => {
    expect(() =>
      forecastCashflow({
        baseCurrency: "USD",
        openingCash: Money.of(1, "EUR"),
        periods: 1,
        items: [],
      }),
    ).toThrow(/openingCash currency/);
  });

  it("rejects an item currency mismatch", () => {
    expect(() =>
      forecastCashflow({
        baseCurrency: "USD",
        openingCash: usd(0),
        periods: 1,
        items: [item({ id: "x", kind: "expense", amount: Money.of(1, "GBP") })],
      }),
    ).toThrow(/must match base/);
  });

  it("rejects a negative amount magnitude", () => {
    expect(() =>
      forecastCashflow({
        baseCurrency: "USD",
        openingCash: usd(0),
        periods: 1,
        items: [item({ id: "x", kind: "expense", amount: usd(-1) })],
      }),
    ).toThrow(/non-negative magnitude/);
  });

  it("rejects duplicate item ids", () => {
    expect(() =>
      forecastCashflow({
        baseCurrency: "USD",
        openingCash: usd(0),
        periods: 1,
        items: [ok, ok],
      }),
    ).toThrow(/duplicate flow item id/);
  });

  it("rejects an inverted or invalid item window", () => {
    expect(() =>
      forecastCashflow({
        baseCurrency: "USD",
        openingCash: usd(0),
        periods: 4,
        items: [item({ id: "x", kind: "expense", start: 3, end: 1 })],
      }),
    ).toThrow(/before start/);
    expect(() =>
      forecastCashflow({
        baseCurrency: "USD",
        openingCash: usd(0),
        periods: 4,
        items: [item({ id: "x", kind: "expense", start: -1 })],
      }),
    ).toThrow(/non-negative integer/);
  });

  it("normalizes the base currency to uppercase", () => {
    const f = forecastCashflow({
      baseCurrency: "usd",
      openingCash: usd(100),
      periods: 1,
      items: [],
    });
    expect(f.baseCurrency).toBe("USD");
  });
});

describe("inflowCoverageRatio", () => {
  it("is inflow / outflow, or null when there is no outflow", () => {
    const f = forecastCashflow({
      baseCurrency: "USD",
      openingCash: usd(0),
      periods: 1,
      items: [
        item({ id: "in", kind: "distribution", amount: usd(300) }),
        item({ id: "out", kind: "expense", amount: usd(150) }),
      ],
    });
    expect(inflowCoverageRatio(f)?.toNumber()).toBe(2);

    const noOut = forecastCashflow({
      baseCurrency: "USD",
      openingCash: usd(0),
      periods: 1,
      items: [item({ id: "in", kind: "distribution", amount: usd(300) })],
    });
    expect(inflowCoverageRatio(noOut)).toBeNull();
  });
});

describe("periodLabel", () => {
  it("renders a compact month label", () => {
    expect(periodLabel(0)).toBe("M0");
    expect(periodLabel(11)).toBe("M11");
  });
});

describe("fixtures — base case survives the horizon", () => {
  it("projects 12 periods and stays cash-positive", () => {
    const f = forecastCashflow(SAMPLE_FORECAST_INPUT);
    expect(f.series).toHaveLength(12);
    expect(f.runwayExhausted).toBe(false);
    expect(f.runwayPeriods).toBe(12);
    expect(f.depletionPeriod).toBeNull();
    // Every closing balance is strictly positive.
    expect(f.series.every((s) => s.closing.isPositive())).toBe(true);
    expect(f.endingCash.amount.toNumber()).toBe(2520000);
    expect(f.lowestBalance.amount.toNumber()).toBe(1700000);
    expect(f.lowestBalancePeriod).toBe(10);
  });

  it("conserves cash: opening + netChange == endingCash", () => {
    const f = forecastCashflow(SAMPLE_FORECAST_INPUT);
    expect(
      f.openingCash.plus(f.netChange).equals(f.endingCash),
    ).toBe(true);
  });

  it("conserves cash period over period: opening + net == closing", () => {
    const f = forecastCashflow(SAMPLE_FORECAST_INPUT);
    for (const s of f.series) {
      expect(s.opening.plus(s.net).equals(s.closing)).toBe(true);
    }
    // And each period's opening equals the prior period's closing.
    for (let i = 1; i < f.series.length; i++) {
      expect(f.series[i].opening.equals(f.series[i - 1].closing)).toBe(true);
    }
  });
});

describe("fixtures — tight case exhausts runway", () => {
  it("runs out of cash within the horizon", () => {
    const f = forecastCashflow(TIGHT_FORECAST_INPUT);
    expect(f.runwayExhausted).toBe(true);
    expect(f.depletionPeriod).toBe(1);
    expect(f.runwayPeriods).toBe(1);
  });

  it("uses the same schedule as the base case (only opening differs)", () => {
    expect(TIGHT_FORECAST_INPUT.items).toBe(SAMPLE_FLOW_ITEMS);
    expect(
      TIGHT_FORECAST_INPUT.openingCash.lessThan(
        SAMPLE_FORECAST_INPUT.openingCash,
      ),
    ).toBe(true);
  });
});
