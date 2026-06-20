import { describe, expect, it } from "vitest";

import {
  Acquisition,
  Disposal,
  Ledger,
  holdingPeriod,
  openLots,
  realizeGains,
  type LotMethod,
} from "./taxlots";
import { sampleAsOf, sampleLedger, samplePrices } from "./fixtures";

/**
 * Oracle: a small ledger whose lots have distinct, hand-pickable unit costs so
 * each selection method matches a *different* lot, and the gains are exact
 * round numbers we can assert against by hand.
 *
 * Lots (all AAPL, USD):
 *   L1  2022-01-01  10 @ $100  ($1000)   long-term as of 2024 sale
 *   L2  2023-01-01  10 @ $150  ($1500)   long-term as of 2024 sale
 *   L3  2024-05-01  10 @ $120  ($1200)   short-term as of 2024 sale
 * Sell 10 @ $200 ($2000) on 2024-06-01.
 */
const L1 = { id: "L1", symbol: "AAPL", date: "2022-01-01", quantity: "10", cost: "1000" };
const L2 = { id: "L2", symbol: "AAPL", date: "2023-01-01", quantity: "10", cost: "1500" };
const L3 = { id: "L3", symbol: "AAPL", date: "2024-05-01", quantity: "10", cost: "1200" };

function ledgerWithPicks(picks?: { lotId: string; quantity: string }[]): Ledger {
  return {
    currency: "USD",
    acquisitions: [L1, L2, L3],
    disposals: [
      {
        id: "S1",
        symbol: "AAPL",
        date: "2024-06-01",
        quantity: "10",
        proceeds: "2000",
        ...(picks ? { picks } : {}),
      },
    ],
  };
}

describe("schema validation", () => {
  it("accepts the sample ledger", () => {
    expect(() => Ledger.parse(sampleLedger)).not.toThrow();
  });

  it("rejects a zero-quantity acquisition", () => {
    expect(() =>
      Acquisition.parse({ id: "x", symbol: "A", date: "2024-01-01", quantity: "0", cost: "1" }),
    ).toThrow();
  });

  it("rejects a negative cost", () => {
    expect(() =>
      Acquisition.parse({ id: "x", symbol: "A", date: "2024-01-01", quantity: "1", cost: "-1" }),
    ).toThrow();
  });

  it("rejects an invalid disposal date", () => {
    expect(() =>
      Disposal.parse({ id: "x", symbol: "A", date: "2024-02-30", quantity: "1", proceeds: "1" }),
    ).toThrow();
  });
});

describe("holdingPeriod", () => {
  it("is short on the one-year anniversary", () => {
    expect(holdingPeriod("2023-06-01", "2024-06-01")).toBe("short");
  });

  it("is long the day after one year", () => {
    expect(holdingPeriod("2023-06-01", "2024-06-02")).toBe("long");
  });

  it("is short well within a year", () => {
    expect(holdingPeriod("2024-01-01", "2024-06-01")).toBe("short");
  });

  it("is long for multi-year holds", () => {
    expect(holdingPeriod("2020-01-01", "2024-06-01")).toBe("long");
  });
});

