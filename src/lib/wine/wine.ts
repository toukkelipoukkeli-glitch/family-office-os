import * as z from "zod";

import { CurrencyCode, Id, IsoDate } from "../model/primitives";

/**
 * Fine-wine domain model: bottles, lots, provenance, and market observations.
 *
 * This is a READ-ONLY product: these schemas model and value a wine holding.
 * Nothing here buys, sells, or moves a bottle — a {@link WineLot} is a record
 * of what the family already owns, and a {@link WineValuation} (see
 * `valuation.ts`) only *reports* an estimate of what it is worth.
 *
 * All prices are *per-bottle* in the wine's quote currency unless a field name
 * says otherwise, and are exact decimal strings (never floating-point) in line
 * with AGENTS.md.
 */

/** A non-negative exact decimal money price per bottle, as a string. */
const PricePerBottle = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/, "price must be a non-negative decimal string")
  .refine((s) => Number(s) > 0, "price must be greater than zero");
export type PricePerBottle = z.infer<typeof PricePerBottle>;

/**
 * Standard bottle formats and their volume relative to a 750ml bottle.
 * Larger formats command a premium and age more slowly; the multiplier is the
 * volume ratio, used to normalize a per-bottle price to a per-750ml basis.
 */
export const BOTTLE_FORMATS = [
  "half", // 375ml
  "bottle", // 750ml
  "magnum", // 1.5L  = 2 bottles
  "double-magnum", // 3L = 4 bottles
  "jeroboam", // 4.5L (Bordeaux) = 6 bottles
  "imperial", // 6L = 8 bottles
] as const;
export const BottleFormat = z.enum(BOTTLE_FORMATS);
export type BottleFormat = z.infer<typeof BottleFormat>;

/** Volume of a format as a multiple of a standard 750ml bottle. */
export const FORMAT_VOLUME_RATIO: Record<BottleFormat, number> = {
  half: 0.5,
  bottle: 1,
  magnum: 2,
  "double-magnum": 4,
  jeroboam: 6,
  imperial: 8,
};

/** Fine-wine producing regions we track (extensible enum). */
export const WINE_REGIONS = [
  "bordeaux",
  "burgundy",
  "champagne",
  "rhone",
  "tuscany",
  "piedmont",
  "napa",
  "mosel",
  "rioja",
  "other",
] as const;
export const WineRegion = z.enum(WINE_REGIONS);
export type WineRegion = z.infer<typeof WineRegion>;

/**
 * A wine identity: producer + cuvée + vintage + region. Two lots of the same
 * wine share a {@link WineKey} (see {@link wineKey}). Vintage is a 4-digit year;
 * `vintage: 0` is reserved for non-vintage (NV) cuvées such as some Champagnes.
 */
export const Wine = z
  .object({
    /** Stable id for this wine identity. */
    id: Id,
    /** Producer / château / domaine (e.g. "Château Lafite Rothschild"). */
    producer: z.string().trim().min(1, "producer must not be empty"),
    /** Cuvée or wine name; omit for a producer's flagship grand vin. */
    cuvee: z.string().trim().min(1).optional(),
    /** Vintage year, or 0 for non-vintage. */
    vintage: z
      .number()
      .int()
      .refine((v) => v === 0 || (v >= 1800 && v <= 2100), {
        message: "vintage must be 0 (NV) or a year in [1800, 2100]",
      }),
    /** Producing region. */
    region: WineRegion,
    /** Quote currency for this wine's market prices. */
    currency: CurrencyCode,
  })
  .strict();
export type Wine = z.infer<typeof Wine>;

/** A stable, human-readable key identifying a wine across lots. */
export function wineKey(wine: Pick<Wine, "producer" | "cuvee" | "vintage">): string {
  const v = wine.vintage === 0 ? "NV" : String(wine.vintage);
  const name = wine.cuvee ? `${wine.producer} ${wine.cuvee}` : wine.producer;
  return `${name} ${v}`;
}

/**
 * Provenance condition grades, from best to worst. Mirrors the language used in
 * fine-wine auction catalogues. The grade drives a multiplicative provenance
 * factor in {@link provenanceFactor} (see `provenance.ts`).
 */
export const CONDITION_GRADES = [
  "pristine",
  "excellent",
  "good",
  "fair",
  "poor",
] as const;
export const ConditionGrade = z.enum(CONDITION_GRADES);
export type ConditionGrade = z.infer<typeof ConditionGrade>;

/** Storage history: where/how the bottle has been kept since release. */
export const STORAGE_HISTORIES = [
  "in-bond", // professional bonded warehouse, temperature controlled — best
  "professional", // professional cellar, not bonded
  "private-cellar", // good private cellar
  "unknown", // no documented storage
] as const;
export const StorageHistory = z.enum(STORAGE_HISTORIES);
export type StorageHistory = z.infer<typeof StorageHistory>;

/**
 * Provenance evidence for a lot. Each field nudges the provenance factor and
 * the valuation confidence band:
 *
 *  - `condition` — bottle/label/fill condition grade.
 *  - `storage` — documented storage history.
 *  - `originalWoodenCase` (OWC) — bottles still in the producer's original case
 *    carry a premium and tighter confidence.
 *  - `purchasedOnRelease` — bought ex-château / on release (cleanest chain).
 *  - `documented` — a complete, documented ownership chain.
 */
export const Provenance = z
  .object({
    condition: ConditionGrade,
    storage: StorageHistory,
    originalWoodenCase: z.boolean().default(false),
    purchasedOnRelease: z.boolean().default(false),
    documented: z.boolean().default(false),
  })
  .strict();
export type Provenance = z.infer<typeof Provenance>;

/**
 * A holding of a specific wine: a quantity of bottles in one format with one
 * provenance profile, acquired on a date at a known cost per bottle.
 */
export const WineLot = z
  .object({
    /** Stable id for this lot. */
    id: Id,
    /** Id of the {@link Wine} this lot is of. */
    wineId: Id,
    /** Bottle format (defaults to a standard 750ml bottle). */
    format: BottleFormat.default("bottle"),
    /** Number of bottles in this lot (positive integer). */
    quantity: z.number().int().positive("quantity must be a positive integer"),
    /** Acquisition cost per bottle, exact decimal string. */
    costPerBottle: PricePerBottle,
    /** Acquisition date. */
    acquiredOn: IsoDate,
    /** Provenance evidence. */
    provenance: Provenance,
  })
  .strict();
export type WineLot = z.infer<typeof WineLot>;

/**
 * A dated market price observation for a wine, e.g. a Liv-ex Market Price, an
 * auction hammer, or a merchant list price. Used to build the price index in
 * `index-series.ts`. Price is per standard 750ml bottle in the wine's currency.
 */
export const PriceObservation = z
  .object({
    /** Observation date. */
    date: IsoDate,
    /** Per-750ml-bottle price, exact decimal string. */
    pricePerBottle: PricePerBottle,
    /** Source of the quote (informational). */
    source: z
      .enum(["livex", "auction", "merchant", "private"])
      .default("merchant"),
  })
  .strict();
export type PriceObservation = z.infer<typeof PriceObservation>;
