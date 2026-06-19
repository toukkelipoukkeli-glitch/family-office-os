/**
 * Net-worth-over-time dashboard derivations.
 *
 * Pure, deterministic roll-ups over a {@link import("@/lib/model").Portfolio}:
 * a consolidated net-worth history, per-asset-class drill-down series, and the
 * window's cumulative return. Offline and fixture-driven; nothing moves money.
 */
export * from "./networth";
export * from "./fixtures";
