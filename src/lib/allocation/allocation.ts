import { Decimal } from "decimal.js";

import { Money, sumMoney } from "../money";
import type { AssetClass } from "../model/asset-class";
import type { Holding } from "../model/holding";
import type { Portfolio } from "../model/portfolio";
import { FxConverter, type FxRateTable } from "./fx";
import { holdingValue } from "./holding-value";

/**
 * Allocation roll-ups for a portfolio: break the total value down by asset
 * class and by currency, and measure how far the current mix has drifted from
 * a target allocation.
 *
 * Everything is computed in the portfolio's base currency using an explicit,
 * pre-resolved {@link FxRateTable} so the math is deterministic and offline.
 *
 * READ-ONLY product: these are reporting derivations; nothing here moves money
 * or proposes a trade order. "Drift" is a diagnostic, not an instruction.
 */

/** A single slice of an allocation breakdown. */
export interface AllocationSlice<K extends string = string> {
  /** The group key (an {@link AssetClass} or a currency code). */
  key: K;
  /** The summed value of holdings in this group, in the base currency. */
  value: Money;
  /**
   * This slice's share of the portfolio total, in the inclusive range [0, 1].
   * Exact decimal; `0` when the portfolio total is zero.
   */
  weight: Decimal;
}

/** A full breakdown: every slice plus the base-currency total. */
export interface AllocationBreakdown<K extends string = string> {
  /** Slices, sorted by descending value (ties broken by key for stability). */
  slices: AllocationSlice<K>[];
  /** The portfolio total in the base currency. */
  total: Money;
  /** Base currency code the breakdown is expressed in. */
  baseCurrency: string;
}

/**
 * Source value behind a single holding once converted to the base currency.
 * `value` is `undefined` for a holding with no valuation (it contributes
 * nothing to the totals but is reported here so callers can surface gaps).
 */
export interface HoldingContribution {
  holding: Holding;
  /** Converted base-currency value, or `undefined` when unvaluable. */
  value: Money | undefined;
}

/**
 * Resolve every holding's base-currency value. Holdings without a valuation
 * are returned with `value: undefined`.
 */
export function holdingContributions(
  portfolio: Portfolio,
  fx: FxConverter,
): HoldingContribution[] {
  if (fx.base !== portfolio.baseCurrency) {
    throw new Error(
      `FX converter base ${fx.base} does not match portfolio base ${portfolio.baseCurrency}`,
    );
  }
  return portfolio.holdings.map((holding) => {
    const own = holdingValue(holding);
    return { holding, value: own ? fx.toBase(own) : undefined };
  });
}

/** Sum every valued holding into the portfolio total (base currency). */
export function portfolioTotal(
  portfolio: Portfolio,
  fx: FxConverter,
): Money {
  const valued = holdingContributions(portfolio, fx)
    .map((c) => c.value)
    .filter((v): v is Money => v !== undefined);
  return sumMoney(valued, portfolio.baseCurrency);
}

