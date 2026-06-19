/**
 * Liquidity / capital-call coverage analysis: sort a portfolio into liquidity
 * tiers, roll each up into a single base currency, and test whether a capital
 * call can be met out of liquid assets — without a forced fire-sale of illiquid
 * holdings. Reports coverage ratios, a funding waterfall, and any shortfall.
 *
 * Pure, deterministic, offline. READ-ONLY product: it analyzes hypothetical
 * liquidity; it never moves money, places trades, or liquidates anything.
 */
export * from "./liquidity";
export * from "./fixtures";
