import { describe, expect, it } from "vitest";

import { Ledger } from "../taxlots";

import {
  WASH_SALE_WINDOW_DAYS,
  findHarvestCandidates,
  sampleAsOf,
  sampleLedger,
  samplePrices,
  washSaleConflicts,
} from "./index";

describe("washSaleConflicts", () => {
  it("flags a purchase 12 days before the harvest date", () => {
    const conflicts = washSaleConflicts(sampleLedger, "BABA", sampleAsOf);
    // baba-2 was bought 2024-05-22, asOf is 2024-06-03 -> 12 days before.
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].lotId).toBe("baba-2");
    expect(conflicts[0].dayOffset).toBe(-12);
  });

  it("flags a purchase 20 days after the harvest date (symmetric window)", () => {
    const conflicts = washSaleConflicts(sampleLedger, "META", sampleAsOf);
    // meta-2 was bought 2024-06-23, 20 days after asOf.
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].lotId).toBe("meta-2");
    expect(conflicts[0].dayOffset).toBe(20);
  });

  it("finds no conflict for a symbol with no nearby purchase", () => {
    expect(washSaleConflicts(sampleLedger, "TSLA", sampleAsOf)).toHaveLength(0);
  });

  it("treats exactly 30 days as inside, 31 days as outside the window", () => {
    const ledger: Ledger = {
      currency: "USD",
      acquisitions: [
        { id: "edge-in", symbol: "X", date: "2024-05-04", quantity: "1", cost: "1" }, // 30 days before 2024-06-03
        { id: "edge-out", symbol: "X", date: "2024-05-03", quantity: "1", cost: "1" }, // 31 days before
      ],
      disposals: [],
    };
    const conflicts = washSaleConflicts(ledger, "X", "2024-06-03");
    expect(conflicts.map((c) => c.lotId)).toEqual(["edge-in"]);
    expect(conflicts[0].dayOffset).toBe(-WASH_SALE_WINDOW_DAYS);
  });

  it("counts the harvest date itself (offset 0) as inside the window", () => {
    const ledger: Ledger = {
      currency: "USD",
      acquisitions: [
        { id: "same-day", symbol: "X", date: "2024-06-03", quantity: "1", cost: "1" },
      ],
      disposals: [],
    };
    const conflicts = washSaleConflicts(ledger, "X", "2024-06-03");
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].dayOffset).toBe(0);
  });
});

