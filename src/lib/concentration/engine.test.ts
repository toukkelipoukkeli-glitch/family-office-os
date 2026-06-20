import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import { Money } from "../money";

import {
  analyzeConcentration,
  RESIDUAL_ISSUER_ID,
} from "./engine";
import { ConcentrationBook } from "./model";
import {
  DIVERSIFIED_BOOK,
  SAMPLE_CONCENTRATION_BOOK,
} from "./fixtures";

function sum(values: Decimal[]): Decimal {
  return values.reduce((a, v) => a.plus(v), new Decimal(0));
}

function book(positions: unknown[]): ConcentrationBook {
  return ConcentrationBook.parse({
    id: "t",
    name: "Test",
    baseCurrency: "USD",
    positions,
  });
}

const usd = (amount: string) => ({ amount, currency: "USD" as const });

describe("analyzeConcentration — totals & reconciliation (the oracle)", () => {
  it("total net worth is the sum of all position market values", () => {
    const r = analyzeConcentration(SAMPLE_CONCENTRATION_BOOK);
    // 12 + 8 + 6 + 10 + 15 + 9 + 25 + 15 = 100M
    expect(r.total.amount.toString()).toBe("100000000");
    expect(r.currency).toBe("USD");
  });

  it("single-name look-through exposures reconcile to the total exactly", () => {
    const r = analyzeConcentration(SAMPLE_CONCENTRATION_BOOK);
    const nameSum = sum(r.singleNames.map((n) => n.value.amount));
    expect(nameSum.equals(r.total.amount)).toBe(true);
    expect(r.reconciles).toBe(true);
  });

  it("sector roll-up reconciles to the total exactly", () => {
    const r = analyzeConcentration(SAMPLE_CONCENTRATION_BOOK);
    const sectorSum = sum(r.sectors.map((s) => s.value.amount));
    expect(sectorSum.equals(r.total.amount)).toBe(true);
  });

  it("liquidity tiers reconcile to the total exactly", () => {
    const r = analyzeConcentration(SAMPLE_CONCENTRATION_BOOK);
    const liqSum = sum(r.liquidity.map((l) => l.value.amount));
    expect(liqSum.equals(r.total.amount)).toBe(true);
  });

  it("every single name's sources sum back to that name's value", () => {
    const r = analyzeConcentration(SAMPLE_CONCENTRATION_BOOK);
    for (const n of r.singleNames) {
      const srcSum = sum(n.sources.map((s) => s.value.amount));
      expect(srcSum.equals(n.value.amount)).toBe(true);
    }
  });

  it("name weights sum to 1 (within rounding)", () => {
    const r = analyzeConcentration(SAMPLE_CONCENTRATION_BOOK);
    const w = r.singleNames.reduce((a, n) => a + n.weight, 0);
    expect(w).toBeCloseTo(1, 9);
  });
});

describe("analyzeConcentration — look-through single-name aggregation", () => {
  it("sums a name held directly AND inside multiple funds", () => {
    const r = analyzeConcentration(SAMPLE_CONCENTRATION_BOOK);
    const aapl = r.singleNames.find((n) => n.issuerId === "issuer-aapl");
    expect(aapl).toBeDefined();
    // Direct 12M + 7% of 25M (1.75M) + 20% of 15M (3M) = 16.75M.
    expect(aapl!.value.amount.toString()).toBe("16750000");
    // Three sources: the direct line and the two funds.
    expect(aapl!.sources).toHaveLength(3);
    expect(new Set(aapl!.sources.map((s) => s.positionId))).toEqual(
      new Set(["pos-aapl", "pos-sp500", "pos-tech-etf"]),
    );
    // 16.75M / 100M = 16.75%.
    expect(aapl!.weight).toBeCloseTo(0.1675, 10);
  });

  it("look-through reveals MORE single-name risk than the direct line alone", () => {
    const r = analyzeConcentration(SAMPLE_CONCENTRATION_BOOK);
    const aapl = r.singleNames.find((n) => n.issuerId === "issuer-aapl")!;
    const directLine = SAMPLE_CONCENTRATION_BOOK.positions.find(
      (p) => p.id === "pos-aapl",
    )!;
    expect(
      aapl.value.amount.greaterThan(
        Money.of(directLine.value.amount, "USD").amount,
      ),
    ).toBe(true);
    // Apple is the single most concentrated real name.
    expect(r.topName?.issuerId).toBe("issuer-aapl");
  });

  it("creates a residual-diversified bucket per fund for its un-modelled tail", () => {
    const r = analyzeConcentration(SAMPLE_CONCENTRATION_BOOK);
    const residuals = r.singleNames.filter((n) => n.residual);
    // Both funds have an un-modelled tail.
    expect(residuals.length).toBe(2);
    for (const res of residuals) {
      expect(res.issuerId.startsWith(RESIDUAL_ISSUER_ID)).toBe(true);
      expect(res.value.amount.greaterThan(0)).toBe(true);
    }
    // S&P fund tail: 25M × (1 − 0.166) = 25M × 0.834 = 20.85M.
    const sp = residuals.find((n) => n.issuerId.includes("pos-sp500"))!;
    expect(sp.value.amount.toString()).toBe("20850000");
  });

  it("excludes residual buckets from the issuer (real single-name) list", () => {
    const r = analyzeConcentration(SAMPLE_CONCENTRATION_BOOK);
    expect(r.issuers.every((i) => !i.issuerId.startsWith(RESIDUAL_ISSUER_ID))).toBe(
      true,
    );
    // Issuers are sorted descending; the first is Apple.
    expect(r.issuers[0]?.issuerId).toBe("issuer-aapl");
  });

  it("a fund whose weights sum to 1 has no residual bucket", () => {
    const b = book([
      {
        kind: "fund",
        id: "f1",
        name: "Full fund",
        liquidity: "liquid",
        value: usd("1000000"),
        constituents: [
          { issuerId: "a", name: "A", sector: "technology", weight: 0.5 },
          { issuerId: "b", name: "B", sector: "financials", weight: 0.5 },
        ],
      },
    ]);
    const r = analyzeConcentration(b);
    expect(r.singleNames.some((n) => n.residual)).toBe(false);
    expect(r.reconciles).toBe(true);
    expect(sum(r.singleNames.map((n) => n.value.amount)).toString()).toBe(
      "1000000",
    );
  });
});

