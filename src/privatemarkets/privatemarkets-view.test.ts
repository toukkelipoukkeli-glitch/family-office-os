import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import { realizedVentureFund, sampleFund } from "@/lib/privatemarkets";

import {
  buildViewModel,
  formatIrr,
  formatMoney,
  formatMultiple,
  formatPct,
} from "./privatemarkets-view";

describe("formatters", () => {
  it("formats whole-dollar money without minor units", () => {
    expect(formatMoney(new Decimal("8000000"), "USD")).toBe("$8,000,000");
    expect(formatMoney(new Decimal("-4000000"), "USD")).toBe("-$4,000,000");
  });

  it("formats very large amounts exactly without float drift", () => {
    // Beyond Number.MAX_SAFE_INTEGER a Decimal->number round-trip would lose
    // precision; the BigInt path keeps every digit exact.
    expect(formatMoney(new Decimal("9007199254740993"), "USD")).toBe(
      "$9,007,199,254,740,993",
    );
    // Fractional cents round half-to-even to whole units, then format exactly.
    expect(formatMoney(new Decimal("1234567.5"), "USD")).toBe("$1,234,568");
    expect(formatMoney(new Decimal("1234566.5"), "USD")).toBe("$1,234,566");
  });

  it("formats multiples to two decimals with an x", () => {
    expect(formatMultiple(new Decimal("1.75"))).toBe("1.75x");
    expect(formatMultiple(new Decimal("2.5"))).toBe("2.50x");
    expect(formatMultiple(new Decimal("0"))).toBe("0.00x");
  });

  it("formats percentages", () => {
    expect(formatPct(new Decimal("0.8"))).toBe("80.0%");
    expect(formatPct(new Decimal("1"))).toBe("100.0%");
  });

  it("formats IRR with sign and dash for null", () => {
    expect(formatIrr(new Decimal("0.1687"))).toBe("+16.9%");
    expect(formatIrr(new Decimal("-0.05"))).toBe("-5.0%");
    expect(formatIrr(null)).toBe("—");
  });
});

describe("buildViewModel — sampleFund", () => {
  const vm = buildViewModel(sampleFund);

  it("exposes the hand-computed multiples as formatted strings", () => {
    expect(vm.fundName).toBe("Evergreen Buyout Fund IV");
    expect(vm.vintageYear).toBe(2019);
    expect(vm.tvpi).toBe("1.75x");
    expect(vm.dpi).toBe("1.12x"); // 1.125 -> banker's rounding to 1.12
    expect(vm.rvpi).toBe("0.62x"); // 0.625 -> 0.62
    expect(vm.moic).toBe("1.75x");
    expect(vm.committed).toBe("$10,000,000");
    expect(vm.paidIn).toBe("$8,000,000");
    expect(vm.distributed).toBe("$9,000,000");
    expect(vm.nav).toBe("$5,000,000");
    expect(vm.unfunded).toBe("$2,000,000");
    expect(vm.calledPct).toBe("80.0%");
    expect(vm.calledBarPct).toBe(80);
    expect(vm.inProfit).toBe(true);
  });

  it("emits an IRR percentage in a plausible band", () => {
    expect(vm.irr).toMatch(/^\+1[0-9]\.[0-9]%$/);
  });

  it("renders the ledger sorted by date with signed amounts", () => {
    expect(vm.ledger).toHaveLength(5);
    expect(vm.ledger.map((r) => r.date)).toEqual([
      "2019-03-15",
      "2020-06-01",
      "2021-02-10",
      "2021-09-30",
      "2023-05-20",
    ]);
    expect(vm.ledger[0].kind).toBe("call");
    expect(vm.ledger[0].amount).toBe("-$4,000,000");
    expect(vm.ledger[2].kind).toBe("distribution");
    expect(vm.ledger[2].amount).toBe("$2,000,000");
  });

  it("builds a J-curve chart whose path has one point per cashflow", () => {
    expect(vm.jCurve.points).toHaveLength(5);
    expect(vm.jCurve.path.startsWith("M")).toBe(true);
    // The trough is the most-negative cumulative net; the final point is +1M.
    expect(vm.jCurve.finalLabel).toBe("$1,000,000");
    // First point underwater (negative net) -> y below the zero baseline.
    expect(vm.jCurve.points[0].net).toBeLessThan(0);
    expect(vm.jCurve.points[0].y).toBeGreaterThan(vm.jCurve.zeroY);
  });
});

describe("buildViewModel — realizedVentureFund", () => {
  const vm = buildViewModel(realizedVentureFund);

  it("shows a fully-called fund with zero RVPI", () => {
    expect(vm.calledPct).toBe("100.0%");
    expect(vm.calledBarPct).toBe(100);
    expect(vm.unfunded).toBe("$0");
    expect(vm.rvpi).toBe("0.00x");
    expect(vm.dpi).toBe("2.50x");
    expect(vm.tvpi).toBe("2.50x");
    expect(vm.nav).toBe("$0");
  });
});
