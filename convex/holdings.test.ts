/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

/**
 * Deterministic, fully offline tests for the Convex holdings/valuations
 * backend. `convex-test` runs the real query/mutation handlers against an
 * in-memory mock of the Convex backend — no network, no live deployment.
 *
 * `import.meta.glob` lets convex-test discover the function modules so it can
 * resolve `api.*` references during the test run.
 */
const modules = import.meta.glob("./**/*.*s");

/** A minimal valid Money value object (string amount + ISO currency). */
const usd = (amount: string) => ({ amount, currency: "USD" });

/** A holding fixture matching the Convex `holdings` table shape. */
function holdingFixture(overrides: Record<string, unknown> = {}) {
  return {
    holdingId: "h-aapl",
    portfolioId: "p-main",
    name: "Apple Inc.",
    assetClass: "equity" as const,
    symbol: "AAPL",
    currency: "USD",
    lots: [
      {
        id: "lot-1",
        quantity: "100",
        unitCost: usd("150.00"),
        acquiredOn: "2021-01-15",
      },
    ],
    valuations: [
      {
        id: "val-1",
        value: usd("19000.00"),
        asOf: "2026-01-01T00:00:00Z",
        source: "market" as const,
        confidence: "high" as const,
      },
    ],
    tags: ["tech"],
    ...overrides,
  };
}

describe("portfolios", () => {
  test("upsertPortfolio inserts then updates in place (idempotent on id)", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.holdings.upsertPortfolio, {
      portfolioId: "p-main",
      name: "Ursin Family Office",
      baseCurrency: "USD",
    });
    await t.mutation(api.holdings.upsertPortfolio, {
      portfolioId: "p-main",
      name: "Ursin Family Office (renamed)",
      baseCurrency: "EUR",
    });

    const all = await t.query(api.holdings.listPortfolios, {});
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe("Ursin Family Office (renamed)");
    expect(all[0].baseCurrency).toBe("EUR");

    const one = await t.query(api.holdings.getPortfolio, {
      portfolioId: "p-main",
    });
    expect(one?.portfolioId).toBe("p-main");
  });
});

describe("holdings", () => {
  test("upsertHolding stores money as exact decimal strings", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.holdings.upsertHolding, holdingFixture());

    const h = await t.query(api.holdings.getHolding, { holdingId: "h-aapl" });
    expect(h).not.toBeNull();
    expect(h?.lots[0].unitCost).toEqual({ amount: "150.00", currency: "USD" });
    expect(h?.valuations[0].value.amount).toBe("19000.00");
    // amount is a string, never a JS number — no float currency.
    expect(typeof h?.lots[0].unitCost.amount).toBe("string");
  });

  test("upsertHolding is idempotent on holdingId", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.holdings.upsertHolding, holdingFixture());
    await t.mutation(
      api.holdings.upsertHolding,
      holdingFixture({ name: "Apple (renamed)" }),
    );

    const all = await t.query(api.holdings.listHoldings, {});
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe("Apple (renamed)");
  });

  test("listHoldingsByPortfolio filters by owning portfolio", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.holdings.upsertHolding, holdingFixture());
    await t.mutation(
      api.holdings.upsertHolding,
      holdingFixture({
        holdingId: "h-btc",
        portfolioId: "p-other",
        name: "Bitcoin",
        assetClass: "crypto",
        symbol: "BTC",
      }),
    );

    const mine = await t.query(api.holdings.listHoldingsByPortfolio, {
      portfolioId: "p-main",
    });
    expect(mine.map((h) => h.holdingId)).toEqual(["h-aapl"]);
  });

  test("listHoldingsByAssetClass uses the composite index", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.holdings.upsertHolding, holdingFixture());
    await t.mutation(
      api.holdings.upsertHolding,
      holdingFixture({
        holdingId: "h-wine",
        name: "Lafite 2016",
        assetClass: "wine",
        symbol: undefined,
      }),
    );

    const wine = await t.query(api.holdings.listHoldingsByAssetClass, {
      portfolioId: "p-main",
      assetClass: "wine",
    });
    expect(wine).toHaveLength(1);
    expect(wine[0].holdingId).toBe("h-wine");
  });

  test("deleteHolding removes the row and is a no-op when absent", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.holdings.upsertHolding, holdingFixture());

    await t.mutation(api.holdings.deleteHolding, { holdingId: "h-aapl" });
    expect(await t.query(api.holdings.listHoldings, {})).toHaveLength(0);

    // No-op on a missing id (must not throw).
    await t.mutation(api.holdings.deleteHolding, { holdingId: "nope" });
  });
});

