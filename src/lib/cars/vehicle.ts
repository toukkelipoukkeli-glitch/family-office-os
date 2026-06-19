import * as z from "zod";

import { CurrencyCode, Id, NonNegativeDecimalString } from "../model/primitives";

/**
 * Classic-car valuation inputs: Zod schemas + inferred types.
 *
 * This is a READ-ONLY product: these schemas model a vehicle and the
 * comparable-sales evidence used to value it. Nothing here moves money or
 * places a trade — a valuation is a reported estimate, never an offer.
 *
 * Shared primitives (CurrencyCode, Id, ...) live in `src/lib/model/primitives`
 * and are re-used here rather than duplicated.
 */

/**
 * Condition grade for a collector vehicle, following the widely used
 * Hagerty-style 1–4 scale. Lower number = better condition.
 *
 * - `concours` (1): show-quality / better-than-new restoration.
 * - `excellent` (2): well-restored or exceptional original, minor flaws.
 * - `good` (3): a sound, usable driver with visible wear.
 * - `fair` (4): a running project needing real work.
 */
export const CONDITION_GRADES = [
  "concours",
  "excellent",
  "good",
  "fair",
] as const;
export const ConditionGrade = z.enum(CONDITION_GRADES);
export type ConditionGrade = z.infer<typeof ConditionGrade>;

/**
 * A bounded multiplicative factor applied to a baseline value, stored as an
 * exact decimal string. Must be > 0; values above 1 add value, below 1 subtract.
 */
export const Factor = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/, "factor must be a non-negative decimal string")
  .refine((s) => Number(s) > 0, "factor must be greater than 0");
export type Factor = z.infer<typeof Factor>;

/**
 * A single comparable sale: an arm's-length transaction of a similar car,
 * used as evidence for the subject vehicle's value.
 *
 * `mileage` is optional (some auction records omit it). `conditionGrade` lets
 * the model normalize a comp to the subject's condition before averaging.
 */
export const ComparableSale = z
  .object({
    /** Stable id for this comp record. */
    id: Id,
    /** Sale price (hammer + premium), as a non-negative decimal string. */
    price: NonNegativeDecimalString,
    /** Currency of the sale price. */
    currency: CurrencyCode,
    /** ISO date of the sale (YYYY-MM-DD). */
    soldOn: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "soldOn must be an ISO date (YYYY-MM-DD)"),
    /** Condition grade of the comp at time of sale. */
    conditionGrade: ConditionGrade,
    /** Odometer reading in miles, if known. */
    mileage: z.number().int().nonnegative().optional(),
    /** Optional venue / source note (e.g. auction house). */
    venue: z.string().trim().max(200).optional(),
  })
  .strict();
export type ComparableSale = z.infer<typeof ComparableSale>;

/**
 * The subject vehicle being valued, plus the levers that move its value off a
 * baseline: condition, mileage, originality/provenance, and rarity.
 *
 * `baselineValue` is a make/model/year reference value (e.g. a #3 "good"
 * driver in average miles) that the model adjusts. `comps` are optional but,
 * when present, both refine the point estimate and tighten the confidence band.
 */
export const ClassicCar = z
  .object({
    /** Stable id for this vehicle. */
    id: Id,
    /** Manufacturer, e.g. "Porsche". */
    make: z.string().trim().min(1, "make must not be empty"),
    /** Model, e.g. "911 Carrera". */
    model: z.string().trim().min(1, "model must not be empty"),
    /** Model year (1885 = first automobile .. 2100 sanity bound). */
    year: z
      .number()
      .int()
      .min(1885, "year must be >= 1885")
      .max(2100, "year must be <= 2100"),
    /** Currency the baseline and valuation are expressed in. */
    currency: CurrencyCode,
    /**
     * Reference value for an average example (a #3 "good" driver at the
     * model's typical mileage), as a non-negative decimal string. The model
     * adjusts this for the subject's actual condition/mileage/provenance.
     */
    baselineValue: NonNegativeDecimalString,
    /**
     * Mileage the {@link baselineValue} assumes. Defaults to 0 when the
     * baseline is mileage-agnostic (no mileage adjustment applied).
     */
    baselineMileage: z.number().int().nonnegative().default(0),
    /** The subject's condition grade. */
    conditionGrade: ConditionGrade,
    /** The subject's odometer reading in miles. */
    mileage: z.number().int().nonnegative().default(0),
    /**
     * Originality / provenance premium as a multiplicative factor: 1.0 is
     * neutral, > 1 for matching-numbers, documented history, celebrity
     * ownership; < 1 for replaced drivetrains or modifications.
     */
    provenanceFactor: Factor.default("1"),
    /**
     * Rarity / desirability premium as a multiplicative factor: 1.0 neutral,
     * > 1 for low production or a sought-after spec.
     */
    rarityFactor: Factor.default("1"),
    /** Comparable sales evidence (optional). */
    comps: z.array(ComparableSale).default([]),
    /** Optional free-text note. */
    note: z.string().trim().max(2000).optional(),
  })
  .strict();
export type ClassicCar = z.infer<typeof ClassicCar>;
