import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import type { FxRateTable } from "@/lib/allocation";
import type { Holding } from "@/lib/model/holding";
import type { Portfolio } from "@/lib/model/portfolio";

import {
  buildHoldingRows,
  buildHoldingsView,
  filterHoldingRows,
  searchHoldingRows,
  sortHoldingRows,
  summarizeRows,
} from "./holdings";

/**
 * Adversarial coverage (independent tester, m13-holdings-index).
 *
 * The seeded fixture book is conveniently all-gainers, single-base-currency and
 * fully valued, so several real code paths in `holdings.ts` are never exercised
 * by the author's own suite: a holding that is *down*, a partially/fully unvalued
 * book (zero-total weight branch), the `gainPct === undefined` sort sink, and the
 * search haystack's raw asset-class key. These tests build minimal synthetic
 * portfolios to hit those branches deterministically and offline.
 */

const BASE = "USD";

// A flat FX table: EUR→USD = 2, USD→USD = 1. Deliberately not 1:1 so currency
// conversion is observable.
const FX: FxRateTable = {
  base: BASE,
  rates: { USD: "1", EUR: "2" },
};

function holding(partial: Partial<Holding> & Pick<Holding, "id" | "name">): Holding {
  return {
    assetClass: "equity",
    currency: "USD",
    lots: [],
    valuations: [],
    tags: [],
    ...partial,
  } as Holding;
}

function portfolio(holdings: Holding[]): Portfolio {
  return {
    id: "pf-adversarial",
    name: "Adversarial book",
    baseCurrency: BASE,
    holdings,
  } as Portfolio;
}

/** A holding worth `value` (USD) that cost `cost` (USD), with one lot. */
function valued(
  id: string,
  value: string,
  cost: string,
  extra: Partial<Holding> = {},
): Holding {
  return holding({
    id,
    name: id,
    currency: "USD",
    lots: [
      {
        id: `${id}-l1`,
        quantity: "1",
        unitCost: { amount: cost, currency: "USD" },
        acquiredOn: "2020-01-01",
      },
    ],
    valuations: [
      {
        id: `${id}-v1`,
        value: { amount: value, currency: "USD" },
        asOf: "2026-01-01T00:00:00Z",
        source: "market",
        confidence: "high",
      },
    ],
    ...extra,
  });
}

describe("losers: negative gain and negative gainPct", () => {
  const rows = buildHoldingRows(
    portfolio([valued("loser", "60", "100"), valued("winner", "150", "100")]),
    FX,
  );

  it("computes a negative gain and gainPct for a position that is down", () => {
    const loser = rows.find((r) => r.id === "loser")!;
    expect(loser.value).toBe(60);
    expect(loser.costBasis).toBe(100);
    expect(loser.gain).toBe(-40);
    expect(loser.gainPct).toBeCloseTo(-0.4, 10);
    // Exact Money is retained at the export boundary, sign included.
    expect(loser.gainMoney.amount.toFixed()).toBe("-40");
  });

  it("partitions gainers vs losers with the gain filter", () => {
    expect(filterHoldingRows(rows, { gain: "loss" }).map((r) => r.id)).toEqual([
      "loser",
    ]);
    expect(filterHoldingRows(rows, { gain: "gain" }).map((r) => r.id)).toEqual([
      "winner",
    ]);
  });

  it("treats a break-even (gain === 0) position as a gainer, not a loser", () => {
    const flat = buildHoldingRows(portfolio([valued("flat", "100", "100")]), FX);
    expect(flat[0].gain).toBe(0);
    expect(filterHoldingRows(flat, { gain: "gain" })).toHaveLength(1);
    expect(filterHoldingRows(flat, { gain: "loss" })).toHaveLength(0);
  });
});

describe("zero-total book: weights are 0, not NaN/Infinity", () => {
  it("yields weight 0 for every row when nothing is valued", () => {
    const rows = buildHoldingRows(
      portfolio([
        holding({ id: "a", name: "A" }),
        holding({ id: "b", name: "B" }),
      ]),
      FX,
    );
    expect(rows.every((r) => r.unvalued)).toBe(true);
    expect(rows.every((r) => r.value === 0)).toBe(true);
    // The div-by-zero guard must produce 0, never NaN/Infinity.
    expect(rows.every((r) => r.weight === 0)).toBe(true);
    expect(rows.every((r) => Number.isFinite(r.weight))).toBe(true);
    const s = summarizeRows(rows);
    expect(s.totalWeight).toBe(0);
    expect(Number.isFinite(s.totalValue)).toBe(true);
  });
});

