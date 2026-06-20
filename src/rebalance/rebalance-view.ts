import type { Decimal } from "decimal.js";

import type {
  AssetClassPlan,
  ProposedTrade,
  RebalanceProposal,
} from "@/lib/rebalance";
import { LOT_METHOD_LABEL, type LotMethod } from "@/lib/taxlots";

/** One-line explanation of how each lot-selection method picks lots to sell. */
const METHOD_BLURB: Record<LotMethod, string> = {
  hifo:
    "HIFO sells the highest-cost lots first to minimize the realized gain and the tax it triggers.",
  fifo: "FIFO sells the oldest lots first, which usually realizes more long-term gain.",
  lifo: "LIFO sells the newest lots first, which often realizes short-term gain.",
  "spec-id": "Specific-ID sells the lots you nominate, lot by lot.",
};

/**
 * View-model adapter for the tax-aware rebalancing page. Turns a
 * {@link RebalanceProposal} from the pure engine into ready-to-render strings,
 * keeping formatting out of the React component so the page stays declarative
 * and the formatting is independently unit-testable.
 *
 * READ-ONLY: this prepares a proposal for display; nothing here trades.
 */

/** Format a `[0, 1]` weight as a percent, e.g. 0.5 → "50.0%". */
function pct(weight: Decimal, digits = 1): string {
  return `${weight.times(100).toFixed(digits)}%`;
}

/** A single asset-class row prepared for display. */
export interface AssetClassRow {
  assetClass: string;
  label: string;
  currentWeightLabel: string;
  targetWeightLabel: string;
  projectedWeightLabel: string;
  /** "+20.0%" / "−10.0%" — signed drift. */
  driftLabel: string;
  /** True when overweight (positive drift). */
  overweight: boolean;
  /** True when this class is actually traded (drift beyond band). */
  traded: boolean;
  /** Signed trade direction label: "Sell", "Buy", or "Hold". */
  action: "Sell" | "Buy" | "Hold";
  /** Base-currency trade notional, e.g. "$16,000.00" (absolute). */
  tradeAmountLabel: string;
  /** Bar widths (percent of total) for current vs target. */
  currentFill: number;
  targetFill: number;
}

/** A single proposed-trade row prepared for display. */
export interface TradeRow {
  id: string;
  side: ProposedTrade["side"];
  /** "Sell" / "Buy". */
  sideLabel: string;
  holdingName: string;
  symbol?: string;
  assetClassLabel: string;
  /** Units, e.g. "80". Omitted for synthetic buys (quantity "1"). */
  quantityLabel?: string;
  /** Notional, e.g. "$16,000.00". */
  amountLabel: string;
  /** Realized gain (sells only), e.g. "+$1,600.00" / "−$500.00". */
  realizedGainLabel?: string;
  /** True when the realized gain is a loss (for styling). */
  isLoss?: boolean;
  /** Short/long split label (sells only), e.g. "$1,600 ST · $0 LT". */
  gainSplitLabel?: string;
}

/** The full prepared view-model for the page. */
export interface RebalanceViewModel {
  baseCurrency: string;
  methodLabel: string;
  /** One-line explanation of the selected lot-selection method. */
  methodBlurb: string;
  totalLabel: string;
  /** Tolerance band, e.g. "5.0%". */
  bandLabel: string;
  /** Whether the proposal reconciles to target within band. */
  reconciles: boolean;
  assetClasses: AssetClassRow[];
  trades: TradeRow[];
  sellCount: number;
  buyCount: number;
  totalSoldLabel: string;
  totalBoughtLabel: string;
  realizedGainLabel: string;
  /** True when the aggregate realized gain is a loss. */
  realizedIsLoss: boolean;
  realizedShortTermLabel: string;
  realizedLongTermLabel: string;
  /** Estimated incremental tax, e.g. "$160.00". */
  estimatedTaxLabel: string;
  /** Tax saved vs FIFO, e.g. "$1,440.00". */
  taxSavedLabel: string;
  /** True when there is a positive tax saving to highlight. */
  hasTaxSaving: boolean;
}