describe("analyzeConcentration — sector & liquidity", () => {
  it("aggregates look-through value by sector", () => {
    const r = analyzeConcentration(SAMPLE_CONCENTRATION_BOOK);
    const tech = r.sectors.find((s) => s.sector === "technology");
    expect(tech).toBeDefined();
    // Direct AAPL 12 + MSFT 8 = 20M
    // S&P: AAPL 1.75 + MSFT 1.5 = 3.25M
    // Tech ETF: AAPL 3 + MSFT 2.7 + NVDA 2.4 = 8.1M
    // = 31.35M
    expect(tech!.value.amount.toString()).toBe("31350000");
  });

  it("computes the illiquid percentage of net worth", () => {
    const r = analyzeConcentration(SAMPLE_CONCENTRATION_BOOK);
    // Illiquid positions: Helsinki SPV 15M + Nordic PE 9M = 24M of 100M.
    expect(r.illiquid.value.amount.toString()).toBe("24000000");
    expect(r.illiquid.weight).toBeCloseTo(0.24, 10);
  });

  it("liquidity tiers are returned in canonical order", () => {
    const r = analyzeConcentration(SAMPLE_CONCENTRATION_BOOK);
    expect(r.liquidity.map((l) => l.tier)).toEqual([
      "liquid",
      "semi_liquid",
      "illiquid",
    ]);
  });
});

describe("analyzeConcentration — diversification", () => {
  it("reports low single-name concentration for a diversified book", () => {
    const r = analyzeConcentration(DIVERSIFIED_BOOK);
    expect(r.reconciles).toBe(true);
    // No real single name above 5% of net worth.
    expect(r.topName!.weight).toBeLessThan(0.05);
    // HHI is small for a diversified book.
    expect(r.hhi).toBeLessThan(0.01);
  });

  it("a single concentrated direct name pushes HHI up", () => {
    const concentrated = book([
      {
        kind: "direct",
        id: "p1",
        name: "Whale",
        issuerId: "whale",
        sector: "technology",
        liquidity: "liquid",
        value: usd("9000000"),
      },
      {
        kind: "direct",
        id: "p2",
        name: "Minnow",
        issuerId: "minnow",
        sector: "financials",
        liquidity: "liquid",
        value: usd("1000000"),
      },
    ]);
    const r = analyzeConcentration(concentrated);
    // 0.9^2 + 0.1^2 = 0.82.
    expect(r.hhi).toBeCloseTo(0.82, 10);
    expect(r.topName?.weight).toBeCloseTo(0.9, 10);
  });
});

