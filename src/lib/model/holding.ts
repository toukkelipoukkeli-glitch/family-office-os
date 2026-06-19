import * as z from "zod";

import { AssetClass } from "./asset-class";
import { Lot } from "./lot";
import { CurrencyCode, Id } from "./primitives";
import { Valuation } from "./valuation";

/**
 * A holding: a single position the family owns, classified by
 * {@link AssetClass}. A holding is made up of one or more tax {@link Lot}s and
 * carries a list of {@link Valuation}s over time (most recent last is a UI
 * convention, not enforced here).
 *
 * READ-ONLY product: a holding records what is owned and what it is worth; it
 * never represents an order or transfer.
 */
export const Holding = z
  .object({
    /** Stable id for this holding. */
    id: Id,
    /** Human-readable name (e.g. "Apple Inc.", "Lafite 2016 (6x75cl)"). */
    name: z.string().trim().min(1, "holding name must not be empty"),
    /** The asset class this holding belongs to. */
    assetClass: AssetClass,
    /** Optional market/instrument symbol (e.g. "AAPL", "BTC"). */
    symbol: z.string().trim().min(1).optional(),
    /** Reporting currency for this holding. */
    currency: CurrencyCode,
    /** Tax lots making up the position. */
    lots: z.array(Lot).default([]),
    /** Valuation history (any order; UI may sort by `asOf`). */
    valuations: z.array(Valuation).default([]),
    /** Optional free-text tags for grouping/filtering. */
    tags: z.array(z.string().trim().min(1)).default([]),
  })
  .strict()
  .superRefine((holding, ctx) => {
    // Lot ids must be unique within a holding.
    const seen = new Set<string>();
    holding.lots.forEach((lot, i) => {
      if (seen.has(lot.id)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate lot id: ${lot.id}`,
          path: ["lots", i, "id"],
        });
      }
      seen.add(lot.id);
    });
    // Valuation ids must be unique within a holding.
    const seenVal = new Set<string>();
    holding.valuations.forEach((v, i) => {
      if (seenVal.has(v.id)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate valuation id: ${v.id}`,
          path: ["valuations", i, "id"],
        });
      }
      seenVal.add(v.id);
    });
  });
export type Holding = z.infer<typeof Holding>;
