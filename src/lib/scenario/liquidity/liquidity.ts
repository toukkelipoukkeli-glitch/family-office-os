/**
 * Liquidity / capital-call coverage analysis.
 *
 * A family office routinely faces **capital calls** — a private-equity fund
 * draws down committed capital, a tax bill comes due, a property closing needs
 * funding. The question this module answers is the one that actually keeps a
 * CFO up at night:
 *
 *   > Can we cover this call out of *liquid* assets, without being forced to
 *   > sell the forest, the art, or the vineyard at a fire-sale price?
 *
 * To answer it we sort every holding into a {@link LiquidityTier} — how quickly
 * it could be turned into spendable cash — roll each tier up into a single base
 * currency via an explicit {@link FxConverter}, and then "pay down" the call
 * tier by tier (cash first, then near-cash, then marketable securities, and only
 * as a last resort the illiquid book). The result reports:
 *
 *  - how much liquidity is available at each tier and cumulatively,
 *  - the coverage ratio (liquid assets ÷ call size),
 *  - whether the call is covered without touching illiquids,
 *  - the funding **waterfall**: exactly which tiers are tapped and by how much,
 *  - any residual shortfall if even selling everything is not enough.
 *
 * Forced sales are not free: each tier carries a configurable **haircut** (a
 * liquidation discount), so a holding worth 100 in a fire sale might only
 * realize 70 of usable proceeds. Net (post-haircut) proceeds are what actually
 * pay the call; the gross value is reported alongside for context.
 *
 * Pure, deterministic, offline. READ-ONLY product: this *analyzes* whether a
 * hypothetical call could be met; it never moves money, places a trade, or
 * liquidates anything.
 */

import { FxConverter, type FxRateTable, holdingValue } from "@/lib/allocation";
import { Money, sumMoney } from "@/lib/money";
import type { AssetClass } from "@/lib/model/asset-class";
import type { Portfolio } from "@/lib/model/portfolio";
import { Decimal } from "decimal.js";

/** Thrown when liquidity-analysis inputs are structurally invalid. */
export class LiquidityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LiquidityError";
  }
}

/**
 * Liquidity tiers, ordered most-liquid first. A capital call is funded by
 * draining tiers in this order, so the index in {@link LIQUIDITY_TIERS} is also
 * the funding priority (0 = tapped first).
 *
 *  - `cash`      — bank balances; spendable immediately.
 *  - `near-cash` — bonds and money-market-like instruments; settle in days.
 *  - `marketable`— listed equities, ETFs, liquid crypto; sellable in a day or
 *                  two but with real price risk.
 *  - `illiquid`  — appraisal-valued collectibles, real assets, PE/LP interests;
 *                  sale takes months and realizes a fire-sale discount.
 */
export const LIQUIDITY_TIERS = [
  "cash",
  "near-cash",
  "marketable",
  "illiquid",
] as const;

export type LiquidityTier = (typeof LIQUIDITY_TIERS)[number];

/** The funding priority of a tier (0 = drained first). */
export function tierPriority(tier: LiquidityTier): number {
  return LIQUIDITY_TIERS.indexOf(tier);
}

/** Human-readable labels for each {@link LiquidityTier}. */
export const LIQUIDITY_TIER_LABELS: Record<LiquidityTier, string> = {
  cash: "Cash",
  "near-cash": "Near-cash",
  marketable: "Marketable securities",
  illiquid: "Illiquid / collectible",
};

/**
 * Map every {@link AssetClass} to a {@link LiquidityTier}. This is the model's
 * opinion about how quickly each class can be turned into spendable cash, and is
 * the single source of truth for the coverage analysis.
 */
export const ASSET_CLASS_LIQUIDITY: Record<AssetClass, LiquidityTier> = {
  cash: "cash",
  bond: "near-cash",
  equity: "marketable",
  etf: "marketable",
  crypto: "marketable",
  forest: "illiquid",
  wine: "illiquid",
  art: "illiquid",
  lego: "illiquid",
  car: "illiquid",
  vineyard: "illiquid",
  pe: "illiquid",
  watch: "illiquid",
};

/** The liquidity tier a holding belongs to, via its asset class. */
export function liquidityTierFor(assetClass: AssetClass): LiquidityTier {
  return ASSET_CLASS_LIQUIDITY[assetClass];
}

/** True when the tier is considered "liquid enough" to fund a call without a forced illiquid sale. */
export function isLiquidTier(tier: LiquidityTier): boolean {
  return tier !== "illiquid";
}

/**
 * Liquidation haircut per tier: the fraction of gross value **lost** when the
 * asset is sold to fund a call. `0` means full value is realized; `0.3` means
 * only 70% of the gross value becomes usable proceeds. Cash never takes a
 * haircut; illiquids take the steepest fire-sale discount.
 *
 * These are exact decimals (strings) per the repo precision rule — never floats.
 */
export type TierHaircuts = Record<LiquidityTier, Decimal>;

