/**
 * The standing catalog of named stress scenarios.
 *
 * These are the house-view stresses every family-office report runs against the
 * book: a rate shock, an FX move, a drought, and a broad market correction.
 * Each is a documented {@link Scenario} (id, name, description, rationale,
 * shocks) so the assumptions are auditable rather than buried magic numbers.
 *
 * The numbers are deliberately round, calibrated judgement calls — the kind of
 * "what if" a CIO actually asks — not precise forecasts. They are paired with a
 * {@link SCENARIO_RATIONALE} entry explaining *why* each asset class is shocked
 * the way it is, so the catalog can be challenged and tuned.
 *
 * Pure data + a tiny lookup helper. READ-ONLY product: nothing here moves money.
 */

import type { Scenario } from "./scenarios";
import { ScenarioError } from "./scenarios";

/**
 * **Rate shock (+200bps).** A sharp parallel rise in interest rates. Bonds
 * reprice down with duration; cash/short bonds earn more carry going forward;
 * rate-sensitive risk assets (equities, ETFs, private equity, crypto) take a
 * valuation hit as the discount rate jumps.
 */
export const RATE_SHOCK: Scenario = {
  id: "rate-shock",
  name: "Rate shock (+200bps)",
  description:
    "A sudden +200bps parallel rise in rates: bonds reprice down with duration, cash carry rises, and rate-sensitive risk assets de-rate.",
  shocks: [
    // Instantaneous repricing from the rate move.
    { kind: "reprice", targets: ["bond"], amount: -0.12 }, // ~6yr duration × 2%
    { kind: "reprice", targets: ["equity", "etf"], amount: -0.08 },
    { kind: "reprice", targets: ["pe"], amount: -0.06 },
    { kind: "reprice", targets: ["crypto"], amount: -0.1 },
    // Forward carry: cash and short bonds now yield more.
    { kind: "drift", targets: ["cash"], amount: 0.02 },
    { kind: "drift", targets: ["bond"], amount: 0.015 },
  ],
};

/**
 * **FX move (-15% home currency exposure).** A 15% depreciation of the home
 * currency relative to the assets quoted in foreign currency. Foreign-quoted
 * liquid assets (equities, ETFs, crypto) gain in home-currency terms; domestic
 * real assets and cash are roughly unaffected. Modeled as a reprice plus a
 * modest vol bump from the added currency risk.
 */
export const FX_MOVE: Scenario = {
  id: "fx-move",
  name: "FX move (home -15%)",
  description:
    "A 15% depreciation of the home currency: foreign-quoted liquid assets gain in home-currency terms, with a small volatility bump from currency risk.",
  shocks: [
    { kind: "reprice", targets: ["equity", "etf", "crypto"], amount: 0.15 },
    { kind: "vol", targets: ["equity", "etf", "crypto"], amount: 1.1 },
  ],
};

/**
 * **Drought.** A severe agricultural drought. Productive land and crop-linked
 * collectibles take the brunt: vineyards and forest land are written down and
 * grow more slowly; fine wine — whose value tracks vintages and the underlying
 * vineyard — is marked down too. Financial assets are untouched.
 */
export const DROUGHT: Scenario = {
  id: "drought",
  name: "Drought",
  description:
    "A severe drought writes down farmland and crop-linked collectibles (vineyards, forest, fine wine) and slows their growth; financial assets are unaffected.",
  shocks: [
    { kind: "reprice", targets: ["vineyard"], amount: -0.3 },
    { kind: "reprice", targets: ["forest"], amount: -0.15 },
    { kind: "reprice", targets: ["wine"], amount: -0.1 },
    { kind: "drift", targets: ["vineyard", "forest"], amount: -0.03 },
    { kind: "vol", targets: ["vineyard", "forest", "wine"], amount: 1.25 },
  ],
};

/**
 * **Market correction (-30% equities).** A broad risk-asset drawdown. Public
 * equities and ETFs fall ~30%, private equity less (smoothed marks), crypto
 * more (higher beta); high-grade bonds rally on flight-to-quality. Volatility
 * spikes across risk assets.
 */
export const MARKET_CORRECTION: Scenario = {
  id: "market-correction",
  name: "Market correction (-30% equities)",
  description:
    "A broad risk-asset drawdown: equities/ETFs ~-30%, private equity less, crypto more, bonds rally on flight-to-quality, and volatility spikes.",
  shocks: [
    { kind: "reprice", targets: ["equity", "etf"], amount: -0.3 },
    { kind: "reprice", targets: ["pe"], amount: -0.2 },
    { kind: "reprice", targets: ["crypto"], amount: -0.45 },
    { kind: "reprice", targets: ["bond"], amount: 0.05 }, // flight to quality
    { kind: "vol", targets: ["equity", "etf", "crypto", "pe"], amount: 1.5 },
  ],
};

/** Every named scenario in the standing catalog, in display order. */
export const NAMED_SCENARIOS: readonly Scenario[] = [
  RATE_SHOCK,
  FX_MOVE,
  DROUGHT,
  MARKET_CORRECTION,
] as const;

/**
 * Human-readable rationale for each named scenario, keyed by scenario id.
 * Exposed so the house view behind every stress is documented and auditable.
 */
export const SCENARIO_RATIONALE: Readonly<Record<string, string>> = {
  "rate-shock":
    "A +200bps parallel rate rise marks bonds down by roughly duration × Δy, lifts cash and short-bond carry going forward, and de-rates long-duration risk assets (equities, ETFs, private equity, crypto) as the discount rate jumps.",
  "fx-move":
    "A 15% home-currency depreciation lifts the home-currency value of foreign-quoted liquid assets (equities, ETFs, crypto) one-for-one with the move and adds a little volatility from the currency leg; domestic real assets and cash are left flat.",
  drought:
    "A severe drought hits productive land hardest — vineyards written down most, forest land less — and drags fine wine down with the vintage/vineyard link, while slowing farmland growth and widening its volatility. Purely financial assets are unaffected.",
  "market-correction":
    "A broad risk-off drawdown takes public equities and ETFs down ~30%, private equity less (marks are smoothed and lagged), and crypto more (higher beta), while high-grade bonds rally on flight-to-quality and volatility spikes across risk assets.",
};

/** Index of the catalog by scenario id, built once. */
const BY_ID: ReadonlyMap<string, Scenario> = new Map(
  NAMED_SCENARIOS.map((s) => [s.id, s]),
);

/**
 * Look up a named scenario by id. Throws {@link ScenarioError} for an unknown
 * id (a typo'd scenario name should fail loudly, not silently no-op).
 */
export function getScenario(id: string): Scenario {
  const scenario = BY_ID.get(id);
  if (!scenario) {
    const known = NAMED_SCENARIOS.map((s) => s.id).join(", ");
    throw new ScenarioError(`unknown scenario id: ${id} (known: ${known})`);
  }
  return scenario;
}
