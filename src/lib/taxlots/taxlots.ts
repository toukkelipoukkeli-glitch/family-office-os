import { Decimal } from "decimal.js";
import * as z from "zod";

import {
  CurrencyCode,
  Id,
  IsoDate,
  NonNegativeDecimalString,
} from "../model/primitives";
import { Money } from "../money";

/**
 * m7-tax-lots — exact-decimal tax lot engine for the read-only family office OS.
 *
 * A *tax lot* is a single acquisition of a quantity of a security at a cost:
 * the unit basis you bought, when you bought it, and how much. When you sell,
 * the realized gain/loss and its holding period (short- vs long-term) depend on
 * *which* lots the sale is matched against. This engine implements the standard
 * lot-selection methods — FIFO, LIFO, HIFO, and specific identification — over
 * an exact-decimal ledger.
 *
 * READ-ONLY product: this models and reports gains; it never sells a real
 * position, moves money, or files a tax return. All arithmetic runs through
 * {@link Money} / decimal.js so we never lose precision (see AGENTS.md: never
 * floating-point currency).
 */

/** The lot-selection method used to match a disposal against open lots. */
export const LotMethod = z.enum(["fifo", "lifo", "hifo", "spec-id"]);
export type LotMethod = z.infer<typeof LotMethod>;

/** Human labels for each lot-selection method. */
export const LOT_METHOD_LABEL: Record<LotMethod, string> = {
  fifo: "FIFO",
  lifo: "LIFO",
  hifo: "HIFO",
  "spec-id": "Specific ID",
};

/** A strictly-positive decimal quantity, stored as a digit string. */
const PositiveDecimalString = NonNegativeDecimalString.refine(
  (s) => new Decimal(s).greaterThan(0),
  "must be greater than zero",
);

/**
 * An acquisition: `quantity` units of a security bought on `date` for a total
 * `cost`. The per-unit basis is `cost / quantity`.
 */
export const Acquisition = z
  .object({
    /** Stable id for this lot. */
    id: Id,
    /** Ticker / symbol the lot is held in (e.g. "AAPL"). */
    symbol: z.string().trim().min(1, "symbol must not be empty"),
    /** Trade date the lot was acquired (YYYY-MM-DD). */
    date: IsoDate,
    /** Units acquired (exact decimal string, > 0). */
    quantity: PositiveDecimalString,
    /** Total cost basis paid for the lot (exact decimal string, >= 0). */
    cost: NonNegativeDecimalString,
    /** Optional free-text note. */
    note: z.string().trim().max(2000).optional(),
  })
  .strict();
export type Acquisition = z.infer<typeof Acquisition>;

/**
 * A disposal: selling `quantity` units of `symbol` on `date` for total
 * `proceeds`. Optionally pins specific lots via {@link DisposalLotPick} (only
 * meaningful for the `spec-id` method).
 */
export const Disposal = z
  .object({
    /** Stable id for this disposal. */
    id: Id,
    /** Ticker / symbol sold. */
    symbol: z.string().trim().min(1, "symbol must not be empty"),
    /** Trade date of the sale (YYYY-MM-DD). */
    date: IsoDate,
    /** Units sold (exact decimal string, > 0). */
    quantity: PositiveDecimalString,
    /** Total proceeds received (exact decimal string, >= 0). */
    proceeds: NonNegativeDecimalString,
    /**
     * For `spec-id`: explicit lots to draw from, in priority order. Each entry
     * names a lot id and how many units to take from it.
     */
    picks: z
      .array(
        z
          .object({
            lotId: Id,
            quantity: PositiveDecimalString,
          })
          .strict(),
      )
      .optional(),
  })
  .strict();
export type Disposal = z.infer<typeof Disposal>;

/** A full ledger for one currency: the acquisitions and disposals to match. */
export const Ledger = z
  .object({
    currency: CurrencyCode,
    acquisitions: z.array(Acquisition),
    disposals: z.array(Disposal),
  })
  .strict();
export type Ledger = z.infer<typeof Ledger>;

/** Holding period classification for a realized gain. */
export type HoldingPeriod = "short" | "long";

/**
 * Number of days a lot must be held (strictly more than) to count as long-term
 * under US rules: more than one year. We compute "more than one year" as the
 * acquisition date being strictly before the same calendar day one year prior
 * to the sale (i.e. acquired on/after that boundary is short-term).
 */
