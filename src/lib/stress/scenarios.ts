/**
 * Historical stress-test library.
 *
 * A *historical stress scenario* re-plays a real, named market dislocation —
 * the 2008 Global Financial Crisis, the 2020 COVID crash, the 2022 rate shock —
 * as a documented bundle of per-asset-class shocks, applied to a book through
 * the existing named-scenario engine in `../scenario/named`.
 *
 * The point of difference from the standing house-view catalog
 * (`NAMED_SCENARIOS`) is *provenance*: every shock here is anchored to the
 * actual peak-to-trough drawdown of a real episode, with a written **source**
 * and a **window** (start/end dates) so the parameters are auditable rather than
 * invented. A reviewer can check "−55% equities in the GFC" against the S&P 500
 * peak-to-trough (Oct 2007 → Mar 2009) and agree or argue with the calibration.
 *
 * A {@link HistoricalScenario} is a superset of the engine's {@link Scenario}:
 * it carries the same `id`/`name`/`description`/`shocks` (so it runs through
 * `applyScenario` / `runScenario` unchanged) plus historical metadata
 * (`period`, `window`, `peakToTrough`, `recoveryMonths`, `sources`). That keeps
 * the engine untouched while making the library self-documenting.
 *
 * Pure data + small pure helpers. Deterministic and offline. READ-ONLY product:
 * these scenarios project hypothetical outcomes for planning and reporting;
 * nothing here moves money or places trades.
 */

import type { Scenario } from "@/lib/scenario/named";

/** Thrown when a historical scenario is structurally invalid. */
export class StressError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StressError";
  }
}

/** A calendar window (inclusive) the episode is calibrated against. */
export interface StressWindow {
  /** ISO date the drawdown began (peak), e.g. `"2007-10-09"`. */
  readonly start: string;
  /** ISO date the drawdown bottomed (trough), e.g. `"2009-03-09"`. */
  readonly end: string;
}

/**
 * A named historical stress scenario: an engine {@link Scenario} plus the
 * provenance that justifies its shock parameters.
 */
export interface HistoricalScenario extends Scenario {
  /** Short period label shown in the UI, e.g. `"2008"`. */
  readonly period: string;
  /** The peak-to-trough window the calibration is drawn from. */
  readonly window: StressWindow;
  /**
   * Headline peak-to-trough drawdown of the broad equity market over `window`,
   * as a negative fraction (e.g. `-0.565` for −56.5%). Documentation only — the
   * per-class shocks in `shocks` are what the engine actually applies.
   */
  readonly peakToTrough: number;
  /** Approximate months from trough back to the prior peak (nominal). */
  readonly recoveryMonths: number;
  /** One-line, citable sources for the calibration. Non-empty. */
  readonly sources: readonly string[];
}

/**
 * **2008 Global Financial Crisis.** The deepest post-war equity drawdown: the
 * S&P 500 fell ~56.8% peak-to-trough (Oct 2007 → Mar 2009). A systemic credit
 * event — risk assets collapsed together, private marks lagged then caught up,
 * high-grade Treasuries rallied hard on flight-to-quality, and correlations
 * across risk assets converged toward one.
 */
export const GFC_2008: HistoricalScenario = {
  id: "gfc-2008",
  name: "2008 Global Financial Crisis",
  period: "2008",
  description:
    "The 2007–09 systemic credit crisis: global equities ~−55%, private equity marked down with a lag, crypto did not yet exist as a book asset, and high-grade Treasuries rallied on flight-to-quality.",
  window: { start: "2007-10-09", end: "2009-03-09" },
  peakToTrough: -0.568,
  recoveryMonths: 49,
  sources: [
    "S&P 500 peak-to-trough −56.8% (2007-10-09 1565.15 → 2009-03-09 676.53).",
    "Bloomberg US Agg / 10y Treasury total return positive over the window (flight-to-quality).",
    "Cambridge Associates US PE pooled returns: −20% to −25% over 2008–09 with a reporting lag.",
  ],
  shocks: [
    { kind: "reprice", targets: ["equity", "etf"], amount: -0.55 },
    { kind: "reprice", targets: ["pe"], amount: -0.24 },
    { kind: "reprice", targets: ["crypto"], amount: -0.6 },
    // Flight-to-quality: high-grade bonds rallied.
    { kind: "reprice", targets: ["bond"], amount: 0.06 },
    // Illiquid real assets sold off less but were not immune.
    { kind: "reprice", targets: ["vineyard", "forest"], amount: -0.18 },
    { kind: "reprice", targets: ["wine", "art"], amount: -0.22 },
    // The whole cone of risk widened dramatically.
    { kind: "vol", targets: ["equity", "etf", "crypto", "pe"], amount: 1.8 },
  ],
};

/**
 * **2020 COVID crash.** The fastest bear market in history: the S&P 500 fell
 * ~33.9% in 23 trading days (Feb 19 → Mar 23, 2020). A liquidity shock — even
 * Treasuries briefly sold off in the dash-for-cash before the Fed backstop —
 * with an unusually rapid recovery. Crypto (which existed by 2020) crashed
 * harder than equities on the same day.
 */
