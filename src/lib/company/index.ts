/**
 * Company / ownership data model: Zod schemas + inferred types for the
 * read-only family office OS. Import schemas to validate untrusted input at
 * boundaries, and the inferred types downstream.
 *
 * Shared primitives (CurrencyCode, Id, IsoDate, ...) live in
 * `src/lib/model/primitives` and are re-used here rather than duplicated.
 */
export * from "./person";
export * from "./ownership-stake";
export * from "./company";
export * from "./ownership-graph";
export * from "./ownership-layout";
