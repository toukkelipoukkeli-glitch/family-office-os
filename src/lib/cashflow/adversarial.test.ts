import { describe, expect, it } from "vitest";

import {
  addMonths,
  projectCashflow,
  type CashflowInput,
  type OneOffFlow,
  type RecurringFlow,
} from "./engine";
import { peScheduleFlows } from "./pe-schedule";
import { buildCashflowModel } from "./view";
import type { Commitment } from "@/lib/privatemarkets";

/**
 * Independent, adversarial edge-case tests for the m9-cashflow engine + view.
 * These target invariants and boundary conditions the unit's own tests do not
 * exercise — most importantly the category-rollup re-implementation in view.ts,
 * which must stay reconciled with the engine's summary totals for *any* input.
 */

describe("addMonths — adversarial boundaries", () => {
  it("is the inverse of a delta and never produces month 00 or 13", () => {
    // Walk a full multi-year span one month at a time; every label must be a
    // real calendar month and strictly increasing.
    let prev = "";
    for (let d = 0; d <= 40; d++) {
      const period = addMonths("2024-11", d);
      const mm = Number(period.split("-")[1]);
      expect(mm).toBeGreaterThanOrEqual(1);
      expect(mm).toBeLessThanOrEqual(12);
      if (prev) expect(period > prev).toBe(true);
      prev = period;
    }
  });

  it("pads years below 1000 to four digits", () => {
    // Defensive: addMonths must never emit a 3-digit year that breaks YYYY-MM.
    expect(addMonths("0999-12", 1)).toBe("1000-01");
  });
});

describe("category rollup reconciles with engine summary for arbitrary inputs", () => {
  // The view's categoryTotals() re-derives recurring occurrence counts
  // independently of engine.occursIn(). For ANY input the per-category inflow /
  // outflow sums must equal the engine's totalInflows / totalOutflows exactly.
  const inputs: CashflowInput[] = [
    // Windowed recurring flows whose end clips before the horizon, plus a
    // quarterly flow starting off-grid.
    {
      openingBalance: "1000",
      horizonMonths: 14,
      currency: "USD",
      recurring: [
        {
          id: "a",
          label: "A",
          category: "salary",
          direction: "inflow",
          amount: "100",
          frequency: "monthly",
          startMonth: 3,
          endMonth: 9,
        },
        {
          id: "b",
          label: "B",
          category: "dividends",
          direction: "inflow",
          amount: "250",
          frequency: "quarterly",
          startMonth: 1,
        },
        {
          id: "c",
          label: "C",
          category: "fees",
          direction: "outflow",
          amount: "999",
          frequency: "annual",
        },
      ],
      oneOff: [
        {
          id: "o1",
          label: "Call",
          category: "pe-call",
          direction: "outflow",
          amount: "5000",
          month: 13,
        },
      ],
    },
    // endMonth beyond horizon (must be clipped by the horizon, not endMonth).
    {
      openingBalance: "0",
      horizonMonths: 5,
      currency: "EUR",
      recurring: [
        {
          id: "x",
          label: "X",
          category: "rent",
          direction: "inflow",
          amount: "10",
          frequency: "monthly",
          endMonth: 999,
        },
      ],
    },
  ];

  for (const [i, input] of inputs.entries()) {
    it(`case ${i}`, () => {
      const projection = projectCashflow(input);
      const model = buildCashflowModel({ input });
      const inSum = model.categories
        .filter((c) => c.direction === "inflow")
        .reduce((a, c) => a + c.total, 0);
      const outSum = model.categories
        .filter((c) => c.direction === "outflow")
        .reduce((a, c) => a + c.total, 0);
      expect(inSum).toBe(projection.summary.totalInflows.toNumber());
      expect(outSum).toBe(projection.summary.totalOutflows.toNumber());
    });
  }
});

