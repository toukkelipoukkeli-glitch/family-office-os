/**
 * Deal / pipeline data model: Zod schemas + inferred types for tracking
 * prospective acquisitions in a read-only family office OS.
 *
 * Import the schemas to validate untrusted input at boundaries, and the
 * inferred types for everything downstream. Nothing here ever moves money,
 * places a trade, or contacts a counterparty — these schemas only describe and
 * validate the family's own deal-tracking state.
 */
export * from "./contact";
export * from "./pipeline-stage";
export * from "./interaction";
export * from "./deal";
export * from "./email";
