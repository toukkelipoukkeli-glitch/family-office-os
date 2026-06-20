import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import {
  addMonths,
  projectCashflow,
  type CashflowInput,
  type RecurringFlow,
} from "./engine";

describe("addMonths", () => {
  it("advances within and across year boundaries", () => {
    expect(addMonths("2024-01", 0)).toBe("2024-01");
    expect(addMonths("2024-01", 1)).toBe("2024-02");
    expect(addMonths("2024-11", 2)).toBe("2025-01");
    expect(addMonths("2024-07", 23)).toBe("2026-06");
    expect(addMonths("2024-12", 13)).toBe("2026-01");
  });
});

describe("projectCashflow — small hand-computed cases", () => {
  it("rolls a single monthly inflow forward with the right balances", () => {
    const p = projectCashflow({
      openingBalance: "1000",
      horizonMonths: 3,
      currency: "USD",
      startPeriod: "2024-01",
      recurring: [
        {
          id: "x",
          label: "X",
          category: "salary",
          direction: "inflow",
          amount: "100",
          frequency: "monthly",
        },
      ],
    });
    expect(p.months.map((m) => m.period)).toEqual([
      "2024-01",
      "2024-02",
      "2024-03",
    ]);
    expect(p.months.map((m) => m.closingBalance.toNumber())).toEqual([
      1100, 1200, 1300,
    ]);
    expect(p.months[0].openingBalance.toNumber()).toBe(1000);
    expect(p.summary.endingBalance.toNumber()).toBe(1300);
    expect(p.summary.totalInflows.toNumber()).toBe(300);
    expect(p.summary.totalOutflows.toNumber()).toBe(0);
    expect(p.summary.firstShortfallMonth).toBeNull();
  });

  it("places quarterly and annual flows on the correct months", () => {
    const recurring: RecurringFlow[] = [
      {
        id: "q",
        label: "Q",
        category: "dividends",
        direction: "inflow",
        amount: "300",
        frequency: "quarterly",
      },
      {
        id: "a",
        label: "A",
        category: "fees",
        direction: "outflow",
        amount: "1200",
        frequency: "annual",
      },
    ];
    const p = projectCashflow({
      openingBalance: "0",
      horizonMonths: 13,
      currency: "USD",
      startPeriod: "2024-01",
      recurring,
    });
    // Quarterly inflow lands on months 0,3,6,9,12 → 5 occurrences of 300.
    const inflowMonths = p.months
      .filter((m) => m.inflows.greaterThan(0))
      .map((m) => m.index);
    expect(inflowMonths).toEqual([0, 3, 6, 9, 12]);
    expect(p.summary.totalInflows.toNumber()).toBe(5 * 300);
    // Annual outflow on months 0 and 12 → 2 occurrences of 1200.
    const outflowMonths = p.months
      .filter((m) => m.outflows.greaterThan(0))
      .map((m) => m.index);
    expect(outflowMonths).toEqual([0, 12]);
    expect(p.summary.totalOutflows.toNumber()).toBe(2 * 1200);
  });

  it("honours startMonth / endMonth windows", () => {
    const p = projectCashflow({
      openingBalance: "0",
      horizonMonths: 6,
      currency: "USD",
      startPeriod: "2024-01",
      recurring: [
        {
          id: "s",
          label: "S",
          category: "salary",
          direction: "inflow",
          amount: "10",
          frequency: "monthly",
          startMonth: 2,
          endMonth: 4,
        },
      ],
    });
    const active = p.months
      .filter((m) => m.inflows.greaterThan(0))
      .map((m) => m.index);
    expect(active).toEqual([2, 3, 4]);
    expect(p.summary.totalInflows.toNumber()).toBe(30);
  });

  it("applies one-off PE calls (outflow) and distributions (inflow)", () => {
    const p = projectCashflow({
      openingBalance: "500",
      horizonMonths: 4,
      currency: "USD",
      startPeriod: "2024-01",
      oneOff: [
        {
          id: "call",
          label: "Call",
          category: "pe-call",
          direction: "outflow",
          amount: "1000",
          month: 1,
        },
        {
          id: "dist",
          label: "Dist",
          category: "pe-distribution",
          direction: "inflow",
          amount: "2000",
          month: 3,
        },
      ],
    });
    expect(p.months.map((m) => m.closingBalance.toNumber())).toEqual([
      500, -500, -500, 1500,
    ]);
    // Goes negative at month 1; min balance is -500 at month 1 (first occurrence).
    expect(p.summary.firstShortfallMonth).toBe(1);
    expect(p.summary.minBalance.toNumber()).toBe(-500);
    expect(p.summary.minBalanceMonth).toBe(1);
    expect(p.summary.endingBalance.toNumber()).toBe(1500);
  });

  it("keeps exact decimal arithmetic (no float drift)", () => {
    const p = projectCashflow({
      openingBalance: "0",
      horizonMonths: 3,
      currency: "USD",
      recurring: [
        {
          id: "p",
          label: "P",
          category: "salary",
          direction: "inflow",
          amount: "0.1",
          frequency: "monthly",
        },
      ],
    });
    // 0.1 * 3 = 0.3 exactly with Decimal (a float would give 0.30000000000000004).
    expect(p.summary.endingBalance.equals(new Decimal("0.3"))).toBe(true);
  });
});

describe("projectCashflow — validation", () => {
  const base: CashflowInput = {
    openingBalance: "0",
    horizonMonths: 1,
    currency: "USD",
  };

  it("rejects a non-positive horizon", () => {
    expect(() => projectCashflow({ ...base, horizonMonths: 0 })).toThrow(
      /horizonMonths/,
    );
    expect(() => projectCashflow({ ...base, horizonMonths: 1.5 })).toThrow(
      /horizonMonths/,
    );
  });

  it("rejects negative magnitudes", () => {
    expect(() =>
      projectCashflow({
        ...base,
        recurring: [
          {
            id: "n",
            label: "N",
            category: "x",
            direction: "inflow",
            amount: "-1",
            frequency: "monthly",
          },
        ],
      }),
    ).toThrow(/non-negative/);
  });

  it("rejects a malformed startPeriod", () => {
    expect(() => projectCashflow({ ...base, startPeriod: "2024-13" })).toThrow(
      /calendar month/,
    );
    expect(() => projectCashflow({ ...base, startPeriod: "24-01" })).toThrow(
      /ISO YYYY-MM/,
    );
  });

  it("rejects an endMonth before startMonth", () => {
    expect(() =>
      projectCashflow({
        ...base,
        horizonMonths: 5,
        recurring: [
          {
            id: "w",
            label: "W",
            category: "x",
            direction: "inflow",
            amount: "1",
            frequency: "monthly",
            startMonth: 3,
            endMonth: 1,
          },
        ],
      }),
    ).toThrow(/endMonth before startMonth/);
  });
});