describe("findHarvestCandidates", () => {
  const report = findHarvestCandidates(sampleLedger, {
    prices: samplePrices,
    asOf: sampleAsOf,
    method: "fifo",
  });

  it("only surfaces underwater lots, worst loss first", () => {
    expect(report.candidates.map((c) => c.lotId)).toEqual([
      "tsla-1", // 21,000 loss
      "baba-1", // 11,400 loss
      "meta-1", // 2,500 loss
      "baba-2", // 160 loss
    ]);
    // The NVDA winner is never a candidate.
    expect(report.candidates.some((c) => c.symbol === "NVDA")).toBe(false);
  });

  it("computes exact harvestable losses with decimal precision", () => {
    const byId = Object.fromEntries(report.candidates.map((c) => [c.lotId, c]));
    expect(byId["tsla-1"].harvestableLoss.amount.toFixed()).toBe("21000");
    expect(byId["baba-1"].harvestableLoss.amount.toFixed()).toBe("11400");
    expect(byId["meta-1"].harvestableLoss.amount.toFixed()).toBe("2500");
    expect(byId["baba-2"].harvestableLoss.amount.toFixed()).toBe("160");
    // Unrealized gain is the negative of the harvestable loss.
    expect(byId["tsla-1"].unrealizedGain.amount.toFixed()).toBe("-21000");
  });

  it("flags wash-sale risk on lots with a nearby same-symbol purchase", () => {
    const byId = Object.fromEntries(report.candidates.map((c) => [c.lotId, c]));
    expect(byId["tsla-1"].washSaleRisk).toBe(false);
    expect(byId["tsla-1"].washSaleConflicts).toHaveLength(0);

    expect(byId["baba-1"].washSaleRisk).toBe(true);
    expect(byId["baba-1"].washSaleConflicts[0].lotId).toBe("baba-2");

    expect(byId["meta-1"].washSaleRisk).toBe(true);
    expect(byId["meta-1"].washSaleConflicts[0].lotId).toBe("meta-2");
  });

  it("splits clean vs. blocked harvestable loss totals", () => {
    expect(report.cleanHarvestableLoss.amount.toFixed()).toBe("21000");
    // baba-1 (11,400) + meta-1 (2,500) + baba-2 (160)
    expect(report.blockedHarvestableLoss.amount.toFixed()).toBe("14060");
    expect(report.totalHarvestableLoss.amount.toFixed()).toBe("35060");
    expect(report.flaggedCount).toBe(3);
  });

  it("carries currency and holding period through", () => {
    expect(report.currency).toBe("USD");
    expect(report.candidates.every((c) => c.basis.currency === "USD")).toBe(true);
    // All sample lots are < 1 year old as of asOf -> short-term.
    expect(report.candidates.every((c) => c.holdingPeriod === "short")).toBe(true);
  });

  it("is pure — does not mutate the input ledger", () => {
    const before = JSON.stringify(sampleLedger);
    findHarvestCandidates(sampleLedger, { prices: samplePrices, asOf: sampleAsOf });
    expect(JSON.stringify(sampleLedger)).toBe(before);
  });

  it("returns no candidates when every lot is above basis", () => {
    const allUp = findHarvestCandidates(sampleLedger, {
      prices: { NVDA: "900", TSLA: "999", BABA: "999", META: "999" },
      asOf: sampleAsOf,
    });
    expect(allUp.candidates).toHaveLength(0);
    expect(allUp.totalHarvestableLoss.amount.toFixed()).toBe("0");
    expect(allUp.flaggedCount).toBe(0);
  });

  it("respects open-lot accounting: a sold-off lot is not a candidate", () => {
    const ledger: Ledger = {
      currency: "USD",
      acquisitions: [
        { id: "a", symbol: "Z", date: "2024-01-01", quantity: "10", cost: "1000" },
      ],
      disposals: [
        { id: "s", symbol: "Z", date: "2024-03-01", quantity: "10", proceeds: "500" },
      ],
    };
    const report = findHarvestCandidates(ledger, {
      prices: { Z: "50" },
      asOf: "2024-06-03",
    });
    // The lot is fully closed, so there is nothing left to harvest.
    expect(report.candidates).toHaveLength(0);
  });
});

// --- Adversarial edge cases (independent tester) -------------------------

