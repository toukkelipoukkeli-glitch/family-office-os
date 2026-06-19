import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import { CapTable, type FinancingRound } from "./captable";
import {
  applyRound,
  dilutionImpact,
  ownershipBreakdown,
  ownershipByClass,
  totalShares,
} from "./dilution";
import { sampleCapTable, sampleRound } from "./fixtures";

/**
 * Adversarial edge-case coverage added by the independent tester for
 * m5-captable. These probe the dilution math at the boundaries: huge share
 * counts that overflow IEEE-754, pool-shuffle conservation, sign invariants on
 * dilution, and input immutability under repeated application.
 */

function makeTable(entries: { id: string; holder: string; securityClass: "common" | "preferred" | "option" | "warrant" | "safe"; shares: string }[]): CapTable {
  return CapTable.parse({
    companyId: "c-adv",
    companyName: "Adversarial Co",
    currency: "EUR",
    entries,
  });
}

describe("dilution — adversarial edge cases", () => {
  it("keeps exact precision for share counts well beyond 2^53", () => {
    // 9e18 + 1 cannot be represented as a JS number; BigInt must carry it.
    const big = "9000000000000000001";
    const table = makeTable([
      { id: "a", holder: "Whale", securityClass: "common", shares: big },
      { id: "b", holder: "Minnow", securityClass: "common", shares: "1" },
    ]);
    expect(totalShares(table)).toBe(9000000000000000002n);
    // The single extra share must not vanish into float rounding.
    expect(totalShares(table)).not.toBe(BigInt(Number(big) + 1));
  });

  it("ownership breakdown percentages sum to ~100% for a non-trivial table", () => {
    const rows = ownershipBreakdown(sampleCapTable);
    const sum = rows.reduce((s, r) => s.add(r.percent), new Decimal(0));
    // Rounding to 4dp per row can drift a hair from 100; bound it tightly.
    expect(sum.sub(100).abs().lte(new Decimal("0.0005").mul(rows.length))).toBe(true);
  });

  it("ownership-by-class percentages also sum to ~100%", () => {
    const rows = ownershipByClass(sampleCapTable);
    const sum = rows.reduce((s, r) => s.add(r.percent), new Decimal(0));
    expect(sum.sub(100).abs().lte(new Decimal("0.0005").mul(rows.length))).toBe(true);
  });

  it("every existing holder's dilution delta is <= 0 after a priced round", () => {
    const result = applyRound(sampleCapTable, sampleRound);
    const impact = dilutionImpact(sampleCapTable, result);
    expect(impact.length).toBeGreaterThan(0);
    for (const row of impact) {
      expect(row.deltaPercent).toBeLessThanOrEqual(0);
      // after = before + delta, within rounding noise
      expect(
        new Decimal(row.afterPercent)
          .sub(row.beforePercent)
          .sub(row.deltaPercent)
          .abs()
          .lte("0.0001"),
      ).toBe(true);
    }
  });

  it("post-round total = pre-round total + investor shares + new pool shares", () => {
    const result = applyRound(sampleCapTable, sampleRound);
    const expected =
      totalShares(sampleCapTable) +
      BigInt(result.investorShares) +
      BigInt(result.newPoolShares);
    expect(totalShares(result.table)).toBe(expected);
  });

  it("a round with no pool top-up issues zero pool shares", () => {
    const round: FinancingRound = {
      name: "Bridge",
      investment: "1000000",
      preMoneyValuation: "9000000",
    };
    const result = applyRound(sampleCapTable, round);
    expect(result.newPoolShares).toBe("0");
    // Only one new entry (the investors) should be appended.
    expect(result.table.entries.length).toBe(sampleCapTable.entries.length + 1);
  });

  it("does not mutate the input table even across repeated rounds", () => {
    const before = JSON.stringify(sampleCapTable.entries);
    const beforeTotal = totalShares(sampleCapTable);
    applyRound(sampleCapTable, sampleRound);
    applyRound(sampleCapTable, sampleRound);
    expect(JSON.stringify(sampleCapTable.entries)).toBe(before);
    expect(totalShares(sampleCapTable)).toBe(beforeTotal);
  });

  it("pool shuffle drives the post-round pool to ~target percent", () => {
    const result = applyRound(sampleCapTable, sampleRound);
    if (sampleRound.optionPoolPercent == null) return;
    const classes = ownershipByClass(result.table);
    const optionPct =
      classes.find((c) => c.securityClass === "option")?.percent ?? 0;
    // Within half a point of the requested pool fraction.
    expect(Math.abs(optionPct - sampleRound.optionPoolPercent)).toBeLessThan(0.5);
  });

  it("investor ownership percent is internally consistent with issued shares", () => {
    const result = applyRound(sampleCapTable, sampleRound);
    const total = new Decimal(totalShares(result.table).toString());
    const recomputed = new Decimal(result.investorShares)
      .div(total)
      .mul(100)
      .toDecimalPlaces(4)
      .toNumber();
    expect(Math.abs(recomputed - result.investorPercent)).toBeLessThan(0.0002);
  });

  it("handles a tiny investment relative to a huge pre-money without crashing", () => {
    const round: FinancingRound = {
      name: "Token",
      investment: "1",
      preMoneyValuation: "1000000000",
    };
    const result = applyRound(sampleCapTable, round);
    expect(BigInt(result.investorShares)).toBeGreaterThanOrEqual(0n);
    // Investor fraction should be vanishingly small but valid.
    expect(result.investorPercent).toBeGreaterThanOrEqual(0);
    expect(result.investorPercent).toBeLessThan(1);
  });
});
