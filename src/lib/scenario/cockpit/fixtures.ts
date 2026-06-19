/**
 * Deterministic, offline fixture inputs for the scenario cockpit.
 *
 * A single classified, correlated base book that spans the liquid and illiquid
 * asset classes a family office actually holds, sized so every named scenario in
 * the catalog (rate shock, FX move, drought, market correction) bites somewhere.
 * Everything is a fixed literal — no live data, no wall clock — so the cockpit
 * view model is fully reproducible and snapshot-testable.
 *
 * READ-ONLY product: this only *describes* a hypothetical book for projection.
 */

import type { ClassifiedAsset, ScenarioBaseInput } from "@/lib/scenario/named";

/**
 * The classified base assets, in display order. `key` is the holding id and
 * `assetClass` is what scenarios target. Values are round, plausible family-
 * office sizes; returns/vols are annualized decimals.
 */
export const COCKPIT_ASSETS: readonly ClassifiedAsset[] = [
  { key: "global-equity", assetClass: "equity", value: 4_200_000, expectedReturn: 0.07, volatility: 0.17 },
  { key: "core-bonds", assetClass: "bond", value: 2_600_000, expectedReturn: 0.03, volatility: 0.06 },
  { key: "world-etf", assetClass: "etf", value: 1_800_000, expectedReturn: 0.065, volatility: 0.15 },
  { key: "cash-reserve", assetClass: "cash", value: 900_000, expectedReturn: 0.012, volatility: 0.0 },
  { key: "btc-eth", assetClass: "crypto", value: 700_000, expectedReturn: 0.12, volatility: 0.6 },
  { key: "growth-fund", assetClass: "pe", value: 1_500_000, expectedReturn: 0.1, volatility: 0.22 },
  { key: "north-forest", assetClass: "forest", value: 1_200_000, expectedReturn: 0.04, volatility: 0.1 },
  { key: "estate-vineyard", assetClass: "vineyard", value: 950_000, expectedReturn: 0.045, volatility: 0.18 },
  { key: "wine-cellar", assetClass: "wine", value: 480_000, expectedReturn: 0.05, volatility: 0.16 },
];

/**
 * Cross-asset correlation matrix in {@link COCKPIT_ASSETS} order. Symmetric,
 * unit-diagonal, positive semi-definite (a mild, realistic risk-on/risk-off
 * structure: equities/etf/crypto/pe move together, bonds hedge, real assets are
 * loosely coupled).
 */
export const COCKPIT_CORRELATION: readonly (readonly number[])[] = [
  //  eq    bond   etf    cash   crypto pe     forest vine   wine
  [1.0, -0.2, 0.85, 0.0, 0.45, 0.6, 0.1, 0.1, 0.15],
  [-0.2, 1.0, -0.15, 0.05, -0.1, -0.1, 0.05, 0.05, 0.05],
  [0.85, -0.15, 1.0, 0.0, 0.4, 0.55, 0.1, 0.1, 0.12],
  [0.0, 0.05, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0],
  [0.45, -0.1, 0.4, 0.0, 1.0, 0.3, 0.05, 0.05, 0.05],
  [0.6, -0.1, 0.55, 0.0, 0.3, 1.0, 0.1, 0.1, 0.1],
  [0.1, 0.05, 0.1, 0.0, 0.05, 0.1, 1.0, 0.45, 0.3],
  [0.1, 0.05, 0.1, 0.0, 0.05, 0.1, 0.45, 1.0, 0.35],
  [0.15, 0.05, 0.12, 0.0, 0.05, 0.1, 0.3, 0.35, 1.0],
];

/**
 * The standing scenario-cockpit base input. A fixed seed and path/step count
 * make every cockpit run reproducible; the horizon is a 5-year planning window.
 */
export const COCKPIT_BASE_INPUT: ScenarioBaseInput = {
  assets: COCKPIT_ASSETS,
  correlation: COCKPIT_CORRELATION,
  paths: 2000,
  horizonYears: 5,
  steps: 20,
  seed: 20260619,
};
