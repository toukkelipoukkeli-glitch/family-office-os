import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import {
  assetClassValidator,
  lotValidator,
  valuationValidator,
} from "./schema";

/**
 * Holdings + portfolio queries and mutations for the read-only family-office
 * OS. Reads list and look up what the family owns; "mutations" only ever record
 * portfolio state (holdings, lots, valuations) — they never move money or place
 * a trade, in keeping with the product's read-only contract.
 */

/** Shape of a holding stored in (or written to) the `holdings` table. */
const holdingFields = {
  holdingId: v.string(),
  portfolioId: v.string(),
  name: v.string(),
  assetClass: assetClassValidator,
  symbol: v.optional(v.string()),
  currency: v.string(),
  lots: v.array(lotValidator),
  valuations: v.array(valuationValidator),
  tags: v.array(v.string()),
};

const portfolioFields = {
  portfolioId: v.string(),
  name: v.string(),
  baseCurrency: v.string(),
  createdAt: v.optional(v.string()),
  updatedAt: v.optional(v.string()),
};

/** List every portfolio. */
export const listPortfolios = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("portfolios").collect();
  },
});

/** Look up a single portfolio by its stable model id. */
export const getPortfolio = query({
  args: { portfolioId: v.string() },
  handler: async (ctx, { portfolioId }) => {
    return await ctx.db
      .query("portfolios")
      .withIndex("by_portfolioId", (q) => q.eq("portfolioId", portfolioId))
      .unique();
  },
});

/** List every holding, most-recently-created first by Convex ordering. */
export const listHoldings = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("holdings").collect();
  },
});

/** List the holdings belonging to one portfolio. */
export const listHoldingsByPortfolio = query({
  args: { portfolioId: v.string() },
  handler: async (ctx, { portfolioId }) => {
    return await ctx.db
      .query("holdings")
      .withIndex("by_portfolioId", (q) => q.eq("portfolioId", portfolioId))
      .collect();
  },
});

/** List the holdings in a portfolio that match a given asset class. */
export const listHoldingsByAssetClass = query({
  args: { portfolioId: v.string(), assetClass: assetClassValidator },
  handler: async (ctx, { portfolioId, assetClass }) => {
    return await ctx.db
      .query("holdings")
      .withIndex("by_assetClass", (q) =>
        q.eq("portfolioId", portfolioId).eq("assetClass", assetClass),
      )
      .collect();
  },
});

/** Look up a single holding by its stable model id. */
export const getHolding = query({
  args: { holdingId: v.string() },
  handler: async (ctx, { holdingId }) => {
    return await ctx.db
      .query("holdings")
      .withIndex("by_holdingId", (q) => q.eq("holdingId", holdingId))
      .unique();
  },
});

/**
 * Create a portfolio, or update it in place if one with the same `portfolioId`
 * already exists. Idempotent on `portfolioId`. Records portfolio metadata only.
 */
export const upsertPortfolio = mutation({
  args: portfolioFields,
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("portfolios")
      .withIndex("by_portfolioId", (q) =>
        q.eq("portfolioId", args.portfolioId),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }
    return await ctx.db.insert("portfolios", args);
  },
});

/**
 * Create a holding, or update it in place if one with the same `holdingId`
 * already exists. Idempotent on `holdingId`. Records what is owned and what it
 * is worth; never an order or transfer.
 */
export const upsertHolding = mutation({
  args: holdingFields,
  handler: async (ctx, args) => {
    assertUniqueValuationIds(args.valuations);
    const existing = await ctx.db
      .query("holdings")
      .withIndex("by_holdingId", (q) => q.eq("holdingId", args.holdingId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }
    return await ctx.db.insert("holdings", args);
  },
});

/**
 * Enforce the holding invariant that valuation `id`s are unique within a
 * holding. `addValuation` guards the append path; this guards the bulk-write
 * path (`upsertHolding`), which replaces the whole `valuations` array.
 */
function assertUniqueValuationIds(
  valuations: ReadonlyArray<{ id: string }>,
): void {
  const seen = new Set<string>();
  for (const valuation of valuations) {
    if (seen.has(valuation.id)) {
      throw new Error(`duplicate valuation id: ${valuation.id}`);
    }
    seen.add(valuation.id);
  }
}

/**
 * Parse an RFC-3339 `asOf` timestamp to its absolute instant (ms since epoch)
 * for correct chronological comparison across time zones. `asOf` may carry an
 * explicit `±HH:MM` offset (see `IsoDateTime` in the model), so two strings
 * that denote the same instant must compare equal even when their wall-clock
 * text differs — lexicographic string comparison would order them wrong.
 * Unparseable values sort oldest (`-Infinity`) so a real timestamp always wins.
 */
function asOfInstant(asOf: string): number {
  const ms = Date.parse(asOf);
  return Number.isNaN(ms) ? -Infinity : ms;
}

/**
 * Append a valuation to a holding's valuation history. Refuses to add a
 * valuation whose `id` already exists on the holding (ids are unique within a
 * holding, mirroring the model's invariant).
 */
export const addValuation = mutation({
  args: {
    holdingId: v.string(),
    valuation: valuationValidator,
  },
  handler: async (ctx, { holdingId, valuation }) => {
    const holding = await ctx.db
      .query("holdings")
      .withIndex("by_holdingId", (q) => q.eq("holdingId", holdingId))
      .unique();
    if (!holding) {
      throw new Error(`holding not found: ${holdingId}`);
    }
    if (holding.valuations.some((existing) => existing.id === valuation.id)) {
      throw new Error(`duplicate valuation id: ${valuation.id}`);
    }
    await ctx.db.patch(holding._id, {
      valuations: [...holding.valuations, valuation],
    });
    return holding._id;
  },
});

/**
 * Read the latest valuation for a holding by its absolute `asOf` instant.
 * Timestamps are parsed (not compared as raw strings) so values with different
 * UTC offsets that denote the same instant compare correctly. On a tie the
 * first-seen valuation is kept, so the result is deterministic. Returns `null`
 * if the holding has no valuations. Read-only.
 */
export const latestValuation = query({
  args: { holdingId: v.string() },
  returns: v.union(valuationValidator, v.null()),
  handler: async (ctx, { holdingId }) => {
    const holding = await ctx.db
      .query("holdings")
      .withIndex("by_holdingId", (q) => q.eq("holdingId", holdingId))
      .unique();
    if (!holding || holding.valuations.length === 0) {
      return null;
    }
    return holding.valuations.reduce((latest, candidate) =>
      asOfInstant(candidate.asOf) > asOfInstant(latest.asOf)
        ? candidate
        : latest,
    );
  },
});

/** Delete a holding by its stable model id. No-op if it does not exist. */
export const deleteHolding = mutation({
  args: { holdingId: v.string() },
  handler: async (ctx, { holdingId }) => {
    const holding = await ctx.db
      .query("holdings")
      .withIndex("by_holdingId", (q) => q.eq("holdingId", holdingId))
      .unique();
    if (holding) {
      await ctx.db.delete(holding._id);
    }
  },
});
