import { describe, expect, it } from "vitest";

import { sampleAsOf, sampleLedger, samplePrices } from "@/lib/taxlots";

import {
  buildViewModel,
  formatHoldingPeriod,
  formatMoney,
  formatSigned,
} from "./taxlots-view";

const OPTS = { prices: samplePrices, asOf: sampleAsOf };

describe("formatting helpers", () => {
  it("formats money as USD", () => {
    expect(formatMoney("1234.5", "USD")).toBe("$1,234.50");
  });

  it("adds an explicit sign to signed amounts", () => {
    expect(formatSigned("2400", "USD")).toBe("+$2,400.00");
    expect(formatSigned("-300", "USD")).toBe("−$300.00");
    expect(formatSigned("0", "USD")).toBe("$0.00");
  });

  it("labels holding periods", () => {
    expect(formatHoldingPeriod("short")).toBe("Short-term");
    expect(formatHoldingPeriod("long")).toBe("Long-term");
    expect(formatHoldingPeriod("—")).toBe("—");
  });
});

describe("buildViewModel", () => {
  it("labels and describes the method", () => {
    const vm = buildViewModel(sampleLedger, "hifo", OPTS);
    expect(vm.methodLabel).toBe("HIFO");
    expect(vm.methodBlurb).toMatch(/highest-cost/);
  });

  it("FIFO sells the oldest lot and leaves lot-b/lot-c open", () => {
    const vm = buildViewModel(sampleLedger, "fifo", OPTS);
    // 120 sold; FIFO drains lot-a (100) + 20 of lot-b.
    expect(vm.rows.map((r) => r.lotId)).toEqual(["lot-b", "lot-c"]);
    const lotB = vm.rows.find((r) => r.lotId === "lot-b");
    expect(lotB?.quantity).toBe("30");
  });

  it("computes realized short/long split signs", () => {
    const vm = buildViewModel(sampleLedger, "fifo", OPTS);
    expect(vm.realized.gainSign).toBe("positive");
    expect(vm.realized.gain).toMatch(/^\+\$/);
  });

  it("HIFO yields a smaller-or-equal realized gain than FIFO", () => {
    const fifo = buildViewModel(sampleLedger, "fifo", OPTS).realized.gain;
    const hifo = buildViewModel(sampleLedger, "hifo", OPTS).realized.gain;
    const num = (s: string) => Number(s.replace(/[+−$,]/g, ""));
    expect(num(hifo)).toBeLessThanOrEqual(num(fifo));
  });

  it("includes per-disposal slices with holding periods", () => {
    const vm = buildViewModel(sampleLedger, "fifo", OPTS);
    expect(vm.disposals).toHaveLength(1);
    const slices = vm.disposals[0].slices;
    expect(slices.length).toBeGreaterThanOrEqual(1);
    expect(["short", "long"]).toContain(slices[0].holdingPeriod);
  });

  it("marks open lots with market value and unrealized gain", () => {
    const vm = buildViewModel(sampleLedger, "fifo", OPTS);
    const lotC = vm.rows.find((r) => r.lotId === "lot-c");
    expect(lotC?.marketValue).toBe("$16,800.00");
    expect(lotC?.unrealizedGain).toBe("+$2,400.00");
    expect(lotC?.holdingPeriod).toBe("short");
  });
});
