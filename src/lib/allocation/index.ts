/**
 * Allocation + rebalancing drift.
 *
 * Pure, deterministic derivations over a {@link import("../model").Portfolio}:
 * break total value down by asset class and by currency (in a single base
 * currency via an explicit FX table), and measure drift of the current mix
 * against a target allocation.
 *
 * READ-ONLY product: reporting derivations only; nothing here moves money.
 */
export * from "./fx";
export * from "./holding-value";
export * from "./allocation";
