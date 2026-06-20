import {
  type HarvestCandidate,
  type HarvestReport,
  type WashSaleConflict,
  findHarvestCandidates,
} from "@/lib/harvest";
import {
  LOT_METHOD_LABEL,
  type Ledger,
  type LotMethod,
} from "@/lib/taxlots";

import { formatMoney, formatSigned, type Sign } from "@/taxlots/taxlots-view";

/**
 * View-model helpers for the tax-loss-harvesting page. Kept separate from the
 * React component so the formatting/derivation logic is unit-testable without a
 * DOM. Reuses the shared money formatters from the tax-lots view.
 */

export { formatMoney, formatSigned, LOT_METHOD_LABEL };
export type { Sign };

/** Ordered list of methods for the page's lot-method selector. */
export const HARVEST_METHODS: LotMethod[] = ["fifo", "lifo", "hifo", "spec-id"];

function signOf(amount: string): Sign {
  if (/^-?0(\.0+)?$/.test(amount)) return "zero";
  return amount.startsWith("-") ? "negative" : "positive";
}

/** A wash-sale conflict formatted for display. */
export interface WashSaleConflictRow {
  lotId: string;
  date: string;
  quantity: string;
  /** Human phrase, e.g. "12 days before" / "20 days after" / "same day". */
  timing: string;
}

/** A harvest candidate formatted for the table. */
export interface HarvestRow {
  lotId: string;
  symbol: string;
  acquiredOn: string;
  quantity: string;
  basis: string;
  marketValue: string;
  /** Harvestable loss as a signed string (always negative here). */
  unrealizedGain: string;
  /** Harvestable loss magnitude, formatted positive. */
  harvestableLoss: string;
  holdingPeriod: "short" | "long";
  holdingPeriodLabel: string;
  washSaleRisk: boolean;
  /** "Wash-sale risk" or "Clean" — the status pill text. */
  statusLabel: string;
  conflicts: WashSaleConflictRow[];
}

export interface HarvestViewModel {
  currency: string;
  asOf: string;
  method: LotMethod;
  methodLabel: string;
  rows: HarvestRow[];
  /** True when there are no underwater lots to harvest. */
  empty: boolean;
  totals: {
    candidates: number;
    flagged: number;
    clean: string;
    blocked: string;
    total: string;
  };
}

function timingPhrase(offset: number): string {
  if (offset === 0) return "same day";
  const days = Math.abs(offset);
  const unit = days === 1 ? "day" : "days";
  return offset < 0 ? `${days} ${unit} before` : `${days} ${unit} after`;
}

function holdingPeriodLabel(p: "short" | "long"): string {
  return p === "short" ? "Short-term" : "Long-term";
}

function toRow(c: HarvestCandidate, currency: string): HarvestRow {
  return {
    lotId: c.lotId,
    symbol: c.symbol,
    acquiredOn: c.acquiredOn,
    quantity: c.quantity,
    basis: formatMoney(c.basis.amount.toFixed(), currency),
    marketValue: formatMoney(c.marketValue.amount.toFixed(), currency),
    unrealizedGain: formatSigned(c.unrealizedGain.amount.toFixed(), currency),
    harvestableLoss: formatMoney(c.harvestableLoss.amount.toFixed(), currency),
    holdingPeriod: c.holdingPeriod,
    holdingPeriodLabel: holdingPeriodLabel(c.holdingPeriod),
    washSaleRisk: c.washSaleRisk,
    statusLabel: c.washSaleRisk ? "Wash-sale risk" : "Clean",
    conflicts: c.washSaleConflicts.map((w: WashSaleConflict) => ({
      lotId: w.lotId,
      date: w.date,
      quantity: w.quantity,
      timing: timingPhrase(w.dayOffset),
    })),
  };
}

/**
 * Build the full view model for a ledger's harvest scan under `method`, valued
 * against `prices` as of `asOf`. Pure.
 */
export function buildHarvestViewModel(
  ledger: Ledger,
  options: { prices: Record<string, string>; asOf: string; method?: LotMethod },
): HarvestViewModel {
  const report: HarvestReport = findHarvestCandidates(ledger, options);
  const currency = report.currency;

  return {
    currency,
    asOf: report.asOf,
    method: report.method,
    methodLabel: LOT_METHOD_LABEL[report.method],
    rows: report.candidates.map((c) => toRow(c, currency)),
    empty: report.candidates.length === 0,
    totals: {
      candidates: report.candidates.length,
      flagged: report.flaggedCount,
      clean: formatMoney(report.cleanHarvestableLoss.amount.toFixed(), currency),
      blocked: formatMoney(
        report.blockedHarvestableLoss.amount.toFixed(),
        currency,
      ),
      total: formatMoney(report.totalHarvestableLoss.amount.toFixed(), currency),
    },
  };
}

export { signOf };
