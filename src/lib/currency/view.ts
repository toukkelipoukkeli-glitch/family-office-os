/**
 * Currency **view model**: turns the seeded portfolio + a hedge policy into the
 * small, fully-deterministic, plain-`number` model the React page renders — a
 * per-currency exposure breakdown for the donut + table, a hedge-ratio scenario
 * with residual exposure and indicative annual cost, and headline KPIs.
 *
 * Keeping every derivation here (and out of the components) gives the visuals a
 * machine-checkable test surface. Pure, deterministic, offline, READ-ONLY.
 */

import { Decimal } from "decimal.js";

import {
  applyHedge,
  buildExposure,
  type ExposureInput,
  type HedgePolicy,
} from "./engine";
import { seededExposureInput } from "./fixtures";

/** One per-currency exposure row for the donut chart and table. */
export interface ExposureRow {
  readonly currency: string;
  readonly isBase: boolean;
  /** Value in base currency (plain number, rounded to whole base units). */
  readonly valueBase: number;
  /** Share of total portfolio value, as a fraction 0..1. */
  readonly weight: number;
  /** Number of positions in this currency. */
  readonly positionCount: number;
  /** Units of this currency per 1 unit of base (1 for base). */
  readonly rateToBase: number;
}

/** One per-currency hedge row for the hedge table. */
export interface HedgeRow {
  readonly currency: string;
  /** Gross foreign exposure in base currency. */
  readonly grossBase: number;
  /** Applied hedge ratio (0..1). */
  readonly ratio: number;
  /** Residual unhedged exposure after the hedge, in base currency. */
  readonly residualBase: number;
  /** Annualised hedge-cost rate (decimal fraction; can be negative). */
  readonly costRate: number;
  /** Indicative annual cost of this hedge, in base currency (signed). */
  readonly annualCost: number;
}

/** Headline KPIs for the currency page (plain numbers). */
export interface CurrencyKpis {
  /** Total portfolio value in base currency. */
  readonly totalBase: number;
  /** Total gross foreign exposure in base currency. */
  readonly foreignBase: number;
  /** Foreign exposure as a fraction of the portfolio (0..1). */
  readonly foreignShare: number;
  /** Residual unhedged foreign exposure after applying the hedge. */
  readonly residualBase: number;
  /** Residual unhedged share of the portfolio after the hedge (0..1). */
  readonly residualShare: number;
  /** Portfolio-level hedge ratio actually achieved (0..1). */
  readonly effectiveHedgeRatio: number;
  /** Total indicative annual cost of the hedge in base currency (signed). */
  readonly annualCost: number;
  /** Annual cost as a fraction of total portfolio value (signed). */
  readonly annualCostBps: number;
}

/** The full plain-data model the currency page renders. */
export interface CurrencyModel {
  readonly base: string;
  readonly hedgeRatio: number;
  readonly kpis: CurrencyKpis;
  /** Per-currency exposure rows, base first then foreign by value desc. */
  readonly exposures: readonly ExposureRow[];
  /** Per-currency hedge rows, largest gross exposure first. */
  readonly hedges: readonly HedgeRow[];
}

/** Round a {@link import("decimal.js").Decimal} to a whole number. */
function whole(d: Decimal): number {
  return Number(d.toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toFixed());
}

/** A fraction with full precision as a plain number. */
function frac(d: Decimal): number {
  return Number(d.toFixed());
}

/** Inputs to {@link buildCurrencyModel}; defaults to the seeded portfolio. */
export interface CurrencyModelInput {
  /** Exposure input; defaults to the seeded EUR portfolio. */
  readonly input?: ExposureInput;
  /** Hedge policy; defaults to a 50% uniform hedge. */
  readonly policy?: HedgePolicy;
}

/**
 * Build the plain-number view model the currency page renders from an exposure
 * input and a hedge policy. Defaults to the seeded portfolio with a 50% uniform
 * hedge so the page has deterministic content out of the box.
 */
export function buildCurrencyModel(
  opts: CurrencyModelInput = {},
): CurrencyModel {
  const input = opts.input ?? seededExposureInput;
  const policy = opts.policy ?? { defaultRatio: 0.5 };

  const model = buildExposure(input);
  const scenario = applyHedge(model, policy);

  const total = model.totalBase.amount;

  const exposures: ExposureRow[] = model.exposures.map((e) => ({
    currency: e.currency,
    isBase: e.isBase,
    valueBase: whole(e.valueBase.amount),
    weight: total.isZero() ? 0 : frac(e.valueBase.amount.div(total)),
    positionCount: e.positionCount,
    rateToBase: frac(e.rateToBase),
  }));

  const hedges: HedgeRow[] = scenario.currencies.map((c) => ({
    currency: c.currency,
    grossBase: whole(c.grossBase.amount),
    ratio: frac(c.ratio),
    residualBase: whole(c.residualBase.amount),
    costRate: frac(c.costRate),
    annualCost: whole(c.annualCost.amount),
  }));

  const foreign = scenario.grossForeignBase.amount;
  const residual = scenario.residualForeignBase.amount;
  const cost = scenario.totalAnnualCost.amount;

  const kpis: CurrencyKpis = {
    totalBase: whole(total),
    foreignBase: whole(foreign),
    foreignShare: total.isZero() ? 0 : frac(foreign.div(total)),
    residualBase: whole(residual),
    residualShare: total.isZero() ? 0 : frac(residual.div(total)),
    effectiveHedgeRatio: frac(scenario.effectiveHedgeRatio),
    annualCost: whole(cost),
    annualCostBps: total.isZero()
      ? 0
      : frac(cost.div(total).times(10000)),
  };

  return {
    base: model.base,
    hedgeRatio: policy.defaultRatio,
    kpis,
    exposures,
    hedges,
  };
}