describe("lot selection methods", () => {
  it("FIFO consumes the oldest lot (L1 @ $100)", () => {
    const r = realizeGains(ledgerWithPicks(), "fifo");
    expect(r.disposals[0].slices).toHaveLength(1);
    expect(r.disposals[0].slices[0].lotId).toBe("L1");
    expect(r.basis.amount.toFixed()).toBe("1000");
    expect(r.gain.amount.toFixed()).toBe("1000"); // 2000 - 1000
    expect(r.longTermGain.amount.toFixed()).toBe("1000");
    expect(r.shortTermGain.amount.toFixed()).toBe("0");
  });

  it("LIFO consumes the newest lot (L3 @ $120, short-term)", () => {
    const r = realizeGains(ledgerWithPicks(), "lifo");
    expect(r.disposals[0].slices[0].lotId).toBe("L3");
    expect(r.basis.amount.toFixed()).toBe("1200");
    expect(r.gain.amount.toFixed()).toBe("800"); // 2000 - 1200
    expect(r.shortTermGain.amount.toFixed()).toBe("800");
    expect(r.longTermGain.amount.toFixed()).toBe("0");
  });

  it("HIFO consumes the highest-cost lot (L2 @ $150, long-term)", () => {
    const r = realizeGains(ledgerWithPicks(), "hifo");
    expect(r.disposals[0].slices[0].lotId).toBe("L2");
    expect(r.basis.amount.toFixed()).toBe("1500");
    expect(r.gain.amount.toFixed()).toBe("500"); // 2000 - 1500
    expect(r.longTermGain.amount.toFixed()).toBe("500");
  });

  it("spec-id consumes exactly the named lots", () => {
    const r = realizeGains(ledgerWithPicks([{ lotId: "L3", quantity: "10" }]), "spec-id");
    expect(r.disposals[0].slices[0].lotId).toBe("L3");
    expect(r.gain.amount.toFixed()).toBe("800");
  });

  it("spec-id honors per-lot pick quantities (does not just drain in order)", () => {
    // Sell 10: pick 3 from L1 and 7 from L2. The engine must split exactly that
    // way, NOT drain L1's full 10 units and ignore L2.
    const r = realizeGains(
      ledgerWithPicks([
        { lotId: "L1", quantity: "3" },
        { lotId: "L2", quantity: "7" },
      ]),
      "spec-id",
    );
    const slices = r.disposals[0].slices;
    expect(slices.map((s) => `${s.lotId}:${s.quantity}`)).toEqual(["L1:3", "L2:7"]);
    // Basis: 3 @ $100 + 7 @ $150 = 300 + 1050 = 1350.
    expect(r.basis.amount.toFixed()).toBe("1350");
    expect(r.gain.amount.toFixed()).toBe("650"); // 2000 - 1350
    // L1 acquired 2022, L2 2023 -> both long-term as of 2024-06-01.
    expect(r.longTermGain.amount.toFixed()).toBe("650");
    expect(r.shortTermGain.amount.toFixed()).toBe("0");
  });

  it("spec-id supports two picks against the same lot without over-drawing", () => {
    // Sell 8 from L1, expressed as 5 + 3 from the same lot.
    const ledger: Ledger = {
      currency: "USD",
      acquisitions: [L1, L2, L3],
      disposals: [
        {
          id: "S1",
          symbol: "AAPL",
          date: "2024-06-01",
          quantity: "8",
          proceeds: "1600",
          picks: [
            { lotId: "L1", quantity: "5" },
            { lotId: "L1", quantity: "3" },
          ],
        },
      ],
    };
    const r = realizeGains(ledger, "spec-id");
    const slices = r.disposals[0].slices;
    expect(slices.map((s) => `${s.lotId}:${s.quantity}`)).toEqual(["L1:5", "L1:3"]);
    expect(r.basis.amount.toFixed()).toBe("800"); // 8 @ $100
    // L1 drained to 8 of 10; 2 remain open.
    const open = openLots(ledger, "spec-id");
    expect(open.find((l) => l.lotId === "L1")?.quantity).toBe("2");
  });

  it("HIFO minimizes the realized gain vs FIFO/LIFO", () => {
    const fifo = realizeGains(ledgerWithPicks(), "fifo").gain.amount;
    const lifo = realizeGains(ledgerWithPicks(), "lifo").gain.amount;
    const hifo = realizeGains(ledgerWithPicks(), "hifo").gain.amount;
    expect(hifo.lessThanOrEqualTo(fifo)).toBe(true);
    expect(hifo.lessThanOrEqualTo(lifo)).toBe(true);
  });
});

