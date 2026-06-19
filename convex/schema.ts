import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Convex schema for the family-office-os backend.
 *
 * This mirrors the read-only portfolio data model in `src/lib/model/*`
 * (Zod schemas) so the backend and the client share one shape. Money is never
 * stored as a float: every monetary amount is an exact decimal **string** plus
 * a 3-letter currency code, matching `MoneySchema` in the model.
 *
 * READ-ONLY product: these tables record what the family owns and what it is
 * worth. Nothing here represents an order, transfer, or any money movement.
 */

/** The asset classes tracked by the product. Mirrors `ASSET_CLASSES`. */
export const ASSET_CLASSES = [
  "equity",
  "bond",
  "etf",
  "cash",
  "crypto",
  "forest",
  "wine",
  "art",
  "lego",
  "car",
  "vineyard",
  "pe",
  "watch",
] as const;

/** How a valuation was obtained. Mirrors `VALUATION_SOURCES`. */
export const VALUATION_SOURCES = [
  "market",
  "appraisal",
  "manual",
  "model",
  "cost",
] as const;

/** Coarse confidence band for a valuation. Mirrors `CONFIDENCE_LEVELS`. */
export const CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;

export const assetClassValidator = v.union(
  v.literal("equity"),
  v.literal("bond"),
  v.literal("etf"),
  v.literal("cash"),
  v.literal("crypto"),
  v.literal("forest"),
  v.literal("wine"),
  v.literal("art"),
  v.literal("lego"),
  v.literal("car"),
  v.literal("vineyard"),
  v.literal("pe"),
  v.literal("watch"),
);

export const valuationSourceValidator = v.union(
  v.literal("market"),
  v.literal("appraisal"),
  v.literal("manual"),
  v.literal("model"),
  v.literal("cost"),
);

export const confidenceLevelValidator = v.union(
  v.literal("high"),
  v.literal("medium"),
  v.literal("low"),
);

/**
 * Money value object: an exact decimal `amount` string plus a normalized
 * 3-letter `currency` code. Mirrors `MoneySchema` (and `NonNegativeMoneySchema`
 * — non-negativity is enforced at the boundary, not by Convex's type system).
 */
export const moneyValidator = v.object({
  amount: v.string(),
  currency: v.string(),
});

/** A tax lot: a tranche of a holding acquired at a known cost. Mirrors `Lot`. */
export const lotValidator = v.object({
  id: v.string(),
  quantity: v.string(),
  unitCost: moneyValidator,
  acquiredOn: v.string(),
  fees: v.optional(moneyValidator),
  note: v.optional(v.string()),
});

/** A point-in-time valuation with an explicit confidence. Mirrors `Valuation`. */
export const valuationValidator = v.object({
  id: v.string(),
  value: moneyValidator,
  asOf: v.string(),
  source: valuationSourceValidator,
  confidence: confidenceLevelValidator,
  confidenceScore: v.optional(v.number()),
  note: v.optional(v.string()),
});

export default defineSchema({
  /**
   * Portfolios: the top-level container for a family's holdings, reported in a
   * single base currency. Mirrors `Portfolio` (holdings are stored in the
   * `holdings` table and joined by `portfolioId`).
   */
  portfolios: defineTable({
    /** Stable model id (distinct from the Convex `_id`). */
    portfolioId: v.string(),
    name: v.string(),
    baseCurrency: v.string(),
    createdAt: v.optional(v.string()),
    updatedAt: v.optional(v.string()),
  }).index("by_portfolioId", ["portfolioId"]),

  /**
   * Holdings: a single position the family owns, classified by asset class.
   * Mirrors `Holding`. Lots and valuations are embedded (they are small, fully
   * owned by the holding, and always loaded with it).
   */
  holdings: defineTable({
    /** Stable model id (distinct from the Convex `_id`). */
    holdingId: v.string(),
    /** Owning portfolio's model id. */
    portfolioId: v.string(),
    name: v.string(),
    assetClass: assetClassValidator,
    symbol: v.optional(v.string()),
    currency: v.string(),
    lots: v.array(lotValidator),
    valuations: v.array(valuationValidator),
    tags: v.array(v.string()),
  })
    .index("by_portfolioId", ["portfolioId"])
    .index("by_holdingId", ["holdingId"])
    .index("by_assetClass", ["portfolioId", "assetClass"]),
});
