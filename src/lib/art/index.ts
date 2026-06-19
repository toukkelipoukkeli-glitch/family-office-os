/**
 * Art valuation module for the read-only family office OS.
 *
 *  - {@link Artwork} / {@link Comparable} — Zod schemas for art holdings and
 *    comparable sales.
 *  - {@link appraise} — comparable-sales appraisal model returning a point
 *    estimate and an honest {@link ConfidenceBand}.
 *
 * READ-ONLY product: this models and reports art value; it never transacts.
 */
export * from "./artwork";
export * from "./appraisal";