describe("projectCashflow — minBalance / shortfall edge cases", () => {
  it("reports the opening balance as the minimum when cash only ever rises", () => {
    const p = projectCashflow({
      openingBalance: "100",
      horizonMonths: 3,
      currency: "USD",
      recurring: [
        {
          id: "in",
          label: "In",
          category: "salary",
          direction: "inflow",
          amount: "50",
          frequency: "monthly",
        },
      ],
    });
    // The engine seeds the running minimum with the OPENING balance, so when
    // every month's closing (150, 200, 250) is higher, the reported floor is
    // the opening 100 — the household's lowest cash position over the horizon —
    // attributed to month 0. This is the intended liquidity convention.
    expect(p.summary.minBalance.toNumber()).toBe(100);
    expect(p.summary.minBalanceMonth).toBe(0);
    expect(p.summary.firstShortfallMonth).toBeNull();
  });

  it("treats a closing balance of exactly zero as NOT a shortfall", () => {
    const p = projectCashflow({
      openingBalance: "1000",
      horizonMonths: 1,
      currency: "USD",
      oneOff: [
        {
          id: "drain",
          label: "Drain",
          category: "pe-call",
          direction: "outflow",
          amount: "1000",
          month: 0,
        },
      ],
    });
    expect(p.months[0].closingBalance.toNumber()).toBe(0);
    expect(p.summary.firstShortfallMonth).toBeNull();
  });

  it("picks the FIRST month for a tie in the running minimum", () => {
    const p = projectCashflow({
      openingBalance: "0",
      horizonMonths: 4,
      currency: "USD",
      oneOff: [
        {
          id: "d1",
          label: "d1",
          category: "x",
          direction: "outflow",
          amount: "100",
          month: 0,
        },
        {
          id: "u1",
          label: "u1",
          category: "y",
          direction: "inflow",
          amount: "100",
          month: 1,
        },
        {
          id: "d2",
          label: "d2",
          category: "x",
          direction: "outflow",
          amount: "100",
          month: 2,
        },
      ],
    });
    // Closings: -100, 0, -100, -100. The min (-100) is first reached at month 0.
    expect(p.summary.minBalance.toNumber()).toBe(-100);
    expect(p.summary.minBalanceMonth).toBe(0);
    expect(p.summary.firstShortfallMonth).toBe(0);
  });

  it("rejects a non-finite opening balance and a NaN amount", () => {
    expect(() =>
      projectCashflow({
        openingBalance: Infinity,
        horizonMonths: 1,
        currency: "USD",
      }),
    ).toThrow(/non-finite/);
    expect(() =>
      projectCashflow({
        openingBalance: "0",
        horizonMonths: 1,
        currency: "USD",
        oneOff: [
          {
            id: "n",
            label: "N",
            category: "x",
            direction: "inflow",
            amount: NaN,
            frequency: undefined as never,
            month: 0,
          } as unknown as OneOffFlow,
        ],
      }),
    ).toThrow(/non-finite/);
  });

  it("rejects a malformed flow direction (fail fast, no silent mis-signing)", () => {
    expect(() =>
      projectCashflow({
        openingBalance: "0",
        horizonMonths: 1,
        currency: "USD",
        recurring: [
          {
            id: "bad",
            label: "Bad",
            category: "x",
            direction: "credit" as never,
            amount: "1",
            frequency: "monthly",
          },
        ],
      }),
    ).toThrow(/direction must be/);
    expect(() =>
      projectCashflow({
        openingBalance: "0",
        horizonMonths: 1,
        currency: "USD",
        oneOff: [
          {
            id: "bad",
            label: "Bad",
            category: "x",
            direction: "debit" as never,
            amount: "1",
            month: 0,
          },
        ],
      }),
    ).toThrow(/direction must be/);
  });

  it("rejects a negative one-off month", () => {
    expect(() =>
      projectCashflow({
        openingBalance: "0",
        horizonMonths: 2,
        currency: "USD",
        oneOff: [
          {
            id: "n",
            label: "N",
            category: "x",
            direction: "inflow",
            amount: "1",
            month: -1,
          },
        ],
      }),
    ).toThrow(/non-negative integer/);
  });

  it("silently ignores a one-off landing past the horizon (no balance change)", () => {
    const p = projectCashflow({
      openingBalance: "500",
      horizonMonths: 2,
      currency: "USD",
      oneOff: [
        {
          id: "far",
          label: "Far",
          category: "pe-call",
          direction: "outflow",
          amount: "999999",
          month: 5,
        },
      ],
    });
    // Month 5 is outside [0,2); it must not touch any projected balance.
    expect(p.summary.endingBalance.toNumber()).toBe(500);
    expect(p.summary.totalOutflows.toNumber()).toBe(0);
  });
});

