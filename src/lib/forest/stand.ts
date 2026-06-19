import * as z from "zod";

import { CurrencyCode, Id, IsoDate } from "../model/primitives";

/**
 * Forest / timber valuation inputs: Zod schemas + inferred types.
 *
 * This is a READ-ONLY product: these schemas model a forest stand, the timber
 * price history used to value its standing volume, and the seasonal
 * drought/weather record that modulates biological growth. Nothing here moves
 * money or places a trade — a forest valuation is a reported estimate, never an
 * offer to buy or sell timber.
 *
 * Shared primitives (CurrencyCode, Id, IsoDate, ...) live in
 * `src/lib/model/primitives` and are re-used here rather than duplicated.
 */

/**
 * Commercial timber species groups, kept coarse on purpose. Each maps to a
 * default growth shape and a default merchantable-fraction assumption in the
 * growth model. These are modeling buckets, not a botanical taxonomy.
 *
 * - `spruce`  — Norway/white spruce, fast-growing softwood pulp + sawlog.
 * - `pine`    — Scots/loblolly pine, softwood sawlog.
 * - `fir`     — Douglas/silver fir, slower softwood sawlog.
 * - `birch`   — birch, fast hardwood pulp.
 * - `oak`     — oak, slow high-value hardwood.
 * - `beech`   — beech, slow hardwood.
 */
export const SPECIES = [
  "spruce",
  "pine",
  "fir",
  "birch",
  "oak",
  "beech",
] as const;
export const Species = z.enum(SPECIES);
export type Species = z.infer<typeof Species>;

/**
 * Site productivity class (site index proxy), from `excellent` (rich, moist,
 * sheltered soils) to `poor` (thin, dry, exposed). A better site reaches a
 * higher asymptotic standing volume per hectare.
 */
export const SITE_CLASSES = ["excellent", "good", "average", "poor"] as const;
export const SiteClass = z.enum(SITE_CLASSES);
export type SiteClass = z.infer<typeof SiteClass>;

/**
 * A bounded multiplicative factor stored as an exact decimal string. Must be
 * > 0; values above 1 add value, below 1 subtract.
 */
export const Factor = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/, "factor must be a non-negative decimal string")
  .refine((s) => Number(s) > 0, "factor must be greater than 0");
export type Factor = z.infer<typeof Factor>;

/**
 * One season's growing-condition record for the stand. `droughtIndex` is a
 * normalized stress signal in the inclusive range [-1, 1]:
 *
 *  - `0`  — a normal year, no growth modulation;
 *  - `> 0` — drier/hotter than normal (drought stress), suppresses growth;
 *  - `< 0` — wetter/cooler than normal, a modest growth boost.
 *
 * This is intentionally decoupled from any live weather feed: callers compute
 * the index upstream (e.g. from Open-Meteo precipitation anomalies in
 * `src/lib/weather`) and pass the normalized result here, so the valuation
 * model stays deterministic and offline (AGENTS.md).
 */
export const GrowingSeason = z
  .object({
    /** Calendar year of the growing season. */
    year: z
      .number()
      .int()
      .min(1900, "year must be >= 1900")
      .max(2100, "year must be <= 2100"),
    /**
     * Normalized drought / growing-stress index in [-1, 1]. Positive = drier
     * than normal (stress). See the type doc above.
     */
    droughtIndex: z
      .number()
      .finite()
      .min(-1, "droughtIndex must be >= -1")
      .max(1, "droughtIndex must be <= 1"),
  })
  .strict();
export type GrowingSeason = z.infer<typeof GrowingSeason>;

/**
 * A dated timber price observation: the market price for one cubic metre (m³)
 * of standing/roadside merchantable timber of a given species.
 *
 * A series of these builds the timber price index (`price-index.ts`), whose
 * latest reference price and recent dispersion drive the valuation point and
 * its confidence band.
 */
export const TimberPriceObservation = z
  .object({
    /** ISO date of the price observation (YYYY-MM-DD). */
    date: IsoDate,
    /** Price per cubic metre, as a non-negative decimal string. */
    pricePerCubicMeter: z
      .string()
      .trim()
      .regex(/^\d+(\.\d+)?$/, "price must be a non-negative decimal string"),
    /** Currency of the price. */
    currency: CurrencyCode,
  })
  .strict();
export type TimberPriceObservation = z.infer<typeof TimberPriceObservation>;

/**
 * The subject forest stand being valued.
 *
 * A "stand" is a contiguous area of one dominant species and roughly even age.
 * The model grows its standing merchantable volume from `standAgeYears` using a
 * Chapman-Richards curve parameterized by `species` and `siteClass`, modulates
 * the most recent growth by the drought record, then multiplies the resulting
 * volume per hectare by `areaHectares` and the timber price index.
 */
export const ForestStand = z
  .object({
    /** Stable id for this stand. */
    id: Id,
    /** Human label, e.g. "North block — Norway spruce". */
    name: z.string().trim().min(1, "name must not be empty"),
    /** Dominant species group. */
    species: Species,
    /** Site productivity class. */
    siteClass: SiteClass,
    /** Stand area in hectares (> 0). */
    areaHectares: z.number().finite().positive("areaHectares must be > 0"),
    /** Current stand age in years (>= 0). */
    standAgeYears: z
      .number()
      .finite()
      .min(0, "standAgeYears must be >= 0")
      .max(300, "standAgeYears must be <= 300"),
    /** Currency the valuation is expressed in. */
    currency: CurrencyCode,
    /**
     * Optional management premium/discount as a multiplicative factor: 1.0
     * neutral, > 1 for good access/thinning history, < 1 for poor access or
     * pest damage. Applied to the final value.
     */
    managementFactor: Factor.default("1"),
    /**
     * Seasonal drought/weather record. Each entry's year should fall within the
     * stand's life; entries outside the recent-growth window are ignored by the
     * model. Optional — an empty record means "assume normal growing seasons".
     */
    seasons: z.array(GrowingSeason).default([]),
    /** Optional free-text note. */
    note: z.string().trim().max(2000).optional(),
  })
  .strict();
export type ForestStand = z.infer<typeof ForestStand>;
