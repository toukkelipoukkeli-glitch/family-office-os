import {
  type Ledger,
  type LotMethod,
  type OpenLotPosition,
  openLots,
} from "../taxlots";
import { Money } from "../money";

/**
 * m7-harvest — tax-loss-harvesting finder for the read-only family office OS.
 *
 * Tax-loss harvesting is the practice of *selling* a position that is currently
 * worth less than its cost basis to realize ("bank") the capital loss, which can
 * offset realized gains elsewhere. The catch is the IRS **wash-sale rule**
 * (26 U.S.C. §1091): if you buy "substantially identical" stock within **30
 * days before or after** the loss sale (a 61-day window centred on the sale),
 * the loss is *disallowed* and instead added to the basis of the replacement
 * shares. Selling at a loss but re-buying too soon therefore gives you no tax
 * benefit.
 *
 * This module looks at the *still-open* lots in a ledger (via the existing
 * tax-lot engine), marks every lot whose market value is below its cost basis
 * as a **harvest candidate**, and **flags the wash-sale risk**: for each
 * candidate we scan the ledger for any acquisition of the same symbol whose
 * trade date falls inside the ±30-day window around the (hypothetical) harvest
 * date `asOf`. If one exists the loss would be disallowed, so we surface it.
 *
 * READ-ONLY product: this *finds and explains* harvesting opportunities. It
 * never sells a real position, moves money, or files anything. All arithmetic
 * runs through {@link Money} / decimal.js so currency is never floating-point
 * (see AGENTS.md).
 */

/** The wash-sale window: ±30 calendar days around the harvest (sale) date. */
export const WASH_SALE_WINDOW_DAYS = 30;

/** A purchase of the same symbol that lands inside the wash-sale window. */
export interface WashSaleConflict {
  /** The acquisition lot id that triggers the conflict. */
  lotId: string;
  /** The acquisition trade date (YYYY-MM-DD). */
  date: string;
  /** Quantity acquired (exact decimal string). */
  quantity: string;
  /**
   * Signed day offset of this purchase relative to the harvest date `asOf`
   * (negative = before, positive = after). Always within ±30.
   */
  dayOffset: number;
}

/** One open lot evaluated as a tax-loss-harvesting candidate. */
export interface HarvestCandidate {
  /** The open lot id. */
  lotId: string;
  /** Symbol held. */
  symbol: string;
  /** Acquisition date of the open lot (YYYY-MM-DD). */
  acquiredOn: string;
  /** Remaining quantity still held. */
  quantity: string;
  /** Cost basis of the remaining quantity. */
  basis: Money;
  /** Market value of the remaining quantity at the valuation price. */
  marketValue: Money;
  /**
   * Unrealized gain = marketValue − basis. Negative for a harvestable loss.
   * Candidates are only emitted when this is strictly negative.
   */
  unrealizedGain: Money;
  /** The harvestable loss as a positive magnitude (= −unrealizedGain). */
  harvestableLoss: Money;
  /** Holding period of the lot as of `asOf`. */
  holdingPeriod: "short" | "long";
  /**
   * Purchases of the same symbol inside the ±30-day wash-sale window around
   * `asOf`. Empty when the loss can be cleanly harvested.
   */
  washSaleConflicts: WashSaleConflict[];
  /**
   * True when {@link washSaleConflicts} is non-empty: harvesting this lot now
   * would trip the wash-sale rule and the loss would be disallowed.
   */
  washSaleRisk: boolean;
}

/** Aggregate summary of a harvest scan. */
export interface HarvestReport {
  currency: string;
  /** The hypothetical harvest (valuation) date the scan was run for. */
  asOf: string;
  /** Lot-selection method used to derive the open lots. */
  method: LotMethod;
  /** Every loss-making open lot, worst loss first. */
  candidates: HarvestCandidate[];
  /** Total harvestable loss across *clean* (no wash-sale) candidates. */
  cleanHarvestableLoss: Money;
  /** Total harvestable loss blocked by wash-sale conflicts. */
  blockedHarvestableLoss: Money;
  /** Total harvestable loss across all candidates (clean + blocked). */
  totalHarvestableLoss: Money;
  /** Count of candidates flagged with wash-sale risk. */
  flaggedCount: number;
}