/** Signed money label with an explicit + / − sign for gains. */
function signedMoney(value: { isNegative(): boolean; isZero(): boolean; format(): string }): string {
  if (value.isZero()) return value.format();
  const sign = value.isNegative() ? "" : "+";
  return `${sign}${value.format()}`;
}

function buildAssetClassRow(plan: AssetClassPlan): AssetClassRow {
  const overweight = plan.drift.isPositive();
  const traded = !plan.tradeAmount.isZero();
  const driftSign = plan.drift.isNegative() ? "−" : "+";
  const action: AssetClassRow["action"] = !traded
    ? "Hold"
    : overweight
      ? "Sell"
      : "Buy";
  return {
    assetClass: plan.assetClass,
    label: plan.label,
    currentWeightLabel: pct(plan.currentWeight),
    targetWeightLabel: pct(plan.targetWeight),
    projectedWeightLabel: pct(plan.projectedWeight),
    driftLabel: `${driftSign}${plan.drift.abs().times(100).toFixed(1)}%`,
    overweight,
    traded,
    action,
    tradeAmountLabel: plan.tradeAmount.isZero()
      ? "—"
      : plan.tradeAmount.times(-1).isNegative()
        ? plan.tradeAmount.format() // negative (sell) already has its sign
        : plan.tradeAmount.format(),
    currentFill: clampPct(plan.currentWeight),
    targetFill: clampPct(plan.targetWeight),
  };
}

function clampPct(weight: Decimal): number {
  const v = weight.times(100).toNumber();
  return Math.max(0, Math.min(100, v));
}

function buildTradeRow(trade: ProposedTrade): TradeRow {
  const isBuy = trade.side === "buy";
  const row: TradeRow = {
    id: `${trade.holdingId}-${trade.side}`,
    side: trade.side,
    sideLabel: isBuy ? "Buy" : "Sell",
    holdingName: trade.holdingName,
    symbol: trade.symbol,
    assetClassLabel: trade.assetClass,
    amountLabel: trade.amount.format(),
  };
  // Synthetic buys carry a placeholder quantity of "1"; don't show it.
  if (!isBuy) {
    row.quantityLabel = trade.quantity;
  }
  if (trade.realizedGain) {
    row.realizedGainLabel = signedMoney(trade.realizedGain);
    row.isLoss = trade.realizedGain.isNegative();
    const st = trade.shortTermGain?.format() ?? "0";
    const lt = trade.longTermGain?.format() ?? "0";
    row.gainSplitLabel = `${st} ST · ${lt} LT`;
  }
  return row;
}

/** Build the full view-model for the page from a proposal. */
export function buildRebalanceViewModel(
  proposal: RebalanceProposal,
): RebalanceViewModel {
  const sells = proposal.trades.filter((t) => t.side === "sell");
  const buys = proposal.trades.filter((t) => t.side === "buy");
  return {
    baseCurrency: proposal.baseCurrency,
    methodLabel: LOT_METHOD_LABEL[proposal.method],
    methodBlurb: METHOD_BLURB[proposal.method],
    totalLabel: proposal.total.format(),
    bandLabel: pct(proposal.band),
    reconciles: proposal.reconciles,
    assetClasses: proposal.assetClasses.map(buildAssetClassRow),
    trades: proposal.trades.map(buildTradeRow),
    sellCount: sells.length,
    buyCount: buys.length,
    totalSoldLabel: proposal.totalSold.format(),
    totalBoughtLabel: proposal.totalBought.format(),
    realizedGainLabel: signedMoney(proposal.realizedGain),
    realizedIsLoss: proposal.realizedGain.isNegative(),
    realizedShortTermLabel: proposal.realizedShortTermGain.format(),
    realizedLongTermLabel: proposal.realizedLongTermGain.format(),
    estimatedTaxLabel: proposal.taxEstimate.totalTax.format(),
    taxSavedLabel: proposal.taxSavedVsFifo.format(),
    hasTaxSaving: proposal.taxSavedVsFifo.isPositive(),
  };
}