describe("findHarvestCandidates — adversarial edges", () => {
  it("sorts multiple wash-sale conflicts earliest (most negative offset) first", () => {
    const ledger: Ledger = {
      currency: "USD",
      acquisitions: [
        { id: "core", symbol: "X", date: "2023-01-01", quantity: "100", cost: "10000" },
        // Three buys inside the window, listed out of chronological order.
        { id: "after", symbol: "X", date: "2024-06-20", quantity: "1", cost: "50" }, // +17
        { id: "before", symbol: "X", date: "2024-05-10", quantity: "1", cost: "50" }, // -24
        { id: "near", symbol: "X", date: "2024-06-01", quantity: "1", cost: "50" }, // -2
      ],
      disposals: [],
    };
    const report = findHarvestCandidates(ledger, {
      prices: { X: "50" },
      asOf: "2024-06-03",
    });
    const core = report.candidates.find((c) => c.lotId === "core");
    expect(core).toBeDefined();
    // Sorted by ascending dayOffset: -24, -2, +17.
    expect(core!.washSaleConflicts.map((w) => w.lotId)).toEqual([
      "before",
      "near",
      "after",
    ]);
    expect(core!.washSaleConflicts.map((w) => w.dayOffset)).toEqual([-24, -2, 17]);
    expect(core!.washSaleRisk).toBe(true);
  });

  it("a window of 0 only flags a same-day purchase", () => {
    const ledger: Ledger = {
      currency: "USD",
      acquisitions: [
        { id: "same", symbol: "X", date: "2024-06-03", quantity: "1", cost: "100" },
        { id: "next", symbol: "X", date: "2024-06-04", quantity: "1", cost: "100" },
      ],
      disposals: [],
    };
    expect(
      washSaleConflicts(ledger, "X", "2024-06-03", 0).map((w) => w.lotId),
    ).toEqual(["same"]);
  });

  it("honors a custom window passed through findHarvestCandidates", () => {
    const ledger: Ledger = {
      currency: "USD",
      acquisitions: [
        { id: "core", symbol: "X", date: "2023-01-01", quantity: "100", cost: "10000" },
        { id: "buy50", symbol: "X", date: "2024-07-23", quantity: "1", cost: "50" }, // +50 days
      ],
      disposals: [],
    };
    const narrow = findHarvestCandidates(ledger, {
      prices: { X: "50" },
      asOf: "2024-06-03",
      window: 30,
    });
    const wide = findHarvestCandidates(ledger, {
      prices: { X: "50" },
      asOf: "2024-06-03",
      window: 60,
    });
    expect(narrow.candidates.find((c) => c.lotId === "core")!.washSaleRisk).toBe(false);
    expect(wide.candidates.find((c) => c.lotId === "core")!.washSaleRisk).toBe(true);
    // The clean/blocked split must follow the flag.
    expect(narrow.cleanHarvestableLoss.amount.toFixed()).toBe("5000");
    expect(narrow.blockedHarvestableLoss.amount.toFixed()).toBe("0");
    expect(wide.cleanHarvestableLoss.amount.toFixed()).toBe("0");
    expect(wide.blockedHarvestableLoss.amount.toFixed()).toBe("5000");
  });

  it("classifies a >1y old underwater lot as long-term", () => {
    const ledger: Ledger = {
      currency: "USD",
      acquisitions: [
        // Acquired well over a year before asOf -> long-term.
        { id: "old", symbol: "X", date: "2022-01-01", quantity: "10", cost: "10000" },
      ],
      disposals: [],
    };
    const report = findHarvestCandidates(ledger, {
      prices: { X: "500" },
      asOf: "2024-06-03",
    });
    expect(report.candidates).toHaveLength(1);
    expect(report.candidates[0].holdingPeriod).toBe("long");
    expect(report.candidates[0].harvestableLoss.amount.toFixed()).toBe("5000");
  });

  it("does not flag a same-symbol buy that is just outside the window (31 days)", () => {
    const ledger: Ledger = {
      currency: "USD",
      acquisitions: [
        { id: "core", symbol: "X", date: "2023-01-01", quantity: "10", cost: "10000" },
        { id: "far", symbol: "X", date: "2024-07-04", quantity: "1", cost: "50" }, // +31 days
      ],
      disposals: [],
    };
    const report = findHarvestCandidates(ledger, {
      prices: { X: "500" },
      asOf: "2024-06-03",
    });
    expect(report.candidates.find((c) => c.lotId === "core")!.washSaleRisk).toBe(false);
    expect(report.flaggedCount).toBe(0);
  });

  it("preserves the ledger currency on zeroed clean/blocked totals", () => {
    const ledger: Ledger = {
      currency: "EUR",
      acquisitions: [
        { id: "win", symbol: "X", date: "2023-01-01", quantity: "10", cost: "1000" },
      ],
      disposals: [],
    };
    const report = findHarvestCandidates(ledger, {
      prices: { X: "200" }, // up vs basis -> no candidate
      asOf: "2024-06-03",
    });
    expect(report.candidates).toHaveLength(0);
    expect(report.currency).toBe("EUR");
    expect(report.cleanHarvestableLoss.currency).toBe("EUR");
    expect(report.blockedHarvestableLoss.currency).toBe("EUR");
    expect(report.totalHarvestableLoss.currency).toBe("EUR");
  });

  it("ignores a same-symbol buy in the window when there is no underwater lot to harvest", () => {
    // A purchase inside the window should not, by itself, create a candidate;
    // candidates come only from underwater open lots.
    const ledger: Ledger = {
      currency: "USD",
      acquisitions: [
        { id: "core", symbol: "X", date: "2023-01-01", quantity: "10", cost: "1000" },
        { id: "add", symbol: "X", date: "2024-06-01", quantity: "1", cost: "200" },
      ],
      disposals: [],
    };
    const report = findHarvestCandidates(ledger, {
      prices: { X: "500" }, // way up -> no underwater lot
      asOf: "2024-06-03",
    });
    expect(report.candidates).toHaveLength(0);
    expect(report.flaggedCount).toBe(0);
  });
});
