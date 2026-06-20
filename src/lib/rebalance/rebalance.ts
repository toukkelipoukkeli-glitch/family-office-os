import { Decimal } from "decimal.js";

import { FxConverter, type FxRateTable } from "../allocation/fx";
import {
  allocationByAssetClass,
  holdingContributions,
  portfolioTotal,
  rebalancingDrift,
  type TargetWeights,
} from "../allocation";
import { assetClassLabel, type AssetClass } from "../model/asset-class";
import type { Holding } from "../model/holding";
import type { Lot } from "../model/lot";
import type { Portfolio } from "../model/portfolio";
import { Money } from "../money";
import {
  realizeGains,
  type Ledger,
  type LotMethod,
  type RealizedSummary,
} from "../taxlots";
import {
  estimateTax,
  type RateSchedule,
  type TaxEstimate,
} from "../taxestimate";

/**
 * m10-rebalance — tax-aware rebalancing *proposal* for the read-only family
 * office OS.
 *
 * Given a portfolio (whose holdings carry tax lots and market prices), a target
 * asset-class allocation (the strategic mix from the IPS), and a tax rate
 * schedule, this engine proposes the BUY / SELL trades that move the book back
 * toward its target — and, crucially, when it must *sell*, it picks the tax lots
 * that **minimize the realized gain** (HIFO: highest cost basis first), so the
 * proposal realizes as little tax as possible.
 *
 * The pipeline composes three existing engines:
 *
 *  1. **Drift** (`../allocation`): how far each asset class is from target, and
 *     the base-currency amount over/under.
 *  2. **Tax-lot selection** (`../taxlots`): each SELL is matched against the
 *     holding's open lots under a configurable {@link LotMethod} (default
 *     `hifo`) to realize the smallest gain; the per-lot slices and short- vs
 *     long-term split fall straight out of `realizeGains`.
 *  3. **Tax estimate** (`../taxestimate`): the proposal's aggregate realized
 *     short/long-term gains are fed into {@link estimateTax} to estimate the
 *     incremental tax the trades would trigger.
 *
 * The proposal also reports the **tax saved** versus naively selling the same
 * quantities under FIFO, making the tax-awareness visible and assertable.
 *
 * READ-ONLY product: this is a *proposal* a human reviews. It never executes a
 * trade, moves money, or files anything. All arithmetic is exact {@link Money} /
 * decimal.js — never floating-point currency (see AGENTS.md).
 */

/** Thrown when rebalance inputs are structurally invalid. */
export class RebalanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RebalanceError";
  }
}

/** The side of a proposed trade. */
export type TradeSide = "buy" | "sell";

/** A single proposed trade against one holding. */
export interface ProposedTrade {
  /** The holding to trade. */
  holdingId: string;
  /** Display name of the holding. */
  holdingName: string;
  /** Market symbol, when the holding has one. */
  symbol?: string;
  /** Asset class of the holding. */
  assetClass: AssetClass;
  /** Buy or sell. */
  side: TradeSide;
  /** Units to trade (exact decimal string, > 0). */
  quantity: string;
  /** Per-unit market price used (base currency). */
  price: Money;
  /** Trade notional = quantity × price (base currency, always > 0). */
  amount: Money;
  /**
   * For SELLs only: the realized gain the chosen lots would trigger (signed;
   * negative is a realized loss). `undefined` for BUYs.
   */
  realizedGain?: Money;
  /** For SELLs only: realized short-term gain portion. */
  shortTermGain?: Money;
  /** For SELLs only: realized long-term gain portion. */
  longTermGain?: Money;
  /**
   * For SELLs only: the realized summary from the tax-lot engine, exposing the
   * exact per-lot slices that were selected. `undefined` for BUYs.
   */
  realized?: RealizedSummary;
}

/** Per-asset-class drift, after the proposal is applied. */
export interface AssetClassPlan {
  assetClass: AssetClass;
  /** Display label, e.g. "Equities". */
  label: string;
  /** Current base-currency value before trading. */
  currentValue: Money;
  /** Current weight in [0, 1]. */
  currentWeight: Decimal;
  /** Normalized target weight in [0, 1]. */
  targetValue: Money;
  targetWeight: Decimal;
  /** Signed drift = current − target (positive = overweight). */
  drift: Decimal;
  /** Signed base-currency amount to trade: negative = sell, positive = buy. */
  tradeAmount: Money;
  /** Projected value after applying the proposal. */
  projectedValue: Money;
  /** Projected weight after applying the proposal. */
  projectedWeight: Decimal;
}