export function holdingPeriod(
  acquiredOn: string,
  disposedOn: string,
): HoldingPeriod {
  const [ay, am, ad] = acquiredOn.split("-").map(Number);
  const [dy, dm, dd] = disposedOn.split("-").map(Number);
  // The long-term boundary: acquisitions strictly before (sale date − 1 year)
  // are long-term. Selling on the one-year anniversary is still short-term;
  // selling the day after is long-term (US Pub 550 rule).
  const acquired = Date.UTC(ay, am - 1, ad);
  const boundary = Date.UTC(dy - 1, dm - 1, dd);
  return acquired < boundary ? "long" : "short";
}

/** A working, mutable view of an open lot while matching disposals. */
interface OpenLot {
  id: string;
  symbol: string;
  date: string;
  /** Remaining (unsold) quantity. */
  remaining: Decimal;
  /** Per-unit cost basis. */
  unitCost: Decimal;
}

/**
 * One slice of a disposal matched against a single lot: how many units came
 * from `lotId`, the basis consumed, the proceeds allocated, the resulting gain,
 * and its holding period.
 */
export interface MatchedSlice {
  lotId: string;
  symbol: string;
  acquiredOn: string;
  disposedOn: string;
  quantity: string;
  basis: Money;
  proceeds: Money;
  gain: Money;
  holdingPeriod: HoldingPeriod;
}

/** The realized result of matching a single disposal. */
export interface DisposalResult {
  disposalId: string;
  symbol: string;
  disposedOn: string;
  quantity: string;
  proceeds: Money;
  basis: Money;
  gain: Money;
  slices: MatchedSlice[];
}

/** Aggregate realized totals across all matched disposals. */
export interface RealizedSummary {
  currency: string;
  proceeds: Money;
  basis: Money;
  gain: Money;
  shortTermGain: Money;
  longTermGain: Money;
  disposals: DisposalResult[];
}

/** The unrealized state of a single still-open lot at a valuation price. */
export interface OpenLotPosition {
  lotId: string;
  symbol: string;
  acquiredOn: string;
  /** Remaining quantity still held. */
  quantity: string;
  /** Cost basis of the remaining quantity. */
  basis: Money;
  /** Market value of the remaining quantity (when a price is supplied). */
  marketValue?: Money;
  /** Unrealized gain = marketValue − basis (when a price is supplied). */
  unrealizedGain?: Money;
  /** Holding period as of the valuation date (when supplied). */
  holdingPeriod?: HoldingPeriod;
}

function dec(s: string): Decimal {
  return new Decimal(s);
}

/**
 * Order the open lots for a disposal according to the selection `method`.
 * Returns a *new* array; does not mutate the input.
 *
 * - **fifo** — oldest acquisition first (ties: stable by original order).
 * - **lifo** — newest acquisition first.
 * - **hifo** — highest per-unit cost basis first (maximize basis ⇒ minimize
 *   gain). Ties broken by oldest first.
 */
function orderLots(lots: OpenLot[], method: Exclude<LotMethod, "spec-id">): OpenLot[] {
  const indexed = lots.map((lot, i) => ({ lot, i }));
  indexed.sort((a, b) => {
    if (method === "fifo") {
      if (a.lot.date !== b.lot.date) return a.lot.date < b.lot.date ? -1 : 1;
      return a.i - b.i;
    }
    if (method === "lifo") {
      if (a.lot.date !== b.lot.date) return a.lot.date < b.lot.date ? 1 : -1;
      return b.i - a.i;
    }
    // hifo
    const cmp = b.lot.unitCost.comparedTo(a.lot.unitCost);
    if (cmp !== 0) return cmp;
    if (a.lot.date !== b.lot.date) return a.lot.date < b.lot.date ? -1 : 1;
    return a.i - b.i;
  });
  return indexed.map((x) => x.lot);
}

/**
 * Match a single disposal against the supplied open lots (mutated in place to
 * deduct the sold quantity). Proceeds are allocated to each slice pro-rata by
 * quantity so the slice proceeds always sum exactly to the disposal proceeds.
 */