/** Default, deliberately conservative liquidation haircuts. */
export const DEFAULT_HAIRCUTS: Readonly<Record<LiquidityTier, string>> = {
  cash: "0",
  "near-cash": "0.01",
  marketable: "0.03",
  illiquid: "0.25",
};

function resolveHaircuts(
  overrides?: Partial<Record<LiquidityTier, Decimal | string | number>>,
): TierHaircuts {
  const out = {} as TierHaircuts;
  for (const tier of LIQUIDITY_TIERS) {
    const raw = overrides?.[tier];
    let dec: Decimal;
    if (raw === undefined) {
      dec = new Decimal(DEFAULT_HAIRCUTS[tier]);
    } else if (typeof raw === "number") {
      // Forbid float haircuts: keep currency-affecting math exact.
      throw new LiquidityError(
        `haircut for ${tier} must be a decimal string or Decimal, not a number`,
      );
    } else {
      try {
        dec = new Decimal(raw);
      } catch {
        throw new LiquidityError(`invalid haircut for ${tier}: ${JSON.stringify(raw)}`);
      }
    }
    if (!dec.isFinite() || dec.isNegative() || dec.greaterThan(1)) {
      throw new LiquidityError(
        `haircut for ${tier} must be in [0, 1], got ${dec.toFixed()}`,
      );
    }
    out[tier] = dec;
  }
  return out;
}

/** One tier's rolled-up liquidity, in the base currency. */
export interface TierLiquidity {
  tier: LiquidityTier;
  /** Number of valued holdings in this tier. */
  holdingCount: number;
  /** Gross base-currency value of the tier (before any haircut). */
  gross: Money;
  /** Haircut applied to a forced sale of this tier, in [0, 1]. */
  haircut: Decimal;
  /** Net realizable proceeds after the haircut (`gross * (1 - haircut)`). */
  net: Money;
}

/** One step of the funding waterfall: how much a tier contributes to the call. */
export interface WaterfallStep {
  tier: LiquidityTier;
  /** Net proceeds drawn from this tier to fund the call (base currency, >= 0). */
  used: Money;
  /** Net proceeds still available in this tier after the draw (base currency). */
  remaining: Money;
  /** Whether this tier is an illiquid one that had to be tapped. */
  forcedIlliquidSale: boolean;
}

/** Inputs to a capital-call coverage analysis. */
export interface CapitalCallInput {
  /** The portfolio whose liquidity is being assessed. */
  portfolio: Portfolio;
  /** FX rates to roll every holding into the portfolio's base currency. */
  fxTable: FxRateTable;
  /** The capital call to cover. Must be in the portfolio's base currency. */
  call: Money;
  /**
   * Optional per-tier liquidation haircut overrides (exact decimals/strings in
   * `[0, 1]`). Unspecified tiers fall back to {@link DEFAULT_HAIRCUTS}.
   */
  haircuts?: Partial<Record<LiquidityTier, Decimal | string>>;
}

/** Full result of a capital-call coverage analysis. */
export interface CapitalCallCoverage {
  /** Base currency the whole analysis is expressed in. */
  baseCurrency: string;
  /** The capital call being covered. */
  call: Money;
  /** Per-tier liquidity, ordered most-liquid first. */
  tiers: TierLiquidity[];
  /**
   * Net liquidity available **without** a forced illiquid sale — the sum of net
   * proceeds across the cash / near-cash / marketable tiers.
   */
  liquidAvailable: Money;
  /** Net liquidity available from the illiquid book alone (post-haircut). */
  illiquidAvailable: Money;
  /** Total net liquidity across every tier (`liquidAvailable + illiquidAvailable`). */
  totalAvailable: Money;
  /**
   * Coverage ratio = `liquidAvailable / call`. `>= 1` means the call is fully
   * covered by liquid assets. `null` when the call is zero (ratio undefined).
   */
  liquidCoverageRatio: Decimal | null;
  /** Coverage ratio using *all* assets (`totalAvailable / call`). `null` when the call is zero. */
  totalCoverageRatio: Decimal | null;
  /** True when liquid assets alone cover the call (no forced illiquid sale needed). */
  coveredByLiquid: boolean;
  /** True when the call can be met at all, even if it requires selling illiquids. */
  coveredByTotal: boolean;
  /** True when funding the call required tapping the illiquid book. */
  requiresIlliquidSale: boolean;
  /** The funding waterfall: which tiers are drawn, in priority order. */
  waterfall: WaterfallStep[];
  /**
   * Residual shortfall: how much of the call cannot be met even after selling
   * everything. Zero when {@link coveredByTotal} is true.
   */
  shortfall: Money;
  /**
   * Liquidity *buffer* after the call is funded from liquid assets only: net
   * liquid proceeds minus the call. Negative when liquid assets fall short
   * (i.e. an illiquid sale would be required).
   */
  liquidBufferAfterCall: Money;
}