/** A full tax-aware rebalancing proposal. */
export interface RebalanceProposal {
  /** Base currency of the portfolio. */
  baseCurrency: string;
  /** Portfolio total the weights are measured against. */
  total: Money;
  /** The lot-selection method used for sells (default `hifo`). */
  method: LotMethod;
  /** The tolerance band (absolute weight) the proposal targets. */
  band: Decimal;
  /** Per-asset-class plan, sorted by descending absolute drift. */
  assetClasses: AssetClassPlan[];
  /** The proposed trades, sells first then buys, each sorted by size. */
  trades: ProposedTrade[];
  /** Total notional sold (base currency). */
  totalSold: Money;
  /** Total notional bought (base currency). */
  totalBought: Money;
  /** Aggregate realized gain across all sells (signed). */
  realizedGain: Money;
  /** Aggregate realized short-term gain across all sells (signed). */
  realizedShortTermGain: Money;
  /** Aggregate realized long-term gain across all sells (signed). */
  realizedLongTermGain: Money;
  /** Estimated incremental tax of the proposal (from {@link estimateTax}). */
  taxEstimate: TaxEstimate;
  /**
   * Tax saved versus selling the identical quantities under FIFO instead of the
   * chosen method. The chosen method (e.g. HIFO) minimizes the realized *gain*,
   * but the resulting *tax* depends on the schedule — a smaller long-term gain
   * can fall in a 0% bracket while a smaller short-term gain is taxed, so FIFO
   * can occasionally produce a lower tax bill. To keep the field a meaningful
   * "saving", it is clamped to ≥ 0 (never reports a negative saving). Zero when
   * `method === "fifo"`.
   */
  taxSavedVsFifo: Money;
  /**
   * Whether the projected post-trade allocation is within `band` of target for
   * every asset class.
   */
  reconciles: boolean;
}

/** Options controlling the proposal. */
export interface RebalanceOptions {
  /** Portfolio to rebalance. */
  portfolio: Portfolio;
  /** Target weights per asset class (normalized internally; need not sum to 1). */
  targets: TargetWeights<AssetClass>;
  /**
   * Per-symbol *and/or* per-holding-id current unit price, as a decimal string
   * in the holding's own currency. Required for any holding that must be sold.
   */
  prices: Record<string, string>;
  /** FX table (base must match the portfolio base currency). */
  fxTable: FxRateTable;
  /** Tax rate schedule for the incremental-tax estimate. */
  schedule: RateSchedule;
  /** Valuation date used to classify lot holding periods (YYYY-MM-DD). */
  asOf: string;
  /** Tax year for the estimate label. */
  year: number;
  /** Lot-selection method for sells. Default `hifo` (tax-minimizing). */
  method?: LotMethod;
  /**
   * Tolerance band (absolute weight). An asset class within `band` of its
   * target is left untouched. Default 0.05 (5%).
   */
  band?: Decimal | string | number;
}

function dec(v: Decimal | string | number): Decimal {
  return v instanceof Decimal ? v : new Decimal(v);
}

/**
 * Resolve a holding's current per-unit price (in its own currency) from the
 * supplied price map. Tries the holding id first, then its symbol.
 */
function priceFor(holding: Holding, prices: Record<string, string>): string | undefined {
  if (prices[holding.id] !== undefined) return prices[holding.id];
  if (holding.symbol && prices[holding.symbol] !== undefined) {
    return prices[holding.symbol];
  }
  return undefined;
}

/**
 * Total units held by a holding across its open lots. Holdings with no lots
 * (e.g. a cash account modelled as one valuation) have no unit quantity and are
 * not sellable lot-by-lot — they return `undefined`.
 */
function totalUnits(holding: Holding): Decimal | undefined {
  if (holding.lots.length === 0) return undefined;
  return holding.lots.reduce((sum, lot) => sum.plus(dec(lot.quantity)), new Decimal(0));
}

/**
 * Build a tax-lot {@link Ledger} for a single holding selling `units`: every
 * open lot becomes an acquisition, and the sale becomes one disposal priced at
 * `unitPrice`. The ledger currency is the holding's own currency.
 */
