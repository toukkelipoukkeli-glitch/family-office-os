import { Decimal } from "decimal.js";

import { Money } from "../money";
import { CurrencyCode } from "../model/primitives";
import { RateTable } from "../fx/rates";

/**
 * m10-currency — currency exposure & hedging engine.
 *
 * Given a multi-currency portfolio (each position valued in its own local
 * currency) and a base/reporting currency, this engine:
 *
 *  - rolls positions up by currency and converts each bucket into the base
 *    currency with exact {@link Decimal} arithmetic (via {@link RateTable});
 *  - measures FX *exposure* — the portfolio's economic sensitivity to each
 *    foreign currency, as a share of total portfolio value (the base currency
 *    itself carries no FX risk);
 *  - models *hedge-ratio* scenarios: applying a hedge ratio h ∈ [0,1] to a
 *    currency neutralises that fraction of the at-risk notional, leaving a
 *    residual unhedged exposure;
 *  - computes an *indicative cost of hedging* from per-currency annualised
 *    hedge-cost rates (forward points / carry), applied to the hedged notional.
 *
 * Everything is pure, deterministic and offline. READ-ONLY: this reports FX
 * exposure and the indicative cost of a hedge — it never places an FX forward,
 * moves money, or trades.
 */

/** A single portfolio position, valued in its own local currency. */
export interface Position {
  /** Stable identifier for the holding. */
  readonly id: string;
  /** Human-readable label, e.g. "US large-cap equity". */
  readonly label: string;
  /** Asset class / sleeve, used for grouping in the view. */
  readonly assetClass: string;
  /** The local currency this position is denominated/valued in. */
  readonly currency: string;
  /** Market value of the position, in its local {@link currency}. */
  readonly value: Money;
}

/**
 * Per-currency hedging assumptions. The {@link annualCostRate} is the
 * indicative all-in annualised cost of hedging one unit of base-currency
 * notional of this currency (forward points + roll), expressed as a decimal
 * fraction (e.g. `0.012` = 1.2%/yr). Positive means the hedge costs carry;
 * a negative rate means the hedge *earns* carry (positive interest-rate
 * differential in the hedger's favour).
 */
export interface HedgeAssumption {
  readonly currency: string;
  readonly annualCostRate: Decimal;
}

/** Inputs to {@link buildExposure}. */
export interface ExposureInput {
  /** Reporting / base currency every exposure is expressed in. */
  readonly base: string;
  /** Reference FX rates anchored to (or convertible to) the base currency. */
  readonly rates: RateTable;
  /** The portfolio positions. */
  readonly positions: readonly Position[];
  /** Per-currency hedge-cost assumptions (base currency may be omitted). */
  readonly hedgeAssumptions: readonly HedgeAssumption[];
}

/** Rolled-up exposure to a single currency, in base-currency terms. */
export interface CurrencyExposure {
  /** The currency this bucket represents. */
  readonly currency: string;
  /** Whether this is the base currency (no FX risk) or a foreign currency. */
  readonly isBase: boolean;
  /** Total value of positions in this currency, in base currency. */
  readonly valueBase: Money;
  /** Number of positions contributing to this bucket. */
  readonly positionCount: number;
  /**
   * Cross rate used: units of this currency per 1 unit of base (1 for base).
   * Surfaced so the page can show the rate that drives the conversion.
   */
  readonly rateToBase: Decimal;
}

/** The full computed exposure for a portfolio. */
export interface ExposureModel {
  readonly base: string;
  /** Total portfolio value in base currency. */
  readonly totalBase: Money;
  /**
   * Per-currency buckets, base first then foreign currencies in descending
   * order of base-currency value.
   */
  readonly exposures: readonly CurrencyExposure[];
  /** Hedge-cost rate by currency (decimal fraction per year). */
  readonly hedgeRates: ReadonlyMap<string, Decimal>;
}

function assertNonEmpty(positions: readonly Position[]): void {
  if (positions.length === 0) {
    throw new Error("buildExposure requires at least one position");
  }
}

/**
 * Roll a portfolio up into per-currency base-valued buckets.
 *
 * Each position is converted to the base currency through the supplied
 * {@link RateTable}. The base currency always appears as a bucket (even with
 * zero value) so the page can show the unhedged-vs-domestic split.
 */
export function buildExposure(input: ExposureInput): ExposureModel {
  const base = CurrencyCode.parse(input.base);
  assertNonEmpty(input.positions);

  // Sum raw base-converted value per currency, exactly.
  const byCurrency = new Map<
    string,
    { value: Money; count: number }
  >();

  for (const pos of input.positions) {
    const cur = CurrencyCode.parse(pos.currency);
    if (pos.value.currency !== cur) {
      throw new Error(
        `Position ${pos.id} value currency ${pos.value.currency} does not match its currency ${cur}`,
      );
    }
    const inBase = input.rates.convert(pos.value, base);
    const existing = byCurrency.get(cur);
    if (existing) {
      byCurrency.set(cur, {
        value: existing.value.plus(inBase),
        count: existing.count + 1,
      });
    } else {
      byCurrency.set(cur, { value: inBase, count: 1 });
    }
  }

  // Ensure the base bucket exists even if no position is held in base.
  if (!byCurrency.has(base)) {
    byCurrency.set(base, { value: Money.zero(base), count: 0 });
  }

  const hedgeRates = new Map<string, Decimal>();
  for (const h of input.hedgeAssumptions) {
    hedgeRates.set(CurrencyCode.parse(h.currency), h.annualCostRate);
  }

  let total = Money.zero(base);
  for (const { value } of byCurrency.values()) {
    total = total.plus(value);
  }

  const exposures: CurrencyExposure[] = [];
  for (const [cur, { value, count }] of byCurrency) {
    exposures.push({
      currency: cur,
      isBase: cur === base,
      valueBase: value,
      positionCount: count,
      rateToBase: cur === base ? new Decimal(1) : input.rates.rateFor(cur),
    });
  }

  // Base first, then foreign currencies by descending base value.
  exposures.sort((a, b) => {
    if (a.isBase !== b.isBase) return a.isBase ? -1 : 1;
    return b.valueBase.amount.comparedTo(a.valueBase.amount);
  });

  return {
    base,
    totalBase: total,
    exposures,
    hedgeRates,
  };
}

