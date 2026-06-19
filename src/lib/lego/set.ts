import * as z from "zod";

import {
  CurrencyCode,
  Id,
  IsoDate,
  NonNegativeDecimalString,
} from "../model/primitives";

/**
 * LEGO set reference data for the secondary-market price-guide model.
 *
 * A {@link LegoSet} is the catalog identity of a retired or current set — its
 * official set number, name, theme, release year, original retail price and
 * piece count. It carries no valuation itself; values come from the price
 * guide ({@link estimateSetValue}) applied to secondary-market comparables.
 *
 * READ-ONLY product: this models a collectible for reporting; it never buys,
 * sells, or lists a set.
 */

/**
 * A LEGO set number as printed on the box (e.g. "10256" for the Taj Mahal).
 * Modern sets are 4–7 digits; some legacy/promo sets carry a short suffix
 * (e.g. "75192-1"). Kept permissive but bounded.
 */
export const SetNumber = z
  .string()
  .trim()
  .regex(/^\d{3,7}(-\d{1,2})?$/, "must be a LEGO set number (e.g. 10256 or 75192-1)");
export type SetNumber = z.infer<typeof SetNumber>;

/** A 4-digit Gregorian release year, bounded to the plausible LEGO era. */
export const ReleaseYear = z
  .number()
  .int()
  .min(1949, "LEGO bricks date from 1949")
  .max(2100, "release year out of range");
export type ReleaseYear = z.infer<typeof ReleaseYear>;

export const LegoSet = z
  .object({
    /** Stable id for this set record. */
    id: Id,
    /** Official set number printed on the box. */
    setNumber: SetNumber,
    /** Display name (e.g. "Millennium Falcon"). */
    name: z.string().trim().min(1, "set name must not be empty"),
    /** Theme/series (e.g. "Star Wars", "Creator Expert", "Icons"). */
    theme: z.string().trim().min(1, "theme must not be empty"),
    /** Year the set was first released. */
    year: ReleaseYear,
    /** Number of pieces, when known (used for piece-density sanity only). */
    pieceCount: z.number().int().positive().optional(),
    /** Minifigure count, when known. */
    minifigCount: z.number().int().nonnegative().optional(),
    /** Original recommended retail price (MSRP) at launch. */
    retailPrice: NonNegativeDecimalString,
    /** Currency of {@link retailPrice} and of all comparables for this set. */
    currency: CurrencyCode,
    /** Date the set retired from official sale, when known. */
    retiredOn: IsoDate.optional(),
    /** Optional free-text tags for grouping/filtering. */
    tags: z.array(z.string().trim().min(1)).default([]),
  })
  .strict();
export type LegoSet = z.infer<typeof LegoSet>;
