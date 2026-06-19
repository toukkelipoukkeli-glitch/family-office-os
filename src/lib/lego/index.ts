/**
 * LEGO secondary-market price-guide model: Zod schemas + a deterministic,
 * offline valuation engine for a read-only family office OS.
 *
 * Import the schemas ({@link LegoSet}, {@link Comparable}) to validate untrusted
 * input at boundaries, and {@link estimateSetValue} to turn a set + a list of
 * comparable sales into a {@link Valuation} with an explicit confidence.
 *
 * READ-ONLY product: nothing here lists, buys, or sells a set.
 */
export * from "./set";
export * from "./condition";
export * from "./comparable";
export * from "./stats";
export * from "./price-guide";
export * from "./fixtures";