function matchDisposal(
  disposal: Disposal,
  openBySymbol: Map<string, OpenLot[]>,
  method: LotMethod,
  currency: string,
): DisposalResult {
  const lots = openBySymbol.get(disposal.symbol) ?? [];
  const wanted = dec(disposal.quantity);

  // First pass: figure out how many units come from each lot, so we can
  // allocate proceeds proportionally and exactly.
  const consumed: { lot: OpenLot; qty: Decimal }[] =
    method === "spec-id"
      ? resolveSpecId(disposal, lots, wanted)
      : planByOrder(orderLots(lots, method), wanted);

  const planned = consumed.reduce((a, c) => a.plus(c.qty), new Decimal(0));
  if (planned.lessThan(wanted)) {
    throw new Error(
      `Disposal ${disposal.id} sells ${disposal.quantity} ${disposal.symbol} but only ${planned.toFixed()} units are available`,
    );
  }

  const totalProceeds = Money.of(disposal.proceeds, currency);
  // Allocate proceeds across slices by integer-weighted minor-unit allocation,
  // weighting by quantity so the pieces sum exactly to the proceeds. We scale
  // quantities to integer weights by stripping the decimal point.
  const weights = quantityWeights(consumed.map((c) => c.qty));
  const proceedsParts =
    consumed.length > 0 ? totalProceeds.allocate(weights) : [];

  const slices: MatchedSlice[] = consumed.map((c, i) => {
    const basis = Money.of(c.lot.unitCost.times(c.qty), currency);
    const proceeds = proceedsParts[i];
    const gain = proceeds.minus(basis);
    // Deduct from the open lot.
    c.lot.remaining = c.lot.remaining.minus(c.qty);
    return {
      lotId: c.lot.id,
      symbol: disposal.symbol,
      acquiredOn: c.lot.date,
      disposedOn: disposal.date,
      quantity: c.qty.toFixed(),
      basis,
      proceeds,
      gain,
      holdingPeriod: holdingPeriod(c.lot.date, disposal.date),
    };
  });

  const basis = sumMoneyOr(
    slices.map((s) => s.basis),
    currency,
  );
  const gain = totalProceeds.minus(basis);
  return {
    disposalId: disposal.id,
    symbol: disposal.symbol,
    disposedOn: disposal.date,
    quantity: disposal.quantity,
    proceeds: totalProceeds,
    basis,
    gain,
    slices,
  };
}

/**
 * Build a consumption plan from a method-ordered lot list, draining each lot in
 * turn until `wanted` units are taken. Stops early once satisfied; never takes
 * more than a lot's remaining quantity.
 */
function planByOrder(
  ordered: OpenLot[],
  wanted: Decimal,
): { lot: OpenLot; qty: Decimal }[] {
  const consumed: { lot: OpenLot; qty: Decimal }[] = [];
  let need = wanted;
  for (const lot of ordered) {
    if (need.lessThanOrEqualTo(0)) break;
    if (lot.remaining.lessThanOrEqualTo(0)) continue;
    const take = Decimal.min(need, lot.remaining);
    consumed.push({ lot, qty: take });
    need = need.minus(take);
  }
  return consumed;
}

/**
 * Resolve the explicit `spec-id` lot picks into a consumption plan. Each pick's
 * `quantity` is honored exactly: we draw that many units from the named lot.
 * Validates that every pick names a known lot of this symbol, that no lot is
 * over-drawn (including across duplicate picks of the same lot), and that the
 * picked quantities sum to exactly the disposal quantity.
 */
function resolveSpecId(
  disposal: Disposal,
  lots: OpenLot[],
  wanted: Decimal,
): { lot: OpenLot; qty: Decimal }[] {
  const picks = disposal.picks;
  if (!picks || picks.length === 0) {
    throw new Error(
      `Disposal ${disposal.id} uses spec-id but supplies no lot picks`,
    );
  }
  const byId = new Map(lots.map((l) => [l.id, l]));
  // Track how much we've already drawn from each lot so duplicate picks of the
  // same lot can't collectively over-draw it.
  const drawn = new Map<string, Decimal>();
  const consumed: { lot: OpenLot; qty: Decimal }[] = [];
  let total = new Decimal(0);
  for (const pick of picks) {
    const lot = byId.get(pick.lotId);
    if (!lot) {
      throw new Error(
        `Disposal ${disposal.id} picks unknown or wrong-symbol lot ${pick.lotId}`,
      );
    }
    const qty = dec(pick.quantity);
    const already = drawn.get(lot.id) ?? new Decimal(0);
    const after = already.plus(qty);
    if (after.greaterThan(lot.remaining)) {
      throw new Error(
        `Disposal ${disposal.id} picks ${after.toFixed()} units from lot ${lot.id} but only ${lot.remaining.toFixed()} are available`,
      );
    }
    drawn.set(lot.id, after);
    consumed.push({ lot, qty });
    total = total.plus(qty);
  }
  if (!total.equals(wanted)) {
    throw new Error(
      `Disposal ${disposal.id} picks ${total.toFixed()} units but sells ${wanted.toFixed()}`,
    );
  }
  return consumed;
}

/**
 * Turn a list of decimal quantities into non-negative integer weights with the
 * same ratios, by scaling every quantity to a common number of decimal places.
 */