describe("partial fills across multiple lots", () => {
  // Sell 25 units: FIFO drains L1 (10) + L2 (10) + 5 of L3.
  function bigLedger(): Ledger {
    return {
      currency: "USD",
      acquisitions: [L1, L2, L3],
      disposals: [
        { id: "S1", symbol: "AAPL", date: "2024-06-01", quantity: "25", proceeds: "5000" },
      ],
    };
  }

  it("FIFO splits the disposal across three lots", () => {
    const r = realizeGains(bigLedger(), "fifo");
    const slices = r.disposals[0].slices;
    expect(slices.map((s) => s.lotId)).toEqual(["L1", "L2", "L3"]);
    expect(slices.map((s) => s.quantity)).toEqual(["10", "10", "5"]);
    // Proceeds: 5000 over 25 units = $200/unit. Slice proceeds sum to 5000.
    const total = slices.reduce(
      (a, s) => a.plus(s.proceeds.amount),
      slices[0].proceeds.amount.times(0),
    );
    expect(total.toFixed()).toBe("5000");
    // Basis: 1000 + 1500 + (5/10 * 1200 = 600) = 3100.
    expect(r.basis.amount.toFixed()).toBe("3100");
    expect(r.gain.amount.toFixed()).toBe("1900");
  });

  it("proceeds always sum exactly to the disposal proceeds (no penny lost)", () => {
    const odd: Ledger = {
      currency: "USD",
      acquisitions: [
        { id: "a", symbol: "X", date: "2024-01-01", quantity: "3", cost: "300" },
        { id: "b", symbol: "X", date: "2024-01-02", quantity: "3", cost: "300" },
        { id: "c", symbol: "X", date: "2024-01-03", quantity: "3", cost: "300" },
      ],
      disposals: [
        // 7 units for $100.00 — not evenly divisible across slices.
        { id: "s", symbol: "X", date: "2024-02-01", quantity: "7", proceeds: "100" },
      ],
    };
    const r = realizeGains(odd, "fifo");
    expect(r.proceeds.amount.toFixed()).toBe("100");
    const sliceSum = r.disposals[0].slices.reduce(
      (a, s) => a.plus(s.proceeds.amount),
      r.proceeds.amount.times(0),
    );
    expect(sliceSum.equals(r.proceeds.amount)).toBe(true);
  });
});

describe("open lots and unrealized gains", () => {
  it("reports remaining lots after disposals", () => {
    // Sell 10 via FIFO drains L1; L2 and L3 remain fully open.
    const r = openLots(ledgerWithPicks(), "fifo");
    expect(r.map((l) => l.lotId)).toEqual(["L2", "L3"]);
    expect(r[0].quantity).toBe("10");
  });

  it("reports a partially-consumed lot", () => {
    const partial: Ledger = {
      currency: "USD",
      acquisitions: [L1],
      disposals: [
        { id: "s", symbol: "AAPL", date: "2024-06-01", quantity: "4", proceeds: "800" },
      ],
    };
    const r = openLots(partial, "fifo");
    expect(r).toHaveLength(1);
    expect(r[0].quantity).toBe("6");
    expect(r[0].basis.amount.toFixed()).toBe("600"); // 6 @ $100
  });

  it("values unrealized gains against a price map and as-of date", () => {
    const r = openLots(sampleLedger, "fifo", { prices: samplePrices, asOf: sampleAsOf });
    // sample sells 120 of 230 units via FIFO -> drains lot-a (100) + 20 of lot-b.
    const lotB = r.find((l) => l.lotId === "lot-b");
    const lotC = r.find((l) => l.lotId === "lot-c");
    expect(lotB?.quantity).toBe("30"); // 50 - 20
    expect(lotC?.quantity).toBe("80");
    // lot-c: 80 @ $180 basis = 14400; MV 80 @ $210 = 16800; unreal = 2400.
    expect(lotC?.marketValue?.amount.toFixed()).toBe("16800");
    expect(lotC?.unrealizedGain?.amount.toFixed()).toBe("2400");
    // lot-b acquired 2022 -> long as of 2024-06-15; lot-c 2024 -> short.
    expect(lotB?.holdingPeriod).toBe("long");
    expect(lotC?.holdingPeriod).toBe("short");
  });
});