function sellLedger(
  holding: Holding,
  units: Decimal,
  unitPrice: Decimal,
): Ledger {
  const currency = holding.currency;
  const acquisitions = holding.lots.map((lot: Lot) => ({
    id: lot.id,
    symbol: holding.symbol ?? holding.id,
    date: lot.acquiredOn,
    quantity: dec(lot.quantity).toFixed(),
    cost: dec(lot.unitCost.amount).times(dec(lot.quantity)).toFixed(),
  }));
  return {
    currency,
    acquisitions,
    disposals: [
      {
        id: `${holding.id}-rebalance-sell`,
        symbol: holding.symbol ?? holding.id,
        date: "ASOF",
        quantity: units.toFixed(),
        proceeds: unitPrice.times(units).toFixed(),
      },
    ],
  };
}

/**
 * Realize the gain of selling `units` of `holding` at `unitPrice`, dating the
 * sale at `asOf` so holding periods classify correctly. Returns the realized
 * summary under `method`.
 */
function realizeSell(
  holding: Holding,
  units: Decimal,
  unitPrice: Decimal,
  asOf: string,
  method: LotMethod,
): RealizedSummary {
  const ledger = sellLedger(holding, units, unitPrice);
  // Stamp the disposal date with the valuation date so the engine classifies
  // short- vs long-term against `asOf`.
  ledger.disposals[0].date = asOf;
  return realizeGains(ledger, method);
}

/**
 * Build a tax-aware rebalancing proposal. Pure and deterministic: given the
 * same options it always returns the same exact-decimal proposal.
 *
 * The algorithm:
 *
 *  1. Roll the book up by asset class and compute drift against `targets`.
 *  2. For each *overweight* asset class (drift beyond `band`), sell down its
 *     holdings — largest-value holding first — until the class is on target,
 *     selecting lots under `method` (default `hifo`) to minimize realized gain.
 *  3. For each *underweight* asset class, propose a BUY of the shortfall (a buy
 *     has no tax consequence and no lot selection).
 *  4. Aggregate realized gains and estimate the incremental tax; also compute
 *     the tax that the same sells would realize under FIFO, to report savings.
 */
