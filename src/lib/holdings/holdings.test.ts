import { describe, expect, it } from "vitest";

import { seededPortfolio } from "@/fixtures";
import { networthRateTable } from "@/lib/networth";
import type { Portfolio } from "@/lib/model/portfolio";
import type { Holding } from "@/lib/model/holding";

import {
  buildHoldingRows,
  buildHoldingsView,
  distinctAssetClasses,
  distinctCurrencies,
  filterHoldingRows,
  holdingCostBasis,
  isEmptyColumnFilter,
  searchHoldingRows,
  sortHoldingRows,
  summarizeRows,
  type HoldingRow,
} from "./holdings";

const TABLE = networthRateTable;

function rowsById(rows: readonly HoldingRow[]): Map<string, HoldingRow> {
  return new Map(rows.map((r) => [r.id, r]));
}

describe("holdingCostBasis", () => {
  it("sums quantity × unitCost + fees across lots in the holding currency", () => {
    const aapl = seededPortfolio.holdings.find((h) => h.id === "hold-equity-aapl")!;
    // (400 × 120.50 + 4.95) + (150 × 150.00 + 4.95) = 48204.95 + 22504.95
    expect(holdingCostBasis(aapl).amount.toFixed(2)).toBe("70709.90");
    expect(holdingCostBasis(aapl).currency).toBe("USD");
  });

  it("is zero for a holding with no lots (e.g. cash)", () => {
    const cash = seededPortfolio.holdings.find((h) => h.id === "hold-cash-usd")!;
    expect(holdingCostBasis(cash).amount.isZero()).toBe(true);
    expect(holdingCostBasis(cash).currency).toBe("USD");
  });

  it("omits fees when a lot has none, but still counts unitCost", () => {
    const lego = seededPortfolio.holdings.find((h) => h.id === "hold-lego-ucs")!;
    // 3 × 799.99, no fees.
    expect(holdingCostBasis(lego).amount.toFixed(2)).toBe("2399.97");
  });

  it("throws when a lot is priced in a different currency than the holding", () => {
    const broken: Holding = {
      id: "h-broken",
      name: "Broken",
      assetClass: "equity",
      currency: "USD",
      lots: [
        {
          id: "l1",
          quantity: "1",
          unitCost: { amount: "100", currency: "EUR" },
          acquiredOn: "2020-01-01",
        },
      ],
      valuations: [],
      tags: [],
    };
    expect(() => holdingCostBasis(broken)).toThrow(/does not match holding currency/);
  });
});

describe("buildHoldingRows", () => {
  const rows = buildHoldingRows(seededPortfolio, TABLE);

  it("builds one row per holding, in portfolio order", () => {
    expect(rows).toHaveLength(seededPortfolio.holdings.length);
    expect(rows.map((r) => r.id)).toEqual(
      seededPortfolio.holdings.map((h) => h.id),
    );
  });

  it("converts native-currency value into the base currency", () => {
    const byId = rowsById(rows);
    // Bund: 201400 EUR × 1.08 = 217512 USD.
    expect(byId.get("hold-bond-bund")!.value).toBeCloseTo(217512, 2);
    // Porsche: 560000 EUR × 1.08 = 604800 USD.
    expect(byId.get("hold-car-porsche")!.value).toBeCloseTo(604800, 2);
  });

  it("computes base-currency cost basis and unrealized gain", () => {
    const aapl = rowsById(rows).get("hold-equity-aapl")!;
    expect(aapl.costBasis).toBeCloseTo(70709.9, 2);
    expect(aapl.gain).toBeCloseTo(108625 - 70709.9, 2);
    expect(aapl.gainPct).toBeCloseTo(37915.1 / 70709.9, 6);
  });

  it("reports gainPct as undefined when cost basis is zero", () => {
    const cash = rowsById(rows).get("hold-cash-usd")!;
    expect(cash.costBasis).toBe(0);
    expect(cash.gainPct).toBeUndefined();
    // The whole value is unrealized "gain" when there is no cost.
    expect(cash.gain).toBeCloseTo(250000, 2);
  });

  it("weights sum to 1 across the valued book", () => {
    const sum = rows.reduce((acc, r) => acc + r.weight, 0);
    expect(sum).toBeCloseTo(1, 9);
  });

  it("carries valuation metadata (confidence, source, asOf)", () => {
    const forest = rowsById(rows).get("hold-forest-nordic")!;
    // Latest valuation wins (appraisal 2026, not the 2018 cost valuation).
    expect(forest.confidence).toBe("medium");
    expect(forest.valuationSource).toBe("appraisal");
    expect(forest.valuationAsOf).toBe("2026-03-01T00:00:00Z");
    expect(forest.unvalued).toBe(false);
  });

  it("marks a holding with no valuations as unvalued with zero value", () => {
    const portfolio: Portfolio = {
      ...seededPortfolio,
      holdings: [
        {
          id: "h-novalue",
          name: "No Valuation",
          assetClass: "equity",
          currency: "USD",
          lots: [],
          valuations: [],
          tags: [],
        },
      ],
    };
    const [row] = buildHoldingRows(portfolio, TABLE);
    expect(row.unvalued).toBe(true);
    expect(row.value).toBe(0);
    expect(row.confidence).toBeUndefined();
  });
});

