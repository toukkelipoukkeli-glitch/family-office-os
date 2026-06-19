import { describe, expect, it } from "vitest";

import { sampleCapTable, sampleRound, simpleRound } from "@/lib/captable";

import {
  buildViewModel,
  formatDelta,
  formatMoney,
  formatPercent,
  formatShares,
} from "./captable-view";

describe("formatters", () => {
  it("groups share counts with thousands separators", () => {
    expect(formatShares("4500000")).toBe("4,500,000");
    expect(formatShares("0")).toBe("0");
  });

  it("formats percentages, trimming trailing zeros", () => {
    expect(formatPercent(45)).toBe("45%");
    expect(formatPercent(33.3333)).toBe("33.33%");
  });

  it("formats signed deltas with a pp suffix", () => {
    expect(formatDelta(0)).toBe("—");
    expect(formatDelta(-9)).toBe("-9 pp");
    expect(formatDelta(2.5)).toBe("+2.5 pp");
  });

  it("formats money with currency and grouping", () => {
    expect(formatMoney("15000000", "EUR")).toBe("EUR 15,000,000");
    expect(formatMoney("1234.5", "USD")).toBe("USD 1,234.5");
  });
});

describe("buildViewModel — base table", () => {
  const vm = buildViewModel(sampleCapTable);

  it("reports company, total and ownership rows", () => {
    expect(vm.companyName).toBe("Acme Robotics Oy");
    expect(vm.totalShares).toBe("10000000");
    expect(vm.rows).toHaveLength(4);
    expect(vm.round).toBeUndefined();
  });

  it("includes a class breakdown summing to 100", () => {
    const total = vm.byClass.reduce((s, c) => s + c.percent, 0);
    expect(total).toBeCloseTo(100, 4);
  });
});

describe("buildViewModel — with a round", () => {
  it("surfaces round metrics and dilution for a simple round", () => {
    const vm = buildViewModel(sampleCapTable, simpleRound);
    expect(vm.round?.name).toBe("Bridge");
    expect(vm.round?.postMoney).toBe("10000000");
    expect(vm.round?.investorShares).toBe("2500000");
    expect(vm.round?.investorPercent).toBe(20);
    expect(vm.totalShares).toBe("12500000");
    // Every existing holder appears in the dilution list.
    expect(vm.round?.dilution).toHaveLength(sampleCapTable.entries.length);
  });

  it("creates pool shares for a round with a pool top-up", () => {
    const vm = buildViewModel(sampleCapTable, sampleRound);
    expect(BigInt(vm.round?.newPoolShares ?? "0")).toBeGreaterThan(0n);
    expect(vm.round?.postMoney).toBe("20000000");
  });
});
