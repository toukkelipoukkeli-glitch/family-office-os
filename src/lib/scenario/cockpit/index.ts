/**
 * Scenario-cockpit view model: turns the scenario engine (Monte Carlo + named
 * scenarios + liquidity) into a deterministic, plain-data model the cockpit page
 * renders as fan charts, a tornado chart, and a funding waterfall.
 *
 * Pure, deterministic, offline. READ-ONLY product: projections only.
 */
export * from "./cockpit";
export * from "./fixtures";
