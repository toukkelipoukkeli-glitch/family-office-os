import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import { CapTable, FinancingRound } from "./captable";
import {
  applyRound,
  dilutionImpact,
  ownershipBreakdown,
  ownershipByClass,
  totalShares,
} from "./dilution";
import { sampleCapTable, sampleRound, simpleRound } from "./fixtures";

describe("CapTable schema", () => {
  it("parses the sample fixture", () => {
    expect(() => CapTable.parse(sampleCapTable)).not.toThrow();
    expect(totalShares(sampleCapTable)).toBe(10_000_000n);
  });

  it("rejects duplicate entry ids", () => {
    expect(() =>
      CapTable.parse({
        companyId: "c1",
        companyName: "Dup Co",
        currency: "EUR",
        entries: [
          { id: "x", holder: "A", securityClass: "common", shares: "10" },
          { id: "x", holder: "B", securityClass: "common", shares: "10" },
        ],
      }),
    ).toThrow(/duplicate cap table entry id/);
  });

  it("rejects a table with zero shares outstanding", () => {
    expect(() =>
      CapTable.parse({
        companyId: "c1",
        companyName: "Empty Co",
        currency: "EUR",
        entries: [{ id: "x", holder: "A", securityClass: "common", shares: "0" }],
      }),
    ).toThrow(/at least one share outstanding/);
  });

  it("rejects non-integer share counts", () => {
    expect(() =>
      CapTable.parse({
        companyId: "c1",
        companyName: "Frac Co",
        currency: "EUR",
        entries: [{ id: "x", holder: "A", securityClass: "common", shares: "10.5" }],
      }),
    ).toThrow();
  });

  it("rejects unknown keys (strict)", () => {
    expect(() =>
      CapTable.parse({
        companyId: "c1",
        companyName: "Strict Co",
        currency: "EUR",
        entries: [{ id: "x", holder: "A", securityClass: "common", shares: "1" }],
        bogus: true,
      }),
    ).toThrow();
  });
});

describe("FinancingRound schema", () => {
  it("parses valid rounds", () => {
    expect(() => FinancingRound.parse(sampleRound)).not.toThrow();
    expect(() => FinancingRound.parse(simpleRound)).not.toThrow();
  });

  it("rejects non-positive investment and pre-money", () => {
    expect(() =>
      FinancingRound.parse({ name: "R", investment: "0", preMoneyValuation: "1" }),
    ).toThrow();
    expect(() =>
      FinancingRound.parse({ name: "R", investment: "1", preMoneyValuation: "0" }),
    ).toThrow();
  });

  it("rejects a pool percent at or above 100", () => {
    expect(() =>
      FinancingRound.parse({
        name: "R",
        investment: "1",
        preMoneyValuation: "1",
        optionPoolPercent: 100,
      }),
    ).toThrow();
  });
});

describe("ownershipBreakdown", () => {
  it("sums to 100% and sorts by share count descending", () => {
    const rows = ownershipBreakdown(sampleCapTable);
    expect(rows).toHaveLength(4);
    // Founder A is largest.
    expect(rows[0].holder).toBe("Touko Ursin");
    expect(rows[0].percent).toBe(45);
    expect(rows[1].percent).toBe(35);
    const sum = rows.reduce((s, r) => s + r.percent, 0);
    expect(sum).toBeCloseTo(100, 6);
  });

  it("is deterministic across calls", () => {
    expect(ownershipBreakdown(sampleCapTable)).toEqual(
      ownershipBreakdown(sampleCapTable),
    );
  });
});

describe("ownershipByClass", () => {
  it("aggregates shares per security class", () => {
    const byClass = ownershipByClass(sampleCapTable);
    const common = byClass.find((c) => c.securityClass === "common");
    expect(common?.shares).toBe("8000000");
    expect(common?.percent).toBe(80);
    const totalPct = byClass.reduce((s, c) => s + c.percent, 0);
    expect(totalPct).toBeCloseTo(100, 6);
  });
});

describe("applyRound — simple priced round (no pool)", () => {
  const result = applyRound(sampleCapTable, simpleRound);

  it("prices off the pre-money fully diluted shares", () => {
    // pre-money 8,000,000 / 10,000,000 shares = 0.80 per share.
    expect(new Decimal(result.pricePerShare).toString()).toBe("0.8");
  });

  it("issues the right investor shares and post-money", () => {
    // 2,000,000 / 0.80 = 2,500,000 new shares.
    expect(result.investorShares).toBe("2500000");
    expect(result.newPoolShares).toBe("0");
    expect(result.postMoneyValuation).toBe("10000000");
  });

  it("gives investors investment / post-money ownership", () => {
    // 2M / 10M post-money = 20%.
    expect(result.investorPercent).toBe(20);
    expect(totalShares(result.table)).toBe(12_500_000n);
  });

  it("does not mutate the input table", () => {
    expect(totalShares(sampleCapTable)).toBe(10_000_000n);
    expect(sampleCapTable.entries).toHaveLength(4);
  });
});

describe("applyRound — round with option pool top-up", () => {
  const result = applyRound(sampleCapTable, sampleRound);

  it("lands the post-round pool at the target percentage", () => {
    const byClass = ownershipByClass(result.table);
    const optionPct =
      byClass.find((c) => c.securityClass === "option")?.percent ?? 0;
    // Target was 15% of post-round fully diluted; allow rounding slack from
    // whole-share issuance.
    expect(optionPct).toBeGreaterThan(14.9);
    expect(optionPct).toBeLessThan(15.1);
  });

  it("gives investors approximately investment / post-money", () => {
    // 5M invested at 20M post-money => ~25%.
    expect(result.investorPercent).toBeGreaterThan(24.5);
    expect(result.investorPercent).toBeLessThan(25.5);
    expect(result.postMoneyValuation).toBe("20000000");
  });

  it("creates fresh pool shares that dilute existing holders", () => {
    expect(BigInt(result.newPoolShares)).toBeGreaterThan(0n);
    expect(totalShares(result.table)).toBeGreaterThan(totalShares(sampleCapTable));
  });

  it("post-round breakdown still sums to 100%", () => {
    const sum = ownershipBreakdown(result.table).reduce(
      (s, r) => s + r.percent,
      0,
    );
    expect(sum).toBeCloseTo(100, 4);
  });
});

describe("dilutionImpact", () => {
  it("shows every existing holder losing (or holding) ownership", () => {
    const result = applyRound(sampleCapTable, sampleRound);
    const impact = dilutionImpact(sampleCapTable, result);
    expect(impact).toHaveLength(sampleCapTable.entries.length);
    for (const row of impact) {
      // No existing holder gains from a dilutive round.
      expect(row.deltaPercent).toBeLessThanOrEqual(0);
      expect(row.afterPercent).toBeLessThanOrEqual(row.beforePercent);
    }
  });

  it("matches each holder's before percentage to the original table", () => {
    const result = applyRound(sampleCapTable, simpleRound);
    const impact = dilutionImpact(sampleCapTable, result);
    const founderA = impact.find((r) => r.holder === "Touko Ursin");
    expect(founderA?.beforePercent).toBe(45);
    // 4,500,000 / 12,500,000 = 36%.
    expect(founderA?.afterPercent).toBe(36);
    expect(founderA?.deltaPercent).toBe(-9);
  });
});
