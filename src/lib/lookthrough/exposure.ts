import * as z from "zod";

import { Id, NonNegativeMoneySchema } from "../model/primitives";

/**
 * Exposure model for cross-entity look-through (unit m8-lookthrough).
 *
 * A family office rarely holds assets directly. It holds *entities* (holdcos,
 * funds, SPVs) that in turn hold assets, and those entities are owned only
 * partially. The economically meaningful question — "how much of asset-class X
 * does the family actually have?" — requires *looking through* the ownership
 * chain and attributing each entity's direct holdings by the effective share
 * the family ultimately owns.
 *
 * READ-ONLY product: these schemas describe and roll up exposure. Nothing here
 * moves money, rebalances, or trades; it only reports the consolidated picture.
 */

/**
 * Broad asset classes used to bucket an entity's direct holdings. Kept small
 * and fixed so the look-through roll-up is deterministic and chartable.
 */
export const ASSET_CLASSES = [
  "equity",
  "fixed_income",
  "real_estate",
  "private_equity",
  "cash",
  "commodities",
  "crypto",
  "other",
] as const;
export const AssetClass = z.enum(ASSET_CLASSES);
export type AssetClass = z.infer<typeof AssetClass>;

/** Human-readable label for an asset class. */
export function assetClassLabel(cls: AssetClass): string {
  switch (cls) {
    case "equity":
      return "Public equity";
    case "fixed_income":
      return "Fixed income";
    case "real_estate":
      return "Real estate";
    case "private_equity":
      return "Private equity";
    case "cash":
      return "Cash & equivalents";
    case "commodities":
      return "Commodities";
    case "crypto":
      return "Digital assets";
    case "other":
      return "Other";
  }
}

/**
 * A single direct holding *inside* an entity: a non-negative gross value
 * tagged with an asset class. This is the entity's own balance sheet, before
 * any ownership attribution.
 */
export const DirectHolding = z
  .object({
    /** Asset-class bucket this holding belongs to. */
    assetClass: AssetClass,
    /** Gross value held directly by the entity (non-negative). */
    value: NonNegativeMoneySchema,
    /** Optional label (e.g. "S&P 500 index", "Office tower — Helsinki"). */
    label: z.string().trim().min(1).max(120).optional(),
  })
  .strict();
export type DirectHolding = z.infer<typeof DirectHolding>;

/**
 * The direct (own-balance-sheet) holdings of one entity, keyed by entity id.
 * The id must match an {@link Entity} in the org hierarchy this is consolidated
 * against. An entity with no listed holdings is treated as a pure holding
 * vehicle (its exposure is entirely the look-through of its subsidiaries).
 */
export const EntityHoldings = z
  .object({
    /** Id of the entity that directly holds these assets. */
    entityId: Id,
    /** Direct holdings on this entity's own balance sheet. */
    holdings: z.array(DirectHolding).default([]),
  })
  .strict();
export type EntityHoldings = z.infer<typeof EntityHoldings>;

/** A validated list of per-entity direct holdings. */
export const HoldingsList = z.array(EntityHoldings);
export type HoldingsList = z.infer<typeof HoldingsList>;
