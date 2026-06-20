/**
 * Deterministic, offline fixture book for the historical stress-test library.
 *
 * A single classified, correlated base book spanning the liquid and illiquid
 * asset classes a family office holds, sized so every historical scenario in the
 * library (2008 GFC, 2020 COVID, 2022 rate shock) bites somewhere. Everything is
 * a fixed literal — no live data, no wall clock — so the stress view model is
 * fully reproducible and snapshot-testable.
 *
 * READ-ONLY product: this only *describes* a hypothetical book for projection.
 */

import type { ClassifiedAsset, ScenarioBaseInput } from "@/lib/scenario/named";

/**
 * The classified base assets, in display order. `key` is the holding id and
 * `assetClass` is what scenarios target. Values are round, plausible
 * family-office sizes; returns/vols are annualized decimals.
 */
export const STRESS_ASSETS: readonly ClassifiedAsset[] = [
  { key: "global-equity", assetClass: "equity", value: 5_000_000, expectedReturn: 0.07, volatility: 0.17 },
  { key: "world-etf", assetClass: "etf", value: 2_200_000, expectedReturn: 0.065, volatility: 0.15 },
  { key: "core-bonds", assetClass: "bond", value: 3_000_000, expectedReturn: 0.03, volatility: 0.06 },
  { key: "cash-reserve", assetClass: "cash", value: 1_100_000, expectedReturn: 0.012, volatility: 0.0 },
  { key: "btc-eth", assetClass: "crypto", value: 600_000, expectedReturn: 0.12, volatility: 0.6 },
  { key: "growth-fund", assetClass: "pe", value: 2_000_000, expectedReturn: 0.1, volatility: 0.22 },
  { key: "north-forest", assetClass: "forest", value: 1_200_000, expectedReturn: 0.04, volatility: 0.1 },
  { key: "estate-vineyard", assetClass: "vineyard", value: 900_000, expectedReturn: 0.045, volatility: 0.18 },
  { key: "wine-cellar", assetClass: "wine", value: 450_000, expectedReturn: 0.05, volatility: 0.16 },
  { key: "art-collection", assetClass: "art", value: 700_000, expectedReturn: 0.04, volatility: 0.2 },
];

/**
 * Cross-asset correlation matrix in {@link STRESS_ASSETS} order. Symmetric,
 * unit-diagonal, positive semi-definite — a mild, realistic risk-on/risk-off
 * structure (equities/etf/crypto/pe move together, bonds hedge, real assets and
 * collectibles loosely coupled).
 */
export const STRESS_CORRELATION: readonly (readonly number[])[] = [
  //  eq    etf    bond   cash   crypto pe     forest vine   wine   art
  [1.0, 0.85, -0.2, 0.0, 0.45, 0.6, 0.1, 0.1, 0.15, 0.12],
  [0.85, 1.0, -0.15, 0.0, 0.4, 0.55, 0.1, 0.1, 0.12, 0.1],
  [-0.2, -0.15, 1.0, 0.05, -0.1, -0.1, 0.05, 0.05, 0.05, 0.05],
  [0.0, 0.0, 0.05, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
  [0.45, 0.4, -0.1, 0.0, 1.0, 0.3, 0.05, 0.05, 0.05, 0.05],
  [0.6, 0.55, -0.1, 0.0, 0.3, 1.0, 0.1, 0.1, 0.1, 0.1],
  [0.1, 0.1, 0.05, 0.0, 0.05, 0.1, 1.0, 0.45, 0.3, 0.2],
  [0.1, 0.1, 0.05, 0.0, 0.05, 0.1, 0.45, 1.0, 0.35, 0.25],
  [0.15, 0.12, 0.05, 0.0, 0.05, 0.1, 0.3, 0.35, 1.0, 0.4],
  [0.12, 0.1, 0.05, 0.0, 0.05, 0.1, 0.2, 0.25, 0.4, 1.0],
];

/**
 * The standing stress-test base input. A fixed seed and path/step count make
 * every run reproducible; the horizon is a 3-year recovery window so the
 * forward distribution captures both the day-zero hit and the recovery drift.
 */
export const STRESS_BASE_INPUT: ScenarioBaseInput = {
  assets: STRESS_ASSETS,
  correlation: STRESS_CORRELATION,
  paths: 2000,
  horizonYears: 3,
  steps: 12,
  seed: 20260620,
};