describe("searchHoldingRows", () => {
  const rows = buildHoldingRows(seededPortfolio, TABLE);

  it("returns all rows (copy) for an empty/blank query", () => {
    expect(searchHoldingRows(rows, "")).toHaveLength(rows.length);
    expect(searchHoldingRows(rows, "   ")).toHaveLength(rows.length);
    expect(searchHoldingRows(rows, "")).not.toBe(rows);
  });

  it("matches on name, case-insensitively", () => {
    const out = searchHoldingRows(rows, "apple");
    expect(out.map((r) => r.id)).toEqual(["hold-equity-aapl"]);
    expect(searchHoldingRows(rows, "APPLE")).toHaveLength(1);
  });

  it("matches on symbol", () => {
    expect(searchHoldingRows(rows, "btc").map((r) => r.id)).toEqual([
      "hold-crypto-btc",
    ]);
  });

  it("matches on tag", () => {
    const out = searchHoldingRows(rows, "collectible").map((r) => r.id);
    expect(out).toContain("hold-wine-lafite");
    expect(out).toContain("hold-watch-patek");
    expect(out).not.toContain("hold-equity-aapl");
  });

  it("matches on currency and asset-class label", () => {
    expect(searchHoldingRows(rows, "chf").length).toBeGreaterThan(0);
    expect(searchHoldingRows(rows, "vineyard").map((r) => r.id)).toContain(
      "hold-vineyard-tuscany",
    );
  });

  it("returns nothing when nothing matches", () => {
    expect(searchHoldingRows(rows, "zzzznotpresent")).toEqual([]);
  });
});

describe("filterHoldingRows", () => {
  const rows = buildHoldingRows(seededPortfolio, TABLE);

  it("treats an empty filter as all-pass (and returns a copy)", () => {
    expect(isEmptyColumnFilter({})).toBe(true);
    const out = filterHoldingRows(rows, {});
    expect(out).toHaveLength(rows.length);
    expect(out).not.toBe(rows);
  });

  it("filters by asset class", () => {
    const out = filterHoldingRows(rows, {
      assetClasses: new Set(["cash"]),
    });
    expect(out.map((r) => r.id).sort()).toEqual([
      "hold-cash-chf",
      "hold-cash-usd",
    ]);
  });

  it("filters by currency", () => {
    const out = filterHoldingRows(rows, { currencies: new Set(["EUR"]) });
    expect(out.every((r) => r.currency === "EUR")).toBe(true);
    expect(out.length).toBeGreaterThan(0);
  });

  it("filters by confidence band", () => {
    const out = filterHoldingRows(rows, { confidences: new Set(["low"]) });
    expect(out.every((r) => r.confidence === "low")).toBe(true);
    expect(out.map((r) => r.id)).toContain("hold-art-hockney");
  });

  it("filters by min/max base value (inclusive)", () => {
    const min = filterHoldingRows(rows, { minValue: 300000 });
    expect(min.every((r) => r.value >= 300000)).toBe(true);
    const band = filterHoldingRows(rows, {
      minValue: 100000,
      maxValue: 250000,
    });
    expect(band.every((r) => r.value >= 100000 && r.value <= 250000)).toBe(true);
  });

  it("filters gainers vs losers", () => {
    const losers = filterHoldingRows(rows, { gain: "loss" });
    // The seeded book is all gainers; loss filter yields nothing.
    expect(losers).toEqual([]);
    const gainers = filterHoldingRows(rows, { gain: "gain" });
    expect(gainers).toHaveLength(rows.length);
  });

  it("AND-combines multiple dimensions", () => {
    const out = filterHoldingRows(rows, {
      currencies: new Set(["EUR"]),
      confidences: new Set(["medium"]),
    });
    expect(
      out.every((r) => r.currency === "EUR" && r.confidence === "medium"),
    ).toBe(true);
    expect(out.map((r) => r.id)).toContain("hold-car-porsche");
    expect(out.map((r) => r.id)).not.toContain("hold-bond-bund"); // EUR but high
  });
});