describe("peScheduleFlows — horizon boundary", () => {
  const base: Commitment = {
    id: "f",
    name: "Fund",
    strategy: "Buyout",
    committed: "1000000",
    vintageYear: 2024,
    currency: "USD",
    ledger: [],
  };

  it("keeps an entry on the last in-window month and drops the next month", () => {
    const c: Commitment = {
      ...base,
      ledger: [
        // horizon 12 → months [0,12). 2024-07 + 11 = 2025-06 is the last month.
        { date: "2025-06-30", kind: "call", amount: "1", label: "last" },
        // 2025-07 is month 12 → dropped.
        { date: "2025-07-01", kind: "call", amount: "2", label: "over" },
      ],
    };
    const flows = peScheduleFlows(c, {
      startPeriod: "2024-07",
      horizonMonths: 12,
    });
    expect(flows).toHaveLength(1);
    expect(flows[0].month).toBe(11);
    expect(flows[0].label).toBe("last");
  });

  it("rejects a malformed startPeriod and ledger date (no NaN month leaks)", () => {
    const c: Commitment = {
      ...base,
      ledger: [{ date: "2024-09-15", kind: "call", amount: "1" }],
    };
    expect(() =>
      peScheduleFlows(c, { startPeriod: "2024/07", horizonMonths: 6 }),
    ).toThrow(/startPeriod must be ISO/);
    const bad: Commitment = {
      ...base,
      ledger: [{ date: "not-a-date", kind: "call", amount: "1" }],
    };
    expect(() =>
      peScheduleFlows(bad, { startPeriod: "2024-07", horizonMonths: 6 }),
    ).toThrow(/ledger date must be ISO/);
  });

  it("rejects an unknown ledger kind inside the horizon", () => {
    const c: Commitment = {
      ...base,
      ledger: [
        {
          date: "2024-09-15",
          kind: "transfer" as never,
          amount: "1",
        },
      ],
    };
    expect(() =>
      peScheduleFlows(c, { startPeriod: "2024-07", horizonMonths: 6 }),
    ).toThrow(/unknown ledger kind/);
  });

  it("keeps an entry exactly on month 0", () => {
    const c: Commitment = {
      ...base,
      ledger: [{ date: "2024-07-15", kind: "distribution", amount: "10" }],
    };
    const flows = peScheduleFlows(c, {
      startPeriod: "2024-07",
      horizonMonths: 6,
    });
    expect(flows).toHaveLength(1);
    expect(flows[0].month).toBe(0);
    expect(flows[0].direction).toBe("inflow");
  });
});

describe("buildCashflowModel — degenerate inputs render safely", () => {
  it("handles a horizon with no flows at all", () => {
    const model = buildCashflowModel({
      input: {
        openingBalance: "100",
        horizonMonths: 2,
        currency: "USD",
      },
    });
    expect(model.months).toHaveLength(2);
    expect(model.categories).toHaveLength(0);
    expect(model.kpis.totalInflows).toBe(0);
    expect(model.kpis.totalOutflows).toBe(0);
    expect(model.kpis.endingBalance).toBe(100);
    // minBalancePeriod must still resolve to a real month, not undefined.
    expect(model.kpis.minBalancePeriod).toBe(model.months[0].period);
  });
});

// Type-only guard so unused imports above stay meaningful in CI.
const _typecheck: RecurringFlow["frequency"] = "monthly";
void _typecheck;