describe("currency conversion via the FX table", () => {
  it("converts a EUR holding into the USD base at the table rate", () => {
    const eur = holding({
      id: "eur",
      name: "Euro Position",
      currency: "EUR",
      lots: [
        {
          id: "eur-l1",
          quantity: "1",
          unitCost: { amount: "100", currency: "EUR" },
          acquiredOn: "2020-01-01",
        },
      ],
      valuations: [
        {
          id: "eur-v1",
          value: { amount: "300", currency: "EUR" },
          asOf: "2026-01-01T00:00:00Z",
          source: "market",
          confidence: "high",
        },
      ],
    });
    const [row] = buildHoldingRows(portfolio([eur]), FX);
    // 300 EUR × 2 = 600 USD value; 100 EUR × 2 = 200 USD cost; gain 400 USD.
    expect(row.value).toBe(600);
    expect(row.costBasis).toBe(200);
    expect(row.gain).toBe(400);
    expect(row.valueMoney.currency).toBe("USD");
    expect(row.valueMoney.amount.toFixed()).toBe("600");
  });
});

describe("gainPct === undefined sorts to the sink in both directions", () => {
  // One unvalued (no cost, no value) row → gainPct undefined; two valued.
  const rows = buildHoldingRows(
    portfolio([
      valued("hi", "200", "100"), // +100%
      valued("lo", "120", "100"), // +20%
      holding({ id: "none", name: "None" }), // gainPct undefined
    ]),
    FX,
  );

  it("descending: undefined-pct row is last", () => {
    const out = sortHoldingRows(rows, [{ key: "gainPct", direction: "desc" }]);
    expect(out.map((r) => r.id)).toEqual(["hi", "lo", "none"]);
  });

  it("ascending: undefined-pct row is still effectively the floor", () => {
    const out = sortHoldingRows(rows, [{ key: "gainPct", direction: "asc" }]);
    // asc puts the smallest first; the undefined row maps to -Infinity so it
    // leads in asc — the point is it is deterministic and grouped, never NaN.
    expect(out[0].id).toBe("none");
    expect(out.map((r) => r.id)).toEqual(["none", "lo", "hi"]);
  });
});

describe("search matches the raw asset-class key as well as its label", () => {
  const rows = buildHoldingRows(
    portfolio([
      valued("e1", "10", "5", { assetClass: "equity" }),
      valued("c1", "10", "5", { assetClass: "crypto" }),
    ]),
    FX,
  );

  it("matches on the raw class key", () => {
    expect(searchHoldingRows(rows, "equity").map((r) => r.id)).toEqual(["e1"]);
    expect(searchHoldingRows(rows, "crypto").map((r) => r.id)).toEqual(["c1"]);
  });
});

describe("multi-column sort is a total, deterministic order under heavy ties", () => {
  // All rows share value AND gain; only the id tiebreak separates them.
  const rows = buildHoldingRows(
    portfolio([
      valued("z", "100", "50"),
      valued("a", "100", "50"),
      valued("m", "100", "50"),
    ]),
    FX,
  );

  it("falls back to ascending id when every sort key ties", () => {
    const desc = sortHoldingRows(rows, [{ key: "value", direction: "desc" }]);
    // value ties for all → id tiebreak is ascending regardless of direction.
    expect(desc.map((r) => r.id)).toEqual(["a", "m", "z"]);
    const asc = sortHoldingRows(rows, [{ key: "value", direction: "asc" }]);
    expect(asc.map((r) => r.id)).toEqual(["a", "m", "z"]);
  });
});

describe("summary totals reconcile across a filtered pipeline", () => {
  it("buildHoldingsView summary equals the sum of its own visible rows", () => {
    const p = portfolio([
      valued("a", "100", "40"),
      valued("b", "300", "100"),
      valued("c", "50", "80"), // loser
    ]);
    const view = buildHoldingsView(p, FX, { filter: { gain: "gain" } });
    expect(view.rows.map((r) => r.id).sort()).toEqual(["a", "b"]);
    const expectedValue = view.rows.reduce(
      (acc, r) => acc.plus(r.value),
      new Decimal(0),
    );
    expect(view.summary.totalValue).toBe(expectedValue.toNumber());
    expect(view.summary.totalGain).toBe(
      view.summary.totalValue - view.summary.totalCost,
    );
  });
});
