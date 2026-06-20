/**
 * m9-reporting — Board-grade reporting.
 *
 * Composes every family-office engine (net-worth & TWR, allocation vs. policy
 * via IPS, benchmark-relative performance, Brinson attribution, fees / TCO, and
 * private-markets PE metrics) into a single dated {@link BoardReport} object,
 * plus deterministic JSON / Markdown export. Pure, offline and READ-ONLY.
 */
export * from "./report";
export * from "./export";