export function proposeRebalance(options: RebalanceOptions): RebalanceProposal {
  const {
    portfolio,
    targets,
    prices,
    fxTable,
    schedule,
    asOf,
    year,
  } = options;
  const method = options.method ?? "hifo";
  const band = dec(options.band ?? "0.05");
  // A tolerance band must be a finite weight in [0, 1]; a negative or >1 band
  // makes drift/reconciliation meaningless. Reject it up front.
  if (!band.isFinite() || band.isNegative() || band.greaterThan(1)) {
    throw new RebalanceError("band must be a finite weight in [0, 1]");
  }

  const fx = FxConverter.fromTable(fxTable);
  const baseCurrency = portfolio.baseCurrency.trim().toUpperCase();
  if (fx.base !== baseCurrency) {
    throw new RebalanceError(
      `fxTable base (${fx.base}) must match portfolio base currency (${portfolio.baseCurrency})`,
    );
  }

  const total = portfolioTotal(portfolio, fx);
  if (!total.isPositive()) {
    throw new RebalanceError("portfolio total must be positive to rebalance");
  }

  // --- 1. Drift by asset class -------------------------------------------
  const breakdown = allocationByAssetClass(portfolio, fxTable);
  const drift = rebalancingDrift(breakdown, targets, band);

  // Index current value per asset class for projecting post-trade weights.
  const currentByClass = new Map<AssetClass, Money>();
  for (const slice of breakdown.slices) {
    currentByClass.set(slice.key, slice.value);
  }

  // Holdings grouped by asset class, each with its base-currency value, sorted
  // by descending value so we sell the largest position first.
  const contributions = holdingContributions(portfolio, fx);
  const holdingsByClass = new Map<
    AssetClass,
    { holding: Holding; value: Money }[]
  >();
  for (const { holding, value } of contributions) {
    if (!value) continue;
    const list = holdingsByClass.get(holding.assetClass) ?? [];
    list.push({ holding, value });
    holdingsByClass.set(holding.assetClass, list);
  }
  for (const list of holdingsByClass.values()) {
    list.sort((a, b) => b.value.amount.comparedTo(a.value.amount));
  }

  // --- 2 & 3. Trades ------------------------------------------------------
  const trades: ProposedTrade[] = [];
  // Track the signed base-currency trade amount per asset class for projection.
  const tradeAmountByClass = new Map<AssetClass, Money>();

  // Pass 1 — execute SELLs for every overweight class, accumulating the actual
  // funded proceeds. A holding that cannot be priced or lot-sold is skipped, so
  // the proceeds raised may fall short of the drift (e.g. an overweight class
  // made entirely of a cash buffer).
  let fundedProceeds = Money.zero(baseCurrency);
  // The underweight classes (and their base-currency shortfall) to fund in pass 2.
  const buys: { ac: AssetClass; need: Money }[] = [];

  for (const slice of drift.slices) {
    const ac = slice.key;
    // Only act on classes drifted beyond the band.
    if (slice.drift.abs().lessThanOrEqualTo(band)) {
      tradeAmountByClass.set(ac, Money.zero(baseCurrency));
      continue;
    }

    if (slice.drift.isPositive()) {
      // Overweight: SELL `driftAmount` of base value from this class.
      let remaining = slice.driftAmount; // positive Money
      const list = holdingsByClass.get(ac) ?? [];
      let soldBase = Money.zero(baseCurrency);
      for (const { holding, value } of list) {
        if (!remaining.isPositive()) break;
        const units = totalUnits(holding);
        const rawPrice = priceFor(holding, prices);
        // A holding we cannot price or that has no unit lots can't be sold
        // lot-by-lot; skip it (e.g. a cash buffer). The shortfall simply stays.
        if (units === undefined || rawPrice === undefined) continue;
        const ownPrice = dec(rawPrice);
        if (!ownPrice.isPositive()) continue;

        // How much *base* value to take from this holding: the smaller of its
        // value and the remaining sell amount.
        const takeBase = Money.of(
          Decimal.min(remaining.amount, value.amount),
          baseCurrency,
        );
        // Convert the base sell amount into a unit quantity via the holding's
        // own-currency price. base→own: divide by the holding's value ratio.
        const ownValue = fx.toBase(Money.of(ownPrice, holding.currency));
        const basePerUnit = ownValue.amount; // base value of one unit
        if (!basePerUnit.isPositive()) continue;
        let sellUnits = takeBase.amount.div(basePerUnit);
        // Never sell more than we hold.
        if (sellUnits.greaterThan(units)) sellUnits = units;
        if (!sellUnits.isPositive()) continue;

        const realized = realizeSell(holding, sellUnits, ownPrice, asOf, method);
        const tradeBase = Money.of(basePerUnit.times(sellUnits), baseCurrency);
        soldBase = soldBase.plus(tradeBase);
        remaining = Money.of(
          Decimal.max(new Decimal(0), remaining.amount.minus(tradeBase.amount)),
          baseCurrency,
        );

        trades.push({
          holdingId: holding.id,
          holdingName: holding.name,
          symbol: holding.symbol,
          assetClass: ac,
          side: "sell",
          quantity: sellUnits.toFixed(),
          price: Money.of(basePerUnit, baseCurrency),
          amount: tradeBase,
          realizedGain: fx.toBase(realized.gain),
          shortTermGain: fx.toBase(realized.shortTermGain),
          longTermGain: fx.toBase(realized.longTermGain),
          realized,
        });
      }
      fundedProceeds = fundedProceeds.plus(soldBase);
      tradeAmountByClass.set(ac, soldBase.times(-1));
    } else {
      // Underweight: defer to pass 2 so buys can be sized to funded proceeds.
      buys.push({ ac, need: slice.driftAmount });
      // Default to zero; pass 2 fills in the funded amount.
      tradeAmountByClass.set(ac, Money.zero(baseCurrency));
    }
  }

  // Pass 2 — emit BUYs, scaled so the *total* bought never exceeds the proceeds
  // actually raised by the sells (the book is self-funding: sells fund buys). If
  // every sell executed in full this scale is 1 and buys equal their drift; if
  // some sells were skipped the buys shrink proportionally so the projection
  // stays honest and `reconciles` reflects real funding.
  const totalNeed = buys.reduce(
    (sum, b) => sum.plus(b.need),
    Money.zero(baseCurrency),
  );
  const buyScale = totalNeed.amount.isZero()
    ? new Decimal(0)
    : Decimal.min(new Decimal(1), fundedProceeds.amount.div(totalNeed.amount));
  for (const { ac, need } of buys) {
    const buyBase = Money.of(need.amount.times(buyScale), baseCurrency);
    tradeAmountByClass.set(ac, buyBase);
    if (!buyBase.isPositive()) continue;
    // A buy has no realized gain and no lot selection; it is modelled as a
    // single notional trade so the projection reconciles.
    trades.push({
      holdingId: `${ac}-buy`,
      holdingName: `${assetClassLabel(ac)} (target buy)`,
      assetClass: ac,
      side: "buy",
      quantity: "1",
      price: buyBase,
      amount: buyBase,
    });
  }

  // --- 4. Aggregate realized gains + tax ---------------------------------
  let realizedGain = Money.zero(baseCurrency);
  let realizedShortTermGain = Money.zero(baseCurrency);
  let realizedLongTermGain = Money.zero(baseCurrency);
  let totalSold = Money.zero(baseCurrency);
  let totalBought = Money.zero(baseCurrency);

  // Tax under FIFO for the *same* sells, to quantify the savings.
  let fifoShort = Money.zero(baseCurrency);
  let fifoLong = Money.zero(baseCurrency);

  for (const t of trades) {
    if (t.side === "sell") {
      realizedGain = realizedGain.plus(t.realizedGain ?? Money.zero(baseCurrency));
      realizedShortTermGain = realizedShortTermGain.plus(
        t.shortTermGain ?? Money.zero(baseCurrency),
      );
      realizedLongTermGain = realizedLongTermGain.plus(
        t.longTermGain ?? Money.zero(baseCurrency),
      );
      totalSold = totalSold.plus(t.amount);
    } else {
      totalBought = totalBought.plus(t.amount);
    }
  }

  // Recompute the same sells under FIFO for the savings comparison.
  for (const t of trades) {
    if (t.side !== "sell") continue;
    const holding = portfolio.holdings.find((h) => h.id === t.holdingId);
    if (!holding) continue;
    const rawPrice = priceFor(holding, prices);
    if (rawPrice === undefined) continue;
    const fifo = realizeSell(holding, dec(t.quantity), dec(rawPrice), asOf, "fifo");
    fifoShort = fifoShort.plus(fx.toBase(fifo.shortTermGain));
    fifoLong = fifoLong.plus(fx.toBase(fifo.longTermGain));
  }

  const taxEstimate = estimateTax(
    {
      currency: baseCurrency,
      year,
      realized: {
        shortTermGain: realizedShortTermGain,
        longTermGain: realizedLongTermGain,
      },
    },
    schedule,
  );

  const fifoTax = estimateTax(
    {
      currency: baseCurrency,
      year,
      realized: { shortTermGain: fifoShort, longTermGain: fifoLong },
    },
    schedule,
  );
  const rawSaving = fifoTax.totalTax.minus(taxEstimate.totalTax);
  const taxSavedVsFifo = rawSaving.isPositive() ? rawSaving : Money.zero(baseCurrency);

  // --- Projected post-trade allocation + reconciliation ------------------
  const assetClasses: AssetClassPlan[] = drift.slices.map((slice) => {
    const ac = slice.key;
    const currentValue = currentByClass.get(ac) ?? Money.zero(baseCurrency);
    const tradeAmount = tradeAmountByClass.get(ac) ?? Money.zero(baseCurrency);
    const projectedValue = Money.of(
      currentValue.amount.plus(tradeAmount.amount),
      baseCurrency,
    );
    return {
      assetClass: ac,
      label: assetClassLabel(ac),
      currentValue,
      currentWeight: slice.currentWeight,
      targetValue: Money.of(slice.targetWeight.times(total.amount), baseCurrency),
      targetWeight: slice.targetWeight,
      drift: slice.drift,
      tradeAmount,
      projectedValue,
      // Projected weight is against the *unchanged* total (sells fund buys, so
      // the book size is conserved in the idealized proposal).
      projectedWeight: total.amount.isZero()
        ? new Decimal(0)
        : projectedValue.amount.div(total.amount),
    };
  });

  const reconciles = assetClasses.every((plan) =>
    plan.projectedWeight.minus(plan.targetWeight).abs().lessThanOrEqualTo(band),
  );

  // Sort trades: sells first (by descending size), then buys (by descending
  // size). Within ties, by holding id for stability.
  trades.sort((a, b) => {
    if (a.side !== b.side) return a.side === "sell" ? -1 : 1;
    const cmp = b.amount.amount.comparedTo(a.amount.amount);
    if (cmp !== 0) return cmp;
    return a.holdingId < b.holdingId ? -1 : a.holdingId > b.holdingId ? 1 : 0;
  });

  return {
    baseCurrency,
    total,
    method,
    band,
    assetClasses,
    trades,
    totalSold,
    totalBought,
    realizedGain,
    realizedShortTermGain,
    realizedLongTermGain,
    taxEstimate,
    taxSavedVsFifo,
    reconciles,
  };
}
