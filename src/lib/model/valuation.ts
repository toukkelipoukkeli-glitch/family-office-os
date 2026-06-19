import * as z from "zod";

import { Id, IsoDateTime, NonNegativeMoneySchema } from "./primitives";

/**
 * How a valuation was obtained. Drives the default confidence of a
 * {@link Valuation}: a live market quote is high confidence; a manual estimate
 * or model output is lower.
 */
export const VALUATION_SOURCES = [
  "market", // live or recent public-market quote
  "appraisal", // professional appraisal of a collectible / illiquid asset
  "manual", // hand-entered estimate by the family / advisor
  "model", // model-derived estimate (comparable sales, DCF, etc.)
  "cost", // carried at cost / purchase price (fallback)
] as const;

export const ValuationSource = z.enum(VALUATION_SOURCES);
export type ValuationSource = z.infer<typeof ValuationSource>;

/**
 * A qualitative confidence band for a valuation. Kept coarse on purpose so the
 * UI can show a clear signal ("how much should I trust this number?").
 */
export const CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;
export const ConfidenceLevel = z.enum(CONFIDENCE_LEVELS);
export type ConfidenceLevel = z.infer<typeof ConfidenceLevel>;

/**
 * A point-in-time valuation of a holding (or unit of a holding) with an
 * explicit confidence. Every reported value in this product carries a
 * confidence so the family can tell a fresh market quote from a year-old
 * appraisal.
 *
 * - `value` is the {@link NonNegativeMoneySchema} amount of the valuation.
 * - `asOf` is when the valuation was effective.
 * - `confidence` is a coarse band; `confidenceScore` is an optional precise
 *   0..1 figure when a source can express one.
 */
export const Valuation = z
  .object({
    /** Stable id for this valuation record. */
    id: Id,
    /** The valued amount (non-negative). */
    value: NonNegativeMoneySchema,
    /** When the valuation was effective. */
    asOf: IsoDateTime,
    /** How the value was obtained. */
    source: ValuationSource,
    /** Coarse confidence band. */
    confidence: ConfidenceLevel,
    /** Optional precise confidence in the inclusive range [0, 1]. */
    confidenceScore: z.number().min(0).max(1).optional(),
    /** Optional free-text note (e.g. appraiser name, quote provider). */
    note: z.string().trim().max(2000).optional(),
  })
  .strict();
export type Valuation = z.infer<typeof Valuation>;

/** Default confidence band implied by a valuation source. */
export function defaultConfidenceForSource(
  source: ValuationSource,
): ConfidenceLevel {
  switch (source) {
    case "market":
      return "high";
    case "appraisal":
      return "medium";
    case "model":
    case "manual":
      return "low";
    case "cost":
      return "low";
  }
}
