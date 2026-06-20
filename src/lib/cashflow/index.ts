/**
 * Multi-period cashflow & liquidity-runway forecast: project the cash balance
 * forward through a recurring schedule of commitments (outflow), distributions
 * (inflow) and operating expenses (outflow), and report the per-period balance
 * path plus the runway — how many periods the office stays cash-positive.
 *
 * Pure, deterministic, offline. READ-ONLY product: it projects cash, it never
 * moves it, places a trade, or funds a call.
 */
export * from "./cashflow";
export * from "./fixtures";