function quantityWeights(quantities: Decimal[]): number[] {
  const maxDp = quantities.reduce((m, q) => Math.max(m, q.decimalPlaces()), 0);
  const scale = new Decimal(10).pow(maxDp);
  return quantities.map((q) => q.times(scale).toNumber());
}

function sumMoneyOr(items: Money[], currency: string): Money {
  if (items.length === 0) return Money.zero(currency);
  return items.reduce((a, b) => a.plus(b));
}

/**
 * Run the full tax-lot engine over a ledger using `method`. Acquisitions are
 * matched against disposals (processed in chronological order, ties broken by
 * declared order), and the realized gains — split into short- and long-term —
 * are returned alongside per-disposal detail.
 *
 * Pure: the input ledger is never mutated.
 */
export function realizeGains(ledger: Ledger, method: LotMethod): RealizedSummary {
  const currency = ledger.currency;
  // Build the working open-lot pool, grouped by symbol, preserving order.
  const openBySymbol = new Map<string, OpenLot[]>();
  for (const a of ledger.acquisitions) {
    const list = openBySymbol.get(a.symbol) ?? [];
    list.push({
      id: a.id,
      symbol: a.symbol,
      date: a.date,
      remaining: dec(a.quantity),
      unitCost: dec(a.cost).div(dec(a.quantity)),
    });
    openBySymbol.set(a.symbol, list);
  }

  const disposals = [...ledger.disposals]
    .map((d, i) => ({ d, i }))
    .sort((a, b) => {
      if (a.d.date !== b.d.date) return a.d.date < b.d.date ? -1 : 1;
      return a.i - b.i;
    })
    .map((x) => x.d);

  const results: DisposalResult[] = disposals.map((d) =>
    matchDisposal(d, openBySymbol, method, currency),
  );

  let proceeds = Money.zero(currency);
  let basis = Money.zero(currency);
  let shortTermGain = Money.zero(currency);
  let longTermGain = Money.zero(currency);
  for (const r of results) {
    proceeds = proceeds.plus(r.proceeds);
    basis = basis.plus(r.basis);
    for (const s of r.slices) {
      if (s.holdingPeriod === "short") {
        shortTermGain = shortTermGain.plus(s.gain);
      } else {
        longTermGain = longTermGain.plus(s.gain);
      }
    }
  }

  return {
    currency,
    proceeds,
    basis,
    gain: proceeds.minus(basis),
    shortTermGain,
    longTermGain,
    disposals: results,
  };
}

/**
 * Compute the still-open lots after applying `method` to the ledger. When a
 * `prices` map (symbol → per-unit price string) and `asOf` date are supplied,
 * each open lot is also valued for unrealized gain and holding period.
 *
 * Pure: the input ledger is never mutated.
 */
export function openLots(
  ledger: Ledger,
  method: LotMethod,
  options: { prices?: Record<string, string>; asOf?: string } = {},
): OpenLotPosition[] {
  const currency = ledger.currency;
  const openBySymbol = new Map<string, OpenLot[]>();
  for (const a of ledger.acquisitions) {
    const list = openBySymbol.get(a.symbol) ?? [];
    list.push({
      id: a.id,
      symbol: a.symbol,
      date: a.date,
      remaining: dec(a.quantity),
      unitCost: dec(a.cost).div(dec(a.quantity)),
    });
    openBySymbol.set(a.symbol, list);
  }

  const disposals = [...ledger.disposals]
    .map((d, i) => ({ d, i }))
    .sort((a, b) => {
      if (a.d.date !== b.d.date) return a.d.date < b.d.date ? -1 : 1;
      return a.i - b.i;
    })
    .map((x) => x.d);

  for (const d of disposals) {
    matchDisposal(d, openBySymbol, method, currency);
  }

  const positions: OpenLotPosition[] = [];
  for (const a of ledger.acquisitions) {
    const lot = (openBySymbol.get(a.symbol) ?? []).find((l) => l.id === a.id);
    if (!lot || lot.remaining.lessThanOrEqualTo(0)) continue;
    const basis = Money.of(lot.unitCost.times(lot.remaining), currency);
    const position: OpenLotPosition = {
      lotId: lot.id,
      symbol: lot.symbol,
      acquiredOn: lot.date,
      quantity: lot.remaining.toFixed(),
      basis,
    };
    const price = options.prices?.[lot.symbol];
    if (price !== undefined) {
      const marketValue = Money.of(dec(price).times(lot.remaining), currency);
      position.marketValue = marketValue;
      position.unrealizedGain = marketValue.minus(basis);
    }
    if (options.asOf) {
      position.holdingPeriod = holdingPeriod(lot.date, options.asOf);
    }
    positions.push(position);
  }
  return positions;
}