describe("error handling", () => {
  it("throws when selling more than is held", () => {
    const over: Ledger = {
      currency: "USD",
      acquisitions: [L1],
      disposals: [
        { id: "s", symbol: "AAPL", date: "2024-06-01", quantity: "11", proceeds: "100" },
      ],
    };
    expect(() => realizeGains(over, "fifo")).toThrow(/only 10/);
  });

  it("throws when spec-id picks an unknown lot", () => {
    expect(() =>
      realizeGains(ledgerWithPicks([{ lotId: "NOPE", quantity: "10" }]), "spec-id"),
    ).toThrow(/unknown/);
  });

  it("throws when spec-id supplies no picks", () => {
    expect(() => realizeGains(ledgerWithPicks(), "spec-id")).toThrow(/no lot picks/);
  });

  it("throws when spec-id picks fewer units than the disposal sells", () => {
    // Sells 10 but only picks 4.
    expect(() =>
      realizeGains(ledgerWithPicks([{ lotId: "L1", quantity: "4" }]), "spec-id"),
    ).toThrow(/picks 4 units but sells 10/);
  });

  it("throws when spec-id picks more units than the disposal sells", () => {
    expect(() =>
      realizeGains(
        ledgerWithPicks([
          { lotId: "L1", quantity: "10" },
          { lotId: "L2", quantity: "5" },
        ]),
        "spec-id",
      ),
    ).toThrow(/picks 15 units but sells 10/);
  });

  it("throws when spec-id over-draws a single lot beyond its remaining units", () => {
    // L1 only has 10 units; pick 11.
    const ledger: Ledger = {
      currency: "USD",
      acquisitions: [L1],
      disposals: [
        {
          id: "S1",
          symbol: "AAPL",
          date: "2024-06-01",
          quantity: "11",
          proceeds: "2200",
          picks: [{ lotId: "L1", quantity: "11" }],
        },
      ],
    };
    expect(() => realizeGains(ledger, "spec-id")).toThrow(/only 10/);
  });

  it("throws when duplicate spec-id picks collectively over-draw a lot", () => {
    // L1 has 10; two picks of 6 each = 12 > 10. Must reject, not silently
    // over-sell the lot.
    const ledger: Ledger = {
      currency: "USD",
      acquisitions: [L1],
      disposals: [
        {
          id: "S1",
          symbol: "AAPL",
          date: "2024-06-01",
          quantity: "12",
          proceeds: "2400",
          picks: [
            { lotId: "L1", quantity: "6" },
            { lotId: "L1", quantity: "6" },
          ],
        },
      ],
    };
    expect(() => realizeGains(ledger, "spec-id")).toThrow(/only 10/);
  });
});

describe("purity and determinism", () => {
  it("does not mutate the input ledger", () => {
    const before = JSON.stringify(sampleLedger);
    realizeGains(sampleLedger, "fifo");
    openLots(sampleLedger, "hifo", { prices: samplePrices, asOf: sampleAsOf });
    expect(JSON.stringify(sampleLedger)).toBe(before);
  });

  it("is deterministic across runs", () => {
    const methods: LotMethod[] = ["fifo", "lifo", "hifo"];
    for (const m of methods) {
      const a = realizeGains(sampleLedger, m);
      const b = realizeGains(sampleLedger, m);
      expect(a.gain.amount.toFixed()).toBe(b.gain.amount.toFixed());
    }
  });

  it("realized gain is method-independent for a total liquidation", () => {
    // Sell the entire position; total realized gain must be identical across
    // methods (only the short/long split differs).
    const liquidate: Ledger = {
      currency: "USD",
      acquisitions: [L1, L2, L3],
      disposals: [
        { id: "s", symbol: "AAPL", date: "2024-06-01", quantity: "30", proceeds: "6000" },
      ],
    };
    const fifo = realizeGains(liquidate, "fifo").gain.amount.toFixed();
    const lifo = realizeGains(liquidate, "lifo").gain.amount.toFixed();
    const hifo = realizeGains(liquidate, "hifo").gain.amount.toFixed();
    // 6000 - (1000+1500+1200) = 2300.
    expect(fifo).toBe("2300");
    expect(lifo).toBe("2300");
    expect(hifo).toBe("2300");
  });
});
