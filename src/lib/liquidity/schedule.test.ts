import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import type { Commitment } from "@/lib/privatemarkets";

import { callObligations, householdBurnObligations } from "./schedule";

const window = { startPeriod: "2024-07", horizonMonths: 24 } as const;

const commitment: Commitment = {
  id: "pe-1",
  name: "Fund I",
  strategy: "Buyout",
  committed: "5000000",
  vintageYear: 2024,
  currency: "USD",
  ledger: [
    { date: "2024-09-15", kind: "call", amount: "1000000" }, // month 2
    { date: "2025-03-20", kind: "call", amount: "1500000" }, // month 8
    { date: "2026-03-15", kind: "distribution", amount: "800000" }, // month 20
  ],
};

describe("callObligations", () => {
  it("maps dated PE calls onto the month grid", () => {
    const obs = callObligations([commitment], window);
    expect(obs.map((o) => [o.month, new Decimal(o.amount).toFixed()])).toEqual([
      [2, "1000000"],
      [8, "1500000"],
    ]);
    expect(obs.every((o) => o.category === "pe-call")).toBe(true);
  });

  it("nets a same-month distribution against a call", () => {
    const c: Commitment = {
      ...commitment,
      ledger: [
        { date: "2024-09-15", kind: "call", amount: "1000000" }, // month 2
        { date: "2024-09-25", kind: "distribution", amount: "400000" }, // month 2
      ],
    };
    const obs = callObligations([c], window);
    expect(obs).toHaveLength(1);
    expect(new Decimal(obs[0].amount).toFixed()).toBe("600000");
  });

  it("drops a month where a same-month distribution fully offsets the call", () => {
    const c: Commitment = {
      ...commitment,
      ledger: [
        { date: "2024-09-15", kind: "call", amount: "500000" },
        { date: "2024-09-25", kind: "distribution", amount: "500000" },
      ],
    };
    expect(callObligations([c], window)).toHaveLength(0);
  });

  it("does not net a distribution in a different month against a call", () => {
    // The 2026-03 distribution (month 20) must not reduce the month-2/-8 calls.
    const obs = callObligations([commitment], window);
    expect(obs.reduce((s, o) => s + new Decimal(o.amount).toNumber(), 0)).toBe(
      2500000,
    );
  });
});

describe("householdBurnObligations", () => {
  it("turns each net-outflow month into a burn obligation", () => {
    const obs = householdBurnObligations({
      openingBalance: 0,
      horizonMonths: 3,
      currency: "USD",
      recurring: [
        {
          id: "in",
          label: "in",
          category: "income",
          direction: "inflow",
          amount: "40000",
          frequency: "monthly",
        },
        {
          id: "out",
          label: "out",
          category: "living",
          direction: "outflow",
          amount: "50000",
          frequency: "monthly",
        },
      ],
    });
    expect(obs).toHaveLength(3);
    expect(obs.every((o) => new Decimal(o.amount).toFixed() === "10000")).toBe(
      true,
    );
    expect(obs.every((o) => o.category === "household-burn")).toBe(true);
  });

  it("emits no obligation for a cashflow-positive month", () => {
    const obs = householdBurnObligations({
      openingBalance: 0,
      horizonMonths: 2,
      currency: "USD",
      recurring: [
        {
          id: "in",
          label: "in",
          category: "income",
          direction: "inflow",
          amount: "50000",
          frequency: "monthly",
        },
        {
          id: "out",
          label: "out",
          category: "living",
          direction: "outflow",
          amount: "40000",
          frequency: "monthly",
        },
      ],
    });
    expect(obs).toHaveLength(0);
  });
});