/**
 * Roll a portfolio up into per-tier base-currency liquidity. Holdings with no
 * valuation contribute nothing (and are not counted). Holdings whose currency
 * cannot be converted throw via the {@link FxConverter}, rather than being
 * silently dropped.
 */
export function tierLiquidity(
  portfolio: Portfolio,
  fxTable: FxRateTable,
  haircutOverrides?: Partial<Record<LiquidityTier, Decimal | string>>,
): TierLiquidity[] {
  const fx = FxConverter.fromTable(fxTable);
  if (fx.base !== portfolio.baseCurrency) {
    throw new LiquidityError(
      `FX converter base ${fx.base} does not match portfolio base ${portfolio.baseCurrency}`,
    );
  }
  const haircuts = resolveHaircuts(haircutOverrides);

  const grossByTier = new Map<LiquidityTier, Money>();
  const countByTier = new Map<LiquidityTier, number>();
  for (const holding of portfolio.holdings) {
    const own = holdingValue(holding);
    if (!own) continue;
    const base = fx.toBase(own);
    const tier = liquidityTierFor(holding.assetClass);
    const prev = grossByTier.get(tier);
    grossByTier.set(tier, prev ? prev.plus(base) : base);
    countByTier.set(tier, (countByTier.get(tier) ?? 0) + 1);
  }

  return LIQUIDITY_TIERS.map((tier) => {
    const gross = grossByTier.get(tier) ?? Money.zero(fx.base);
    const haircut = haircuts[tier];
    const net = Money.of(
      gross.amount.times(new Decimal(1).minus(haircut)),
      fx.base,
    );
    return {
      tier,
      holdingCount: countByTier.get(tier) ?? 0,
      gross,
      haircut,
      net,
    };
  });
}

/**
 * Analyze whether a capital call can be covered, and how. See the module doc.
 *
 * Deterministic and pure. Throws {@link LiquidityError} on a currency mismatch,
 * a negative call, or an invalid haircut.
 */
export function analyzeCapitalCall(input: CapitalCallInput): CapitalCallCoverage {
  const { portfolio, fxTable, call } = input;
  const base = portfolio.baseCurrency.trim().toUpperCase();

  if (call.currency !== base) {
    throw new LiquidityError(
      `capital call currency ${call.currency} must match portfolio base ${base}`,
    );
  }
  if (call.isNegative()) {
    throw new LiquidityError(
      `capital call must be non-negative, got ${call.toString()}`,
    );
  }

  const tiers = tierLiquidity(portfolio, fxTable, input.haircuts);

  const netByTier = new Map<LiquidityTier, Money>(
    tiers.map((t) => [t.tier, t.net]),
  );

  const liquidNet = LIQUIDITY_TIERS.filter(isLiquidTier).map(
    (t) => netByTier.get(t) ?? Money.zero(base),
  );
  const liquidAvailable = sumMoney(liquidNet, base);
  const illiquidAvailable = netByTier.get("illiquid") ?? Money.zero(base);
  const totalAvailable = liquidAvailable.plus(illiquidAvailable);

  // Walk the waterfall: drain each tier (in priority order) against the
  // outstanding call until it is funded or every tier is exhausted.
  let outstanding = call;
  const waterfall: WaterfallStep[] = [];
  for (const tier of LIQUIDITY_TIERS) {
    const avail = netByTier.get(tier) ?? Money.zero(base);
    // Draw the smaller of (what's still owed) and (what this tier has).
    const used = outstanding.lessThan(avail) ? outstanding : avail;
    const usedNonNeg = used.isNegative() ? Money.zero(base) : used;
    const remaining = avail.minus(usedNonNeg);
    outstanding = outstanding.minus(usedNonNeg);
    waterfall.push({
      tier,
      used: usedNonNeg,
      remaining,
      forcedIlliquidSale: !isLiquidTier(tier) && usedNonNeg.isPositive(),
    });
  }

  const shortfall = outstanding.isNegative() ? Money.zero(base) : outstanding;
  const coveredByTotal = shortfall.isZero();
  // Covered by liquid assets alone when nothing was drawn from the illiquid tier.
  const requiresIlliquidSale = waterfall.some((s) => s.forcedIlliquidSale);
  const coveredByLiquid = coveredByTotal && !requiresIlliquidSale;

  const callAmount = call.amount;
  const liquidCoverageRatio = callAmount.isZero()
    ? null
    : liquidAvailable.amount.div(callAmount);
  const totalCoverageRatio = callAmount.isZero()
    ? null
    : totalAvailable.amount.div(callAmount);

  return {
    baseCurrency: base,
    call,
    tiers,
    liquidAvailable,
    illiquidAvailable,
    totalAvailable,
    liquidCoverageRatio,
    totalCoverageRatio,
    coveredByLiquid,
    coveredByTotal,
    requiresIlliquidSale,
    waterfall,
    shortfall,
    liquidBufferAfterCall: liquidAvailable.minus(call),
  };
}