describe("valuations", () => {
  test("addValuation appends to history", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.holdings.upsertHolding, holdingFixture());

    await t.mutation(api.holdings.addValuation, {
      holdingId: "h-aapl",
      valuation: {
        id: "val-2",
        value: usd("20500.00"),
        asOf: "2026-03-01T00:00:00Z",
        source: "market",
        confidence: "high",
      },
    });

    const h = await t.query(api.holdings.getHolding, { holdingId: "h-aapl" });
    expect(h?.valuations).toHaveLength(2);
  });

  test("addValuation rejects a duplicate valuation id", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.holdings.upsertHolding, holdingFixture());

    await expect(
      t.mutation(api.holdings.addValuation, {
        holdingId: "h-aapl",
        valuation: {
          id: "val-1", // already present in the fixture
          value: usd("1.00"),
          asOf: "2026-04-01T00:00:00Z",
          source: "manual",
          confidence: "low",
        },
      }),
    ).rejects.toThrow(/duplicate valuation id/);
  });

  test("addValuation throws for an unknown holding", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.holdings.addValuation, {
        holdingId: "ghost",
        valuation: {
          id: "v",
          value: usd("1.00"),
          asOf: "2026-01-01T00:00:00Z",
          source: "manual",
          confidence: "low",
        },
      }),
    ).rejects.toThrow(/holding not found/);
  });

  test("latestValuation returns the most recent by asOf, null when empty", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(
      api.holdings.upsertHolding,
      holdingFixture({ valuations: [] }),
    );
    expect(
      await t.query(api.holdings.latestValuation, { holdingId: "h-aapl" }),
    ).toBeNull();

    for (const [id, asOf, amount] of [
      ["a", "2026-01-01T00:00:00Z", "100.00"],
      ["c", "2026-05-01T00:00:00Z", "300.00"],
      ["b", "2026-03-01T00:00:00Z", "200.00"],
    ] as const) {
      await t.mutation(api.holdings.addValuation, {
        holdingId: "h-aapl",
        valuation: {
          id,
          value: usd(amount),
          asOf,
          source: "market",
          confidence: "high",
        },
      });
    }

    const latest = await t.query(api.holdings.latestValuation, {
      holdingId: "h-aapl",
    });
    expect(latest?.id).toBe("c");
    expect(latest?.value.amount).toBe("300.00");
  });
});

describe("lookups for missing ids", () => {
  test("getPortfolio returns null for an unknown id", async () => {
    const t = convexTest(schema, modules);
    expect(
      await t.query(api.holdings.getPortfolio, { portfolioId: "ghost" }),
    ).toBeNull();
  });

  test("getHolding returns null for an unknown id", async () => {
    const t = convexTest(schema, modules);
    expect(
      await t.query(api.holdings.getHolding, { holdingId: "ghost" }),
    ).toBeNull();
  });

  test("latestValuation returns null for an unknown holding (no throw)", async () => {
    const t = convexTest(schema, modules);
    expect(
      await t.query(api.holdings.latestValuation, { holdingId: "ghost" }),
    ).toBeNull();
  });

  test("listHoldingsByPortfolio returns [] when the portfolio has none", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.holdings.upsertHolding, holdingFixture());
    expect(
      await t.query(api.holdings.listHoldingsByPortfolio, {
        portfolioId: "empty",
      }),
    ).toEqual([]);
  });
});

describe("valuation ordering edge cases", () => {
  test("latestValuation keeps the asOf max even when ids/insert order differ", async () => {
    const t = convexTest(schema, modules);
    // Latest by asOf is val-1 (in the fixture); append two strictly earlier.
    await t.mutation(api.holdings.upsertHolding, holdingFixture());
    await t.mutation(api.holdings.addValuation, {
      holdingId: "h-aapl",
      valuation: {
        id: "earlier",
        value: usd("1.00"),
        asOf: "2020-01-01T00:00:00Z",
        source: "manual",
        confidence: "low",
      },
    });
    const latest = await t.query(api.holdings.latestValuation, {
      holdingId: "h-aapl",
    });
    expect(latest?.id).toBe("val-1");
  });

  test("latestValuation is deterministic on tied asOf (keeps the earlier-seen one)", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(
      api.holdings.upsertHolding,
      holdingFixture({ valuations: [] }),
    );
    const tie = "2026-06-01T00:00:00Z";
    await t.mutation(api.holdings.addValuation, {
      holdingId: "h-aapl",
      valuation: {
        id: "first",
        value: usd("100.00"),
        asOf: tie,
        source: "market",
        confidence: "high",
      },
    });
    await t.mutation(api.holdings.addValuation, {
      holdingId: "h-aapl",
      valuation: {
        id: "second",
        value: usd("200.00"),
        asOf: tie,
        source: "market",
        confidence: "high",
      },
    });
    // reduce uses strict `>`, so the first-seen valuation wins on a tie.
    const latest = await t.query(api.holdings.latestValuation, {
      holdingId: "h-aapl",
    });
    expect(latest?.id).toBe("first");
  });

  test("latestValuation compares by absolute instant across UTC offsets", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(
      api.holdings.upsertHolding,
      holdingFixture({ valuations: [] }),
    );
    // Same wall-clock date, but the +05:30 value is an EARLIER instant than the
    // Z value. Lexicographic string comparison would wrongly pick "offset".
    await t.mutation(api.holdings.addValuation, {
      holdingId: "h-aapl",
      valuation: {
        id: "offset",
        value: usd("100.00"),
        asOf: "2026-06-15T10:00:00+05:30", // == 04:30:00Z
        source: "market",
        confidence: "high",
      },
    });
    await t.mutation(api.holdings.addValuation, {
      holdingId: "h-aapl",
      valuation: {
        id: "utc",
        value: usd("200.00"),
        asOf: "2026-06-15T05:30:00Z", // one hour later than the offset value
        source: "market",
        confidence: "high",
      },
    });
    const latest = await t.query(api.holdings.latestValuation, {
      holdingId: "h-aapl",
    });
    expect(latest?.id).toBe("utc");
  });

  test("latestValuation treats equal instants in different offsets as a tie", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(
      api.holdings.upsertHolding,
      holdingFixture({ valuations: [] }),
    );
    // Both denote the same instant (2026-06-15T04:30:00Z); first-seen wins.
    await t.mutation(api.holdings.addValuation, {
      holdingId: "h-aapl",
      valuation: {
        id: "first",
        value: usd("100.00"),
        asOf: "2026-06-15T10:00:00+05:30",
        source: "market",
        confidence: "high",
      },
    });
    await t.mutation(api.holdings.addValuation, {
      holdingId: "h-aapl",
      valuation: {
        id: "second",
        value: usd("200.00"),
        asOf: "2026-06-15T04:30:00Z",
        source: "market",
        confidence: "high",
      },
    });
    const latest = await t.query(api.holdings.latestValuation, {
      holdingId: "h-aapl",
    });
    expect(latest?.id).toBe("first");
  });
});