/** Parse a YYYY-MM-DD date to a UTC epoch-day integer. */
function epochDay(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/**
 * Find the purchases of `symbol` that fall inside the ±`window` day wash-sale
 * window around `asOf`. Both the acquisition ledger *and* (for completeness)
 * the replacement side are scanned: any same-symbol acquisition within the
 * window — whether strictly before or after the harvest date — disallows the
 * loss. The harvest date itself (offset 0) counts as inside the window.
 */
export function washSaleConflicts(
  ledger: Ledger,
  symbol: string,
  asOf: string,
  window: number = WASH_SALE_WINDOW_DAYS,
): WashSaleConflict[] {
  const center = epochDay(asOf);
  const conflicts: WashSaleConflict[] = [];
  for (const a of ledger.acquisitions) {
    if (a.symbol !== symbol) continue;
    const offset = epochDay(a.date) - center;
    if (Math.abs(offset) <= window) {
      conflicts.push({
        lotId: a.id,
        date: a.date,
        quantity: a.quantity,
        dayOffset: offset,
      });
    }
  }
  // Earliest purchase first for stable, readable output.
  conflicts.sort((x, y) => x.dayOffset - y.dayOffset);
  return conflicts;
}

/**
 * Run the tax-loss-harvesting scan over a ledger.
 *
 * Open lots are derived with the existing tax-lot engine under `method`, valued
 * against `prices` (symbol → per-unit price string) as of `asOf`. Every lot
 * whose market value is below its basis becomes a harvest candidate; each
 * candidate is then checked against the wash-sale window.
 *
 * Pure: the input ledger is never mutated.
 */
export function findHarvestCandidates(
  ledger: Ledger,
  options: {
    prices: Record<string, string>;
    asOf: string;
    method?: LotMethod;
    /** Override the wash-sale window (days). Defaults to 30. */
    window?: number;
  },
): HarvestReport {
  const method: LotMethod = options.method ?? "fifo";
  const window = options.window ?? WASH_SALE_WINDOW_DAYS;
  const currency = ledger.currency;

  const positions: OpenLotPosition[] = openLots(ledger, method, {
    prices: options.prices,
    asOf: options.asOf,
  });

  const candidates: HarvestCandidate[] = [];
  for (const p of positions) {
    // Only lots with a price and a strictly-negative unrealized gain are
    // harvest candidates.
    if (!p.marketValue || !p.unrealizedGain) continue;
    if (!p.unrealizedGain.amount.isNegative() || p.unrealizedGain.amount.isZero()) {
      continue;
    }
    const conflicts = washSaleConflicts(ledger, p.symbol, options.asOf, window);
    const harvestableLoss = Money.of(
      p.unrealizedGain.amount.negated(),
      currency,
    );
    candidates.push({
      lotId: p.lotId,
      symbol: p.symbol,
      acquiredOn: p.acquiredOn,
      quantity: p.quantity,
      basis: p.basis,
      marketValue: p.marketValue,
      unrealizedGain: p.unrealizedGain,
      harvestableLoss,
      holdingPeriod: p.holdingPeriod ?? "short",
      washSaleConflicts: conflicts,
      washSaleRisk: conflicts.length > 0,
    });
  }

  // Worst loss first (largest harvestable loss). Tie-break by lot id for a
  // stable, deterministic order.
  candidates.sort((a, b) => {
    const cmp = b.harvestableLoss.amount.comparedTo(a.harvestableLoss.amount);
    if (cmp !== 0) return cmp;
    return a.lotId < b.lotId ? -1 : a.lotId > b.lotId ? 1 : 0;
  });

  let clean = Money.zero(currency);
  let blocked = Money.zero(currency);
  let flaggedCount = 0;
  for (const c of candidates) {
    if (c.washSaleRisk) {
      blocked = blocked.plus(c.harvestableLoss);
      flaggedCount += 1;
    } else {
      clean = clean.plus(c.harvestableLoss);
    }
  }

  return {
    currency,
    asOf: options.asOf,
    method,
    candidates,
    cleanHarvestableLoss: clean,
    blockedHarvestableLoss: blocked,
    totalHarvestableLoss: clean.plus(blocked),
    flaggedCount,
  };
}
