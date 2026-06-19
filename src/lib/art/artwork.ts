import * as z from "zod";

import {
  CurrencyCode,
  Id,
  IsoDate,
  NonNegativeDecimalString,
} from "../model/primitives";

/**
 * Art data model: Zod schemas + inferred types for the read-only family
 * office OS.
 *
 * Shared primitives (CurrencyCode, Id, IsoDate, ...) live in
 * `src/lib/model/primitives` and are re-used here rather than duplicated.
 *
 * READ-ONLY product: these schemas model and report art holdings and
 * comparable sales for appraisal; nothing here buys, sells, or moves money.
 */

/** Medium / category of an artwork. Descriptive, reporting-oriented. */
export const ArtMedium = z.enum([
  "painting",
  "drawing",
  "print",
  "photograph",
  "sculpture",
  "mixed_media",
  "other",
]);
export type ArtMedium = z.infer<typeof ArtMedium>;

/**
 * Physical condition grade, best to worst. Drives the condition adjustment in
 * the appraisal model: poorer condition discounts value and *widens* the
 * confidence band, because condition-impaired works trade less predictably.
 */
export const ConditionGrade = z.enum([
  "mint",
  "excellent",
  "good",
  "fair",
  "poor",
]);
export type ConditionGrade = z.infer<typeof ConditionGrade>;

/**
 * Strength of provenance / attribution. Weaker provenance discounts value and
 * widens the band: a disputed attribution is worth less and far less certain.
 */
export const ProvenanceStrength = z.enum([
  "documented",
  "strong",
  "moderate",
  "weak",
  "disputed",
]);
export type ProvenanceStrength = z.infer<typeof ProvenanceStrength>;

/** Physical dimensions in centimetres (height x width, optional depth). */
export const Dimensions = z
  .object({
    /** Height in centimetres, > 0. */
    heightCm: z.number().finite().positive(),
    /** Width in centimetres, > 0. */
    widthCm: z.number().finite().positive(),
    /** Optional depth in centimetres (sculpture / 3-D works), > 0. */
    depthCm: z.number().finite().positive().optional(),
  })
  .strict();
export type Dimensions = z.infer<typeof Dimensions>;

/**
 * An artwork held in the family office. The unit of appraisal.
 *
 * `condition` and `provenance` default to the most favourable grades when
 * omitted, so a bare record is treated as a pristine, fully-documented work
 * (no adjustment) rather than silently penalised.
 */
export const Artwork = z
  .object({
    /** Stable id for the artwork. */
    id: Id,
    /** Title of the work. */
    title: z.string().trim().min(1, "title must not be empty"),
    /** Artist name (free text; attribution strength lives in `provenance`). */
    artist: z.string().trim().min(1, "artist must not be empty"),
    /** Medium / category. */
    medium: ArtMedium,
    /** Year the work was created (4-digit Gregorian year), optional. */
    year: z.number().int().min(0).max(9999).optional(),
    /** Physical dimensions, optional. */
    dimensions: Dimensions.optional(),
    /** Condition grade; defaults to `excellent`. */
    condition: ConditionGrade.default("excellent"),
    /** Provenance / attribution strength; defaults to `documented`. */
    provenance: ProvenanceStrength.default("documented"),
    /** Date the work was acquired, optional. */
    acquiredOn: IsoDate.optional(),
    /** Acquisition cost amount (exact decimal string), optional. */
    acquisitionCost: NonNegativeDecimalString.optional(),
    /** Currency the work is reported in (ISO-4217). */
    currency: CurrencyCode,
    /** Free-text note. */
    note: z.string().trim().max(2000).optional(),
  })
  .strict();
export type Artwork = z.infer<typeof Artwork>;

/**
 * A comparable sale: an arm's-length transaction of a similar work, used as
 * evidence for the appraisal. The model weights comps by similarity, recency,
 * and (optionally) sale quality.
 */
export const Comparable = z
  .object({
    /** Stable id for this comparable. */
    id: Id,
    /** Hammer / realised price (exact non-negative decimal string). */
    price: NonNegativeDecimalString,
    /** Currency of the price (must match the artwork being appraised). */
    currency: CurrencyCode,
    /** Date the sale settled (ISO date). Drives the recency weight. */
    soldOn: IsoDate,
    /**
     * Similarity to the subject work in [0, 1]: 1 is an essentially identical
     * comp, 0 is unrelated. Drives the similarity weight; defaults to 1.
     */
    similarity: z.number().finite().min(0).max(1).default(1),
    /** Optional venue / source label (e.g. auction house), free text. */
    venue: z.string().trim().max(200).optional(),
    /** Optional free-text note. */
    note: z.string().trim().max(2000).optional(),
  })
  .strict();
export type Comparable = z.infer<typeof Comparable>;