export const COVID_2020: HistoricalScenario = {
  id: "covid-2020",
  name: "2020 COVID crash",
  period: "2020",
  description:
    "The Feb–Mar 2020 pandemic crash: equities ~−34% in five weeks, crypto down harder, a brief dash-for-cash that hit even Treasuries, then a fast V-shaped recovery.",
  window: { start: "2020-02-19", end: "2020-03-23" },
  peakToTrough: -0.339,
  recoveryMonths: 5,
  sources: [
    "S&P 500 peak-to-trough −33.9% (2020-02-19 3386.15 → 2020-03-23 2237.40).",
    "BTC fell ~−50% on 2020-03-12 (\"Black Thursday\").",
    "10y Treasury yields whipsawed; the long bond briefly sold off in the mid-March dash-for-cash.",
  ],
  shocks: [
    { kind: "reprice", targets: ["equity", "etf"], amount: -0.34 },
    { kind: "reprice", targets: ["pe"], amount: -0.15 },
    { kind: "reprice", targets: ["crypto"], amount: -0.5 },
    // Dash-for-cash: even high-grade bonds dipped briefly.
    { kind: "reprice", targets: ["bond"], amount: -0.02 },
    { kind: "reprice", targets: ["wine", "art", "vineyard"], amount: -0.08 },
    { kind: "vol", targets: ["equity", "etf", "crypto", "pe"], amount: 2.0 },
  ],
};

/**
 * **2022 rate shock.** The fastest Fed tightening cycle in 40 years drove a
 * rare simultaneous selloff in stocks *and* bonds. The S&P 500 fell ~25.4%
 * peak-to-trough (Jan → Oct 2022), long-duration Treasuries had their worst
 * year on record, and crypto entered a deep bear market as the discount rate
 * jumped.
 */
export const RATE_SHOCK_2022: HistoricalScenario = {
  id: "rate-shock-2022",
  name: "2022 rate shock",
  period: "2022",
  description:
    "The 2022 inflation/rate shock: the fastest Fed hiking cycle in 40 years drove a rare joint selloff — equities ~−25%, long bonds down hard (no flight-to-quality), and crypto in a deep bear.",
  window: { start: "2022-01-03", end: "2022-10-12" },
  peakToTrough: -0.254,
  recoveryMonths: 16,
  sources: [
    "S&P 500 peak-to-trough −25.4% (2022-01-03 4796.56 → 2022-10-12 3577.03).",
    "Bloomberg US Agg −13% in 2022, its worst calendar year on record.",
    "BTC −64% in 2022 as real rates rose.",
  ],
  shocks: [
    { kind: "reprice", targets: ["equity", "etf"], amount: -0.25 },
    { kind: "reprice", targets: ["pe"], amount: -0.18 },
    { kind: "reprice", targets: ["crypto"], amount: -0.64 },
    // No flight-to-quality this time: bonds fell with stocks.
    { kind: "reprice", targets: ["bond"], amount: -0.13 },
    // Higher discount rate also pressured long-duration real assets.
    { kind: "reprice", targets: ["vineyard", "forest"], amount: -0.06 },
    { kind: "drift", targets: ["cash", "bond"], amount: 0.025 },
    { kind: "vol", targets: ["equity", "etf", "crypto", "bond"], amount: 1.4 },
  ],
};

/** Every historical stress scenario, most recent first (display order). */
export const HISTORICAL_SCENARIOS: readonly HistoricalScenario[] = [
  RATE_SHOCK_2022,
  COVID_2020,
  GFC_2008,
] as const;

/** Index of the library by scenario id, built once. */
const BY_ID: ReadonlyMap<string, HistoricalScenario> = new Map(
  HISTORICAL_SCENARIOS.map((s) => [s.id, s]),
);

/**
 * Look up a historical scenario by id. Throws {@link StressError} for an unknown
 * id (a typo'd scenario name should fail loudly, not silently no-op).
 */
export function getHistoricalScenario(id: string): HistoricalScenario {
  const scenario = BY_ID.get(id);
  if (!scenario) {
    const known = HISTORICAL_SCENARIOS.map((s) => s.id).join(", ");
    throw new StressError(`unknown historical scenario id: ${id} (known: ${known})`);
  }
  return scenario;
}

/**
 * Validate a historical scenario's provenance metadata (the engine validates the
 * shocks separately). Throws {@link StressError} on a malformed window, an
 * out-of-range drawdown, a negative recovery, or missing sources.
 */
export function validateHistoricalScenario(scenario: HistoricalScenario): void {
  if (!scenario.id) {
    throw new StressError("historical scenario must have a non-empty id");
  }
  const start = Date.parse(scenario.window.start);
  const end = Date.parse(scenario.window.end);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    throw new StressError(
      `${scenario.id}: window dates must be valid ISO dates, got ${scenario.window.start}..${scenario.window.end}`,
    );
  }
  if (end < start) {
    throw new StressError(
      `${scenario.id}: window end (${scenario.window.end}) is before start (${scenario.window.start})`,
    );
  }
  if (!(scenario.peakToTrough <= 0) || scenario.peakToTrough < -1) {
    throw new StressError(
      `${scenario.id}: peakToTrough must be in [-1, 0], got ${scenario.peakToTrough}`,
    );
  }
  if (!(scenario.recoveryMonths >= 0) || !Number.isFinite(scenario.recoveryMonths)) {
    throw new StressError(
      `${scenario.id}: recoveryMonths must be a non-negative number, got ${scenario.recoveryMonths}`,
    );
  }
  if (scenario.sources.length === 0) {
    throw new StressError(`${scenario.id}: at least one source is required`);
  }
}