describe("analyzeConcentration — edge cases", () => {
  it("handles an empty book without dividing by zero", () => {
    const r = analyzeConcentration(book([]));
    expect(r.total.amount.toString()).toBe("0");
    expect(r.singleNames).toHaveLength(0);
    expect(r.topName).toBeNull();
    expect(r.hhi).toBe(0);
    expect(r.illiquid.weight).toBe(0);
    expect(r.reconciles).toBe(true);
  });

  it("a fund with no constituents is one big residual bucket", () => {
    const b = book([
      {
        kind: "fund",
        id: "f",
        name: "Opaque fund",
        liquidity: "semi_liquid",
        value: usd("5000000"),
        constituents: [],
      },
    ]);
    const r = analyzeConcentration(b);
    expect(r.singleNames).toHaveLength(1);
    expect(r.singleNames[0].residual).toBe(true);
    expect(r.singleNames[0].value.amount.toString()).toBe("5000000");
    expect(r.issuers).toHaveLength(0);
    expect(r.topName).toBeNull();
    expect(r.reconciles).toBe(true);
  });

  it("rejects a fund whose constituent weights exceed 1", () => {
    expect(() =>
      book([
        {
          kind: "fund",
          id: "f",
          name: "Bad fund",
          liquidity: "liquid",
          value: usd("1000000"),
          constituents: [
            { issuerId: "a", name: "A", sector: "technology", weight: 0.7 },
            { issuerId: "b", name: "B", sector: "financials", weight: 0.5 },
          ],
        },
      ]),
    ).toThrow();
  });

  it("rejects a position not in the book base currency", () => {
    expect(() =>
      ConcentrationBook.parse({
        id: "t",
        name: "T",
        baseCurrency: "USD",
        positions: [
          {
            kind: "direct",
            id: "p",
            name: "Euro line",
            issuerId: "x",
            sector: "other",
            liquidity: "liquid",
            value: { amount: "100", currency: "EUR" },
          },
        ],
      }),
    ).toThrow();
  });

  it("reconciles to the last unit with awkward weights and a prime value", () => {
    // A value not cleanly divisible by the weights, so float math would drift:
    // the residual must be computed as (whole − Σmodelled), not Σ(1−weights).
    const b = book([
      {
        kind: "fund",
        id: "f",
        name: "Odd fund",
        liquidity: "liquid",
        value: usd("1000003"),
        constituents: [
          { issuerId: "a", name: "A", sector: "technology", weight: 0.333333 },
          { issuerId: "c", name: "C", sector: "energy", weight: 0.333333 },
          { issuerId: "d", name: "D", sector: "healthcare", weight: 0.333333 },
        ],
      },
    ]);
    const r = analyzeConcentration(b);
    expect(r.reconciles).toBe(true);
    // Single-name slices (3 names + 1 residual) sum back to the whole exactly.
    expect(sum(r.singleNames.map((n) => n.value.amount)).toString()).toBe(
      "1000003",
    );
    // The residual is strictly positive and equals whole − Σmodelled.
    const residual = r.singleNames.find((n) => n.residual)!;
    expect(residual.value.amount.greaterThan(0)).toBe(true);
  });

  it("a name in different sectors across positions still reconciles per sector", () => {
    // Same issuer id but classified into two sectors by two sources: the engine
    // keys names by issuerId (first sector wins for the name) yet each slice is
    // booked to the sector on the slice, so sector totals must still reconcile.
    const b = book([
      {
        kind: "direct",
        id: "p1",
        name: "Dual A",
        issuerId: "a",
        sector: "technology",
        liquidity: "liquid",
        value: usd("4000000"),
      },
      {
        kind: "fund",
        id: "f1",
        name: "Fund holding A as financials",
        liquidity: "liquid",
        value: usd("6000000"),
        constituents: [
          { issuerId: "a", name: "Dual A", sector: "financials", weight: 1 },
        ],
      },
    ]);
    const r = analyzeConcentration(b);
    expect(r.reconciles).toBe(true);
    // The two sector slices sum to the full 10M book.
    expect(sum(r.sectors.map((s) => s.value.amount)).toString()).toBe(
      "10000000",
    );
    // The single name "a" aggregates both sources to 10M (full book).
    const a = r.singleNames.find((n) => n.issuerId === "a")!;
    expect(a.value.amount.toString()).toBe("10000000");
    expect(a.sources).toHaveLength(2);
  });

  it("breaks value ties deterministically by issuer id", () => {
    const b = book([
      {
        kind: "direct",
        id: "pz",
        name: "Zeta",
        issuerId: "zeta",
        sector: "other",
        liquidity: "liquid",
        value: usd("5000000"),
      },
      {
        kind: "direct",
        id: "pa",
        name: "Alpha",
        issuerId: "alpha",
        sector: "other",
        liquidity: "liquid",
        value: usd("5000000"),
      },
    ]);
    const r = analyzeConcentration(b);
    // Equal value -> sorted by issuer id ascending, so alpha precedes zeta.
    expect(r.issuers.map((i) => i.issuerId)).toEqual(["alpha", "zeta"]);
    // topName picks the first real single name deterministically.
    expect(r.topName?.issuerId).toBe("alpha");
  });

  it("a book with only an empty (zero-value) position does not divide by zero", () => {
    const b = book([
      {
        kind: "direct",
        id: "p0",
        name: "Worthless",
        issuerId: "z",
        sector: "other",
        liquidity: "liquid",
        value: usd("0"),
      },
    ]);
    const r = analyzeConcentration(b);
    expect(r.total.amount.toString()).toBe("0");
    expect(r.reconciles).toBe(true);
    expect(r.hhi).toBe(0);
    // Every weight is a finite 0, never NaN.
    for (const n of r.singleNames) expect(Number.isFinite(n.weight)).toBe(true);
    expect(r.illiquid.weight).toBe(0);
  });

  it("rejects duplicate position ids", () => {
    expect(() =>
      book([
        {
          kind: "direct",
          id: "dup",
          name: "A",
          issuerId: "a",
          sector: "other",
          liquidity: "liquid",
          value: usd("1"),
        },
        {
          kind: "direct",
          id: "dup",
          name: "B",
          issuerId: "b",
          sector: "other",
          liquidity: "liquid",
          value: usd("1"),
        },
      ]),
    ).toThrow();
  });
});