describe("sortHoldingRows", () => {
  const rows = buildHoldingRows(seededPortfolio, TABLE);

  it("returns a copy and does not mutate the input", () => {
    const before = rows.map((r) => r.id);
    const out = sortHoldingRows(rows, [{ key: "value", direction: "desc" }]);
    expect(out).not.toBe(rows);
    expect(rows.map((r) => r.id)).toEqual(before);
  });

  it("sorts by value descending", () => {
    const out = sortHoldingRows(rows, [{ key: "value", direction: "desc" }]);
    const values = out.map((r) => r.value);
    expect(values).toEqual([...values].sort((a, b) => b - a));
    expect(out[0].id).toBe("hold-vineyard-tuscany"); // largest
  });

  it("sorts by name ascending, case-insensitively", () => {
    const out = sortHoldingRows(rows, [{ key: "name", direction: "asc" }]);
    const names = out.map((r) => r.name.toLowerCase());
    expect(names).toEqual([...names].sort());
  });

  it("supports multi-column sort (primary then tiebreak)", () => {
    // Primary: currency asc; secondary: value desc.
    const out = sortHoldingRows(rows, [
      { key: "currency", direction: "asc" },
      { key: "value", direction: "desc" },
    ]);
    // Within each currency group, value must be non-increasing.
    const groups = new Map<string, number[]>();
    for (const r of out) {
      const arr = groups.get(r.currency) ?? [];
      arr.push(r.value);
      groups.set(r.currency, arr);
    }
    for (const arr of groups.values()) {
      expect(arr).toEqual([...arr].sort((a, b) => b - a));
    }
    // Currencies themselves are in ascending order across the result.
    const currencyOrder = out.map((r) => r.currency);
    const firstSeen = [...new Set(currencyOrder)];
    expect(firstSeen).toEqual([...firstSeen].sort());
  });

  it("is stable and deterministic via the id tiebreak", () => {
    // Sort by a constant key (confidence) — ties resolve by id deterministically.
    const a = sortHoldingRows(rows, [{ key: "confidence", direction: "desc" }]);
    const b = sortHoldingRows(rows, [{ key: "confidence", direction: "desc" }]);
    expect(a.map((r) => r.id)).toEqual(b.map((r) => r.id));
    // Within a confidence band, ids are ascending.
    for (let i = 1; i < a.length; i++) {
      if (a[i].confidence === a[i - 1].confidence) {
        expect(a[i - 1].id < a[i].id).toBe(true);
      }
    }
  });

  it("sorts rows without a gain percentage to the bottom", () => {
    const out = sortHoldingRows(rows, [{ key: "gainPct", direction: "desc" }]);
    const noPct = out.filter((r) => r.gainPct === undefined);
    const last = out.slice(out.length - noPct.length);
    expect(last.every((r) => r.gainPct === undefined)).toBe(true);
  });

  it("returns input order (copy) for an empty sort spec", () => {
    const out = sortHoldingRows(rows, []);
    expect(out.map((r) => r.id)).toEqual(rows.map((r) => r.id));
  });
});

describe("summarizeRows / distinct helpers", () => {
  const rows = buildHoldingRows(seededPortfolio, TABLE);

  it("summarizes value/cost/gain/weight and count", () => {
    const s = summarizeRows(rows);
    expect(s.count).toBe(rows.length);
    expect(s.totalWeight).toBeCloseTo(1, 9);
    expect(s.totalGain).toBeCloseTo(s.totalValue - s.totalCost, 2);
  });

  it("summarizes a filtered subset to that subset's totals", () => {
    const sub = filterHoldingRows(rows, { assetClasses: new Set(["cash"]) });
    const s = summarizeRows(sub);
    expect(s.count).toBe(2);
    expect(s.totalCost).toBe(0);
    expect(s.totalValue).toBeCloseTo(250000 + 95200, 2);
  });

  it("lists distinct asset classes and currencies", () => {
    expect(distinctCurrencies(rows)).toEqual(["CHF", "EUR", "GBP", "USD"]);
    const classes = distinctAssetClasses(rows);
    expect(new Set(classes).size).toBe(classes.length);
    expect(classes).toContain("equity");
  });
});

describe("buildHoldingsView (composed pipeline)", () => {
  it("applies search → filter → sort and summarizes the result", () => {
    const view = buildHoldingsView(seededPortfolio, TABLE, {
      filter: { currencies: new Set(["EUR"]) },
      sort: [{ key: "value", direction: "desc" }],
    });
    expect(view.baseCurrency).toBe("USD");
    expect(view.rows.every((r) => r.currency === "EUR")).toBe(true);
    const values = view.rows.map((r) => r.value);
    expect(values).toEqual([...values].sort((a, b) => b - a));
    expect(view.summary.count).toBe(view.rows.length);
    expect(view.summary.totalValue).toBeCloseTo(
      view.rows.reduce((a, r) => a + r.value, 0),
      2,
    );
  });

  it("is deterministic: same query → identical row order", () => {
    const q = {
      search: "e",
      sort: [{ key: "name" as const, direction: "asc" as const }],
    };
    const a = buildHoldingsView(seededPortfolio, TABLE, q);
    const b = buildHoldingsView(seededPortfolio, TABLE, q);
    expect(a.rows.map((r) => r.id)).toEqual(b.rows.map((r) => r.id));
  });

  it("returns the full book for an empty query", () => {
    const view = buildHoldingsView(seededPortfolio, TABLE);
    expect(view.rows).toHaveLength(seededPortfolio.holdings.length);
  });
});