/**
 * A hedge policy: a uniform hedge ratio applied to every foreign currency,
 * optionally overridden per currency. Ratios are clamped to [0, 1].
 */
export interface HedgePolicy {
  /** Hedge ratio applied to currencies without an explicit override (0..1). */
  readonly defaultRatio: number;
  /** Per-currency hedge-ratio overrides (0..1). */
  readonly overrides?: Readonly<Record<string, number>>;
}

function clampRatio(r: number): Decimal {
  if (!Number.isFinite(r)) {
    throw new Error(`Hedge ratio must be finite, got ${r}`);
  }
  const d = new Decimal(r);
  if (d.lessThan(0)) return new Decimal(0);
  if (d.greaterThan(1)) return new Decimal(1);
  return d;
}

/** The hedge outcome for a single foreign currency under a policy. */
export interface CurrencyHedge {
  readonly currency: string;
  /** Gross foreign exposure in base currency (the at-risk notional pre-hedge). */
  readonly grossBase: Money;
  /** Applied hedge ratio (0..1). */
  readonly ratio: Decimal;
  /** Notional neutralised by the hedge, in base currency. */
  readonly hedgedBase: Money;
  /** Residual unhedged exposure left after the hedge, in base currency. */
  readonly residualBase: Money;
  /** Annualised hedge-cost rate used (decimal fraction). */
  readonly costRate: Decimal;
  /** Indicative annual cost of this hedge, in base currency (signed). */
  readonly annualCost: Money;
}

/** The full hedging scenario result for a portfolio + policy. */
export interface HedgeScenario {
  readonly base: string;
  /** Total portfolio value in base currency. */
  readonly totalBase: Money;
  /** Per foreign currency hedge breakdown, largest gross exposure first. */
  readonly currencies: readonly CurrencyHedge[];
  /** Total gross foreign exposure (sum of |foreign| in base). */
  readonly grossForeignBase: Money;
  /** Total hedged notional in base currency. */
  readonly hedgedForeignBase: Money;
  /** Total residual unhedged foreign exposure in base currency. */
  readonly residualForeignBase: Money;
  /** Total indicative annual cost of the hedge, in base currency (signed). */
  readonly totalAnnualCost: Money;
  /**
   * Portfolio-level hedge ratio actually achieved =
   * hedgedForeignBase / grossForeignBase (0 when there is no foreign exposure).
   */
  readonly effectiveHedgeRatio: Decimal;
}

/**
 * Apply a {@link HedgePolicy} to an {@link ExposureModel} and compute, per
 * foreign currency, the hedged / residual notional and the indicative annual
 * cost (hedged notional × annualised cost rate).
 *
 * READ-ONLY: this is an indicative projection of what hedging *would* cost; it
 * does not enter into any contract.
 */
export function applyHedge(
  model: ExposureModel,
  policy: HedgePolicy,
): HedgeScenario {
  const base = model.base;
  const overrides = policy.overrides ?? {};

  const currencies: CurrencyHedge[] = [];
  let grossForeign = Money.zero(base);
  let hedgedForeign = Money.zero(base);
  let residualForeign = Money.zero(base);
  let totalCost = Money.zero(base);

  for (const exp of model.exposures) {
    if (exp.isBase) continue;
    const gross = exp.valueBase;
    const rawRatio = Object.prototype.hasOwnProperty.call(
      overrides,
      exp.currency,
    )
      ? overrides[exp.currency]
      : policy.defaultRatio;
    const ratio = clampRatio(rawRatio);

    const hedged = gross.times(ratio);
    const residual = gross.minus(hedged);
    const costRate = model.hedgeRates.get(exp.currency) ?? new Decimal(0);
    const annualCost = hedged.times(costRate);

    currencies.push({
      currency: exp.currency,
      grossBase: gross,
      ratio,
      hedgedBase: hedged,
      residualBase: residual,
      costRate,
      annualCost,
    });

    grossForeign = grossForeign.plus(gross.abs());
    hedgedForeign = hedgedForeign.plus(hedged.abs());
    residualForeign = residualForeign.plus(residual.abs());
    totalCost = totalCost.plus(annualCost);
  }

  currencies.sort((a, b) =>
    b.grossBase.amount.abs().comparedTo(a.grossBase.amount.abs()),
  );

  const effectiveHedgeRatio = grossForeign.amount.isZero()
    ? new Decimal(0)
    : hedgedForeign.amount.div(grossForeign.amount);

  return {
    base,
    totalBase: model.totalBase,
    currencies,
    grossForeignBase: grossForeign,
    hedgedForeignBase: hedgedForeign,
    residualForeignBase: residualForeign,
    totalAnnualCost: totalCost,
    effectiveHedgeRatio,
  };
}