/** Build a sorted breakdown from grouped totals. Internal helper. */
function buildBreakdown<K extends string>(
  groups: Map<K, Money>,
  total: Money,
  baseCurrency: string,
): AllocationBreakdown<K> {
  const totalAmount = total.amount;
  const slices: AllocationSlice<K>[] = [];
  for (const [key, value] of groups) {
    const weight = totalAmount.isZero()
      ? new Decimal(0)
      : value.amount.div(totalAmount);
    slices.push({ key, value, weight });
  }
  slices.sort((a, b) => {
    const cmp = b.value.amount.comparedTo(a.value.amount);
    if (cmp !== 0) return cmp;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
  return { slices, total, baseCurrency };
}

/**
 * Break a portfolio's value down by {@link AssetClass}, expressed in the base
 * currency. Asset classes with no valued holdings are omitted.
 */
export function allocationByAssetClass(
  portfolio: Portfolio,
  fxTable: FxRateTable,
): AllocationBreakdown<AssetClass> {
  const fx = FxConverter.fromTable(fxTable);
  const groups = new Map<AssetClass, Money>();
  for (const { holding, value } of holdingContributions(portfolio, fx)) {
    if (!value) continue;
    const prev = groups.get(holding.assetClass);
    groups.set(holding.assetClass, prev ? prev.plus(value) : value);
  }
  const total = sumMoney([...groups.values()], portfolio.baseCurrency);
  return buildBreakdown(groups, total, fx.base);
}

/**
 * Break a portfolio's value down by the **holding's own currency** (the
 * currency it is reported in, before conversion), with each slice's value
 * expressed in the base currency. This shows true currency exposure:
 * e.g. how much of the book is denominated in EUR regardless of the base.
 */
export function allocationByCurrency(
  portfolio: Portfolio,
  fxTable: FxRateTable,
): AllocationBreakdown<string> {
  const fx = FxConverter.fromTable(fxTable);
  const groups = new Map<string, Money>();
  for (const { holding, value } of holdingContributions(portfolio, fx)) {
    if (!value) continue;
    const code = holding.currency.trim().toUpperCase();
    const prev = groups.get(code);
    groups.set(code, prev ? prev.plus(value) : value);
  }
  const total = sumMoney([...groups.values()], portfolio.baseCurrency);
  return buildBreakdown(groups, total, fx.base);
}

/**
 * A target allocation: desired weights per group key. Weights are exact
 * decimals; they need not sum to exactly 1 (they are normalized by their sum
 * when drift is computed), but must be non-negative and sum to a positive
 * value.
 */
export type TargetWeights<K extends string = string> = Partial<
  Record<K, Decimal | string | number>
>;

/** Drift of a single group: current vs target weight. */
export interface DriftSlice<K extends string = string> {
  key: K;
  /** Current share of the portfolio in [0, 1]. */
  currentWeight: Decimal;
  /** Normalized target share in [0, 1]. */
  targetWeight: Decimal;
  /** `currentWeight - targetWeight` (signed; positive = overweight). */
  drift: Decimal;
  /** Absolute base-currency amount to move to reach target (always >= 0). */
  driftAmount: Money;
}

/** Full rebalancing-drift report against a target allocation. */
export interface DriftReport<K extends string = string> {
  /** Per-group drift, sorted by descending absolute drift. */
  slices: DriftSlice<K>[];
  /**
   * Sum of the positive drifts — the fraction of the portfolio that is
   * overweight, i.e. how much would need to move to be on target. In [0, 1].
   */
  totalAbsoluteDrift: Decimal;
  /** Whether every group is within `band` of its target. */
  withinBand: boolean;
  /** The tolerance band used for {@link withinBand} (absolute weight). */
  band: Decimal;
  /** Portfolio total the amounts are scaled against. */
  total: Money;
  baseCurrency: string;
}

function toDecimal(v: Decimal | string | number): Decimal {
  const d = v instanceof Decimal ? v : new Decimal(v);
  if (!d.isFinite() || d.isNegative()) {
    throw new Error(`target weight must be a finite, non-negative number: ${String(v)}`);
  }
  return d;
}

/**
 * Compute rebalancing drift of a breakdown against a target allocation.
 *
 * For every key in either the current breakdown *or* the target set, compare
 * the current weight to the (normalized) target weight. `drift` is
 * `current - target`; a positive drift means the group is overweight. The
 * `driftAmount` is the absolute base-currency value that is over/under target.
 *
 * @param breakdown a current {@link AllocationBreakdown}
 * @param targets desired weights per key (normalized internally)
 * @param band optional tolerance (absolute weight, default 0.05 = 5%) used to
 *   set {@link DriftReport.withinBand}
 */
export function rebalancingDrift<K extends string>(
  breakdown: AllocationBreakdown<K>,
  targets: TargetWeights<K>,
  band: Decimal | string | number = "0.05",
): DriftReport<K> {
  const targetEntries = Object.entries(targets) as [
    K,
    Decimal | string | number | undefined,
  ][];
  const targetDecimals = new Map<K, Decimal>();
  let targetSum = new Decimal(0);
  for (const [key, raw] of targetEntries) {
    if (raw === undefined) continue;
    const d = toDecimal(raw);
    targetDecimals.set(key, d);
    targetSum = targetSum.plus(d);
  }
  if (targetSum.lessThanOrEqualTo(0)) {
    throw new Error("target weights must sum to a positive value");
  }

  const bandDec = toDecimal(band);
  const currentByKey = new Map<K, AllocationSlice<K>>();
  for (const slice of breakdown.slices) {
    currentByKey.set(slice.key, slice);
  }

  const keys = new Set<K>([...currentByKey.keys(), ...targetDecimals.keys()]);
  const total = breakdown.total;

  const slices: DriftSlice<K>[] = [];
  let totalAbsoluteDrift = new Decimal(0);
  let withinBand = true;

  for (const key of keys) {
    const current = currentByKey.get(key)?.weight ?? new Decimal(0);
    const rawTarget = targetDecimals.get(key) ?? new Decimal(0);
    const target = rawTarget.div(targetSum);
    const drift = current.minus(target);
    const driftAmount = Money.of(
      drift.abs().times(total.amount),
      total.currency,
    );
    if (drift.greaterThan(0)) {
      totalAbsoluteDrift = totalAbsoluteDrift.plus(drift);
    }
    if (drift.abs().greaterThan(bandDec)) {
      withinBand = false;
    }
    slices.push({
      key,
      currentWeight: current,
      targetWeight: target,
      drift,
      driftAmount,
    });
  }

  slices.sort((a, b) => {
    const cmp = b.drift.abs().comparedTo(a.drift.abs());
    if (cmp !== 0) return cmp;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });

  return {
    slices,
    totalAbsoluteDrift,
    withinBand,
    band: bandDec,
    total,
    baseCurrency: breakdown.baseCurrency,
  };
}
