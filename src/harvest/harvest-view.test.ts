import { describe, expect, it } from "vitest";

import { sampleAsOf, sampleLedger, samplePrices } from "@/lib/harvest";

import { buildHarvestViewModel } from "./harvest-view";

const OPTS = {
  prices: samplePrices,
  asOf: sampleAsOf,
  method: "fifo" as const,
};

describe("buildHarvestViewModel", () => {
  const vm = buildHarvestViewModel(sampleLedger, OPTS);

  it("formats candidate rows worst-loss first", () => {
    expect(vm.rows.map((r) => r.lotId)).toEqual([
      "tsla-1",
      "baba-1",
      "meta-1",
      "baba-2",
    ]);
    expect(vm.rows[0].harvestableLoss).toBe("$21,000.00");
    expect(vm.rows[0].unrealizedGain).toBe("−$21,000.00");
    expect(vm.rows[0].marketValue).toBe("$35,000.00"); // 200 * $175
  });

  it("labels wash-sale status and clean status", () => {
    const byId = Object.fromEntries(vm.rows.map((r) => [r.lotId, r]));
    expect(byId["tsla-1"].washSaleRisk).toBe(false);
    expect(byId["tsla-1"].statusLabel).toBe("Clean");
    expect(byId["baba-1"].washSaleRisk).toBe(true);
    expect(byId["baba-1"].statusLabel).toBe("Wash-sale risk");
  });

  it("renders human-readable conflict timing (before/after)", () => {
    const byId = Object.fromEntries(vm.rows.map((r) => [r.lotId, r]));
    expect(byId["baba-1"].conflicts).toHaveLength(1);
    expect(byId["baba-1"].conflicts[0].timing).toBe("12 days before");
    expect(byId["meta-1"].conflicts[0].timing).toBe("20 days after");
  });

  it("totals clean vs blocked harvestable loss", () => {
    expect(vm.totals.candidates).toBe(4);
    expect(vm.totals.flagged).toBe(3);
    expect(vm.totals.clean).toBe("$21,000.00");
    expect(vm.totals.blocked).toBe("$14,060.00");
    expect(vm.totals.total).toBe("$35,060.00");
  });

  it("carries method and currency", () => {
    expect(vm.method).toBe("fifo");
    expect(vm.methodLabel).toBe("FIFO");
    expect(vm.currency).toBe("USD");
    expect(vm.empty).toBe(false);
  });

  it("reports empty when nothing is underwater", () => {
    const up = buildHarvestViewModel(sampleLedger, {
      prices: { NVDA: "900", TSLA: "999", BABA: "999", META: "999" },
      asOf: sampleAsOf,
    });
    expect(up.empty).toBe(true);
    expect(up.rows).toHaveLength(0);
    expect(up.totals.total).toBe("$0.00");
  });
});
