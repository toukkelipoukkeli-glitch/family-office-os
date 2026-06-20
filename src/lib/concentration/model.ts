import * as z from "zod";

import {
  CurrencyCode,
  Id,
  NonNegativeMoneySchema,
} from "../model/primitives";

/**
 * Domain model for the concentration & single-name risk monitor (unit
 * m11-concentration-risk).
 *
 * A family office's headline risk is rarely visible at the position level: the
 * family may hold "only" a 4% line in an S&P 500 index fund and a 5% line in a
 * tech-sector ETF, yet *look through* those funds and discover that a single
 * mega-cap name shows up inside both — so the true single-name exposure is much
 * larger than any one position implies. This model captures positions that are
 * either held *directly* (a single security) or via a *fund* whose published
 * constituent weights let the monitor roll the fund's value down to the
 * underlying single names.
 *
 * READ-ONLY product: every schema here only *describes* what is owned so the
 * monitor can report concentration. Nothing moves money or places a trade.
 */

/**
 * Broad sector buckets used to aggregate single-name exposure into sector
 * concentration. Kept small and fixed so the roll-up is deterministic.
 */
export const SECTORS = [
  "technology",
  "financials",
  "healthcare",
  "consumer",
  "energy",
  "industrials",
  "real_estate",
  "materials",
  "utilities",
  "communication",
  "government",
  "diversified",
  "other",
] as const;
export const Sector = z.enum(SECTORS);
export type Sector = z.infer<typeof Sector>;

/** Human-readable label for a sector. */
export function sectorLabel(sector: Sector): string {
  switch (sector) {
    case "technology":
      return "Technology";
    case "financials":
      return "Financials";
    case "healthcare":
      return "Health care";
    case "consumer":
      return "Consumer";
    case "energy":
      return "Energy";
    case "industrials":
      return "Industrials";
    case "real_estate":
      return "Real estate";
    case "materials":
      return "Materials";
    case "utilities":
      return "Utilities";
    case "communication":
      return "Communication";
    case "government":
      return "Government";
    case "diversified":
      return "Diversified";
    case "other":
      return "Other";
  }
}

/**
 * How quickly a position can be realised. Mirrors the liquidity tiers used by
 * the risk cockpit (m9) so the two pages read alike. `illiquid` positions feed
 * the monitor's illiquid-percentage gauge.
 */
export const LIQUIDITY_TIERS = ["liquid", "semi_liquid", "illiquid"] as const;
export const LiquidityTier = z.enum(LIQUIDITY_TIERS);
export type LiquidityTier = z.infer<typeof LiquidityTier>;

/** Human-readable label for a liquidity tier. */
export function liquidityLabel(tier: LiquidityTier): string {
  switch (tier) {
    case "liquid":
      return "Liquid";
    case "semi_liquid":
      return "Semi-liquid";
    case "illiquid":
      return "Illiquid";
  }
}

/**
 * One constituent of a fund: an underlying single name and the fraction of the
 * fund's net asset value it represents. Weights for a fund should sum to ~1; a
 * shortfall is treated as residual diversified exposure (see the engine) rather
 * than silently rescaled, so the monitor never overstates a single name.
 */
export const FundConstituent = z
  .object({
    /** Stable id of the underlying issuer/name (e.g. "issuer-aapl"). */
    issuerId: Id,
    /** Display name of the underlying name (e.g. "Apple Inc."). */
    name: z.string().trim().min(1).max(120),
    /** Sector of the underlying name. */
    sector: Sector,
    /** Fraction of the fund's NAV this name represents, in (0, 1]. */
    weight: z.number().gt(0).lte(1),
  })
  .strict();
export type FundConstituent = z.infer<typeof FundConstituent>;

/**
 * A position in the book. Either:
 *  - a *direct* single security (`kind: "direct"`), which IS its own issuer; or
 *  - a *fund* (`kind: "fund"`) whose `constituents` let the monitor look
 *    through the fund's value to the underlying single names.
 */
const PositionBase = {
  /** Stable id for this position. */
  id: Id,
  /** Display name (e.g. "Apple Inc.", "Vanguard S&P 500 ETF"). */
  name: z.string().trim().min(1).max(120),
  /** Optional ticker/symbol. */
  symbol: z.string().trim().min(1).max(24).optional(),
  /** Market value of the whole position (non-negative). */
  value: NonNegativeMoneySchema,
  /** How quickly the position can be realised. */
  liquidity: LiquidityTier,
} as const;

export const DirectPosition = z
  .object({
    kind: z.literal("direct"),
    ...PositionBase,
    /** Stable id of the issuer this security belongs to. */
    issuerId: Id,
    /** Sector of the issuer. */
    sector: Sector,
  })
  .strict();
export type DirectPosition = z.infer<typeof DirectPosition>;

export const FundPosition = z
  .object({
    kind: z.literal("fund"),
    ...PositionBase,
    /**
     * Published constituent weights. Their sum should be <= 1; any remainder is
     * treated as residual *diversified* exposure (the long tail of small
     * names), so the look-through never overstates a single name.
     */
    constituents: z.array(FundConstituent).default([]),
  })
  .strict()
  .superRefine((fund, ctx) => {
    let total = 0;
    const seen = new Set<string>();
    fund.constituents.forEach((c, i) => {
      total += c.weight;
      if (seen.has(c.issuerId)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate constituent issuerId in fund ${fund.id}: ${c.issuerId}`,
          path: ["constituents", i, "issuerId"],
        });
      }
      seen.add(c.issuerId);
    });
    // Allow a tiny floating-point slop above 1 from summing many weights.
    if (total > 1 + 1e-9) {
      ctx.addIssue({
        code: "custom",
        message: `fund ${fund.id} constituent weights sum to ${total.toFixed(
          6,
        )} (> 1)`,
        path: ["constituents"],
      });
    }
  });
export type FundPosition = z.infer<typeof FundPosition>;

export const Position = z.discriminatedUnion("kind", [
  DirectPosition,
  FundPosition,
]);
export type Position = z.infer<typeof Position>;

/**
 * The book the monitor analyses: a named set of positions in one reporting
 * currency. Position ids must be unique.
 */
export const ConcentrationBook = z
  .object({
    id: Id,
    name: z.string().trim().min(1).max(120),
    baseCurrency: CurrencyCode,
    positions: z.array(Position).default([]),
  })
  .strict()
  .superRefine((book, ctx) => {
    const seen = new Set<string>();
    book.positions.forEach((p, i) => {
      if (seen.has(p.id)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate position id: ${p.id}`,
          path: ["positions", i, "id"],
        });
      }
      seen.add(p.id);
      // Every position's value must be in the book's base currency: this unit
      // reports a single-currency book (FX is a separate concern).
      if (p.value.currency !== book.baseCurrency) {
        ctx.addIssue({
          code: "custom",
          message: `position ${p.id} is in ${p.value.currency}, not the book base currency ${book.baseCurrency}`,
          path: ["positions", i, "value", "currency"],
        });
      }
    });
  });
export type ConcentrationBook = z.infer<typeof ConcentrationBook>;