describe("upsertHolding enforces unique valuation ids", () => {
  test("rejects a valuations array containing duplicate ids", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(
        api.holdings.upsertHolding,
        holdingFixture({
          valuations: [
            {
              id: "dup",
              value: usd("1.00"),
              asOf: "2026-01-01T00:00:00Z",
              source: "market",
              confidence: "high",
            },
            {
              id: "dup",
              value: usd("2.00"),
              asOf: "2026-02-01T00:00:00Z",
              source: "market",
              confidence: "high",
            },
          ],
        }),
      ),
    ).rejects.toThrow(/duplicate valuation id/);
  });

  test("accepts a valuations array with all-unique ids", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(
      api.holdings.upsertHolding,
      holdingFixture({
        valuations: [
          {
            id: "v1",
            value: usd("1.00"),
            asOf: "2026-01-01T00:00:00Z",
            source: "market",
            confidence: "high",
          },
          {
            id: "v2",
            value: usd("2.00"),
            asOf: "2026-02-01T00:00:00Z",
            source: "market",
            confidence: "high",
          },
        ],
      }),
    );
    const h = await t.query(api.holdings.getHolding, { holdingId: "h-aapl" });
    expect(h?.valuations).toHaveLength(2);
  });
});

describe("asset-class filtering is portfolio-scoped", () => {
  test("listHoldingsByAssetClass does not bleed across portfolios", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.holdings.upsertHolding, holdingFixture());
    await t.mutation(
      api.holdings.upsertHolding,
      holdingFixture({
        holdingId: "h-msft",
        portfolioId: "p-other",
        name: "Microsoft",
        symbol: "MSFT",
      }),
    );

    const mine = await t.query(api.holdings.listHoldingsByAssetClass, {
      portfolioId: "p-main",
      assetClass: "equity",
    });
    expect(mine.map((h) => h.holdingId)).toEqual(["h-aapl"]);
  });
});

describe("upsert returns a stable id", () => {
  test("upsertPortfolio returns the same _id across insert and update", async () => {
    const t = convexTest(schema, modules);
    const firstId = await t.mutation(api.holdings.upsertPortfolio, {
      portfolioId: "p-stable",
      name: "Stable",
      baseCurrency: "USD",
    });
    const secondId = await t.mutation(api.holdings.upsertPortfolio, {
      portfolioId: "p-stable",
      name: "Stable (renamed)",
      baseCurrency: "USD",
    });
    expect(secondId).toBe(firstId);
  });

  test("upsertHolding returns the same _id across insert and update", async () => {
    const t = convexTest(schema, modules);
    const firstId = await t.mutation(
      api.holdings.upsertHolding,
      holdingFixture(),
    );
    const secondId = await t.mutation(
      api.holdings.upsertHolding,
      holdingFixture({ name: "Apple (renamed)" }),
    );
    expect(secondId).toBe(firstId);
  });
});

describe("schema validation", () => {
  test("rejects an invalid asset class", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.holdings.upsertHolding, {
        ...holdingFixture(),
        // @ts-expect-error — intentionally invalid to assert validator rejects it
        assetClass: "not-a-class",
      }),
    ).rejects.toThrow();
  });
});
