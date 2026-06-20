import { describe, expect, it } from "vitest";

import type { Commitment } from "@/lib/privatemarkets";

import { peScheduleFlows, sleeveScheduleFlows } from "./pe-schedule";

const fund: Commitment = {
  id: "f1",
  name: "Fund One",
  strategy: "Buyout",
  committed: "1000000",
  vintageYear: 2024,
  currency: "USD",
  ledger: [
    { date: "2024-09-15", kind: "call", amount: "100000", label: "Call #1" },
    { date: "2025-03-20", kind: "distribution", amount: "50000" },
    { date: "2023-01-01", kind: "call", amount: "999999" }, // before window
    { date: "2030-01-01", kind: "call", amount: "888888" }, // after window
  ],
};

describe("peScheduleFlows", () => {
  it("maps calls to outflows and distributions to inflows on the month grid", () => {
    const flows = peScheduleFlows(fund, {
      startPeriod: "2024-07",
      horizonMonths: 24,
    });
    // Only the two in-window entries survive.
    expect(flows).toHaveLength(2);

    const call = flows.find((f) => f.category === "pe-call")!;
    expect(call.direction).toBe("outflow");
    expect(call.month).toBe(2); // 2024-09 is 2 months after 2024-07
    expect(Number(call.amount)).toBe(100000);
    expect(call.label).toBe("Call #1");

    const dist = flows.find((f) => f.category === "pe-distribution")!;
    expect(dist.direction).toBe("inflow");
    expect(dist.month).toBe(8); // 2025-03 is 8 months after 2024-07
    expect(Number(dist.amount)).toBe(50000);
    // Falls back to a synthesized label when none is given.
    expect(dist.label).toContain("distribution");
  });

  it("drops entries outside the horizon window", () => {
    const flows = peScheduleFlows(fund, {
      startPeriod: "2024-07",
      horizonMonths: 24,
    });
    expect(flows.some((f) => Number(f.amount) === 999999)).toBe(false);
    expect(flows.some((f) => Number(f.amount) === 888888)).toBe(false);
  });

  it("flattens a whole sleeve in commitment order", () => {
    const other: Commitment = {
      ...fund,
      id: "f2",
      name: "Fund Two",
      ledger: [
        { date: "2024-10-01", kind: "call", amount: "200000" },
      ],
    };
    const flows = sleeveScheduleFlows([fund, other], {
      startPeriod: "2024-07",
      horizonMonths: 24,
    });
    expect(flows).toHaveLength(3);
    expect(flows.map((f) => f.id)).toEqual([
      "f1-call-0",
      "f1-distribution-1",
      "f2-call-0",
    ]);
  });
});
