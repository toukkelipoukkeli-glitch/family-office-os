import { Decimal } from "decimal.js";

import { FxConverter, type FxRateTable } from "@/lib/allocation";
import { holdingValue, latestValuation } from "@/lib/allocation/holding-value";
import { assetClassLabel } from "@/lib/model/asset-class";
import type { AssetClass } from "@/lib/model/asset-class";
import type { ConfidenceLevel, ValuationSource } from "@/lib/model/valuation";
import type { Holding } from "@/lib/model/holding";
import type { Portfolio } from "@/lib/model/portfolio";
import { Money } from "@/lib/money";

/**
 * m13-holdings-index — the global holdings index.
 *
 * Pure, deterministic derivations behind the `/holdings` page: flatten a
 * {@link Portfolio} into one comparable row per holding, then search / filter /
 * sort that row set. Every monetary figure is resolved into the portfolio's
 * base currency using an explicit, pre-resolved {@link FxRateTable}, exactly as
 * the allocation roll-ups do, so the index reconciles with the rest of the app
 * and stays offline + deterministic.
 *
 * Money is exact {@link Decimal}/{@link Money} here; a `number` is materialized
 * only on the value/cost/gain fields the table renders, at the very edge of the
 * model — the render boundary. Gain *ratios* are unitless and currency-
 * invariant, so they are computed once here.
 *
 * READ-ONLY product: this reports what the family owns and what it is worth; it
 * never moves money or proposes a trade.
 */

/* ------------------------------------------------------------------------- */
/* Row model                                                                 */
/* ------------------------------------------------------------------------- */

/**
 * One flattened, sortable/searchable row for a single holding, with every
 * monetary figure already resolved into the portfolio base currency.
 *
 * `value`, `costBasis` and `gain` are plain numbers in the base currency: the
 * table reduces them once here so the UI never re-derives money. The exact
 * {@link Money} values are kept (`valueMoney`, `costBasisMoney`, `gainMoney`)
 * for the export adapter, which must serialize exact decimal strings.
 */
export interface HoldingRow {
  /** Stable holding id. */
  readonly id: string;
  /** Holding display name (e.g. "Apple Inc."). */
  readonly name: string;
  /** Optional instrument symbol (e.g. "AAPL"); empty string when absent. */
  readonly symbol: string;
  /** The holding's asset class. */
  readonly assetClass: AssetClass;
  /** Human label for {@link assetClass} (e.g. "Equities"). */
  readonly assetClassLabel: string;
  /** The holding's native valuation currency (e.g. "EUR"). */
  readonly currency: string;
  /** Free-text tags, in their declared order. */
  readonly tags: readonly string[];
  /** Number of tax lots making up the position. */
  readonly lotCount: number;

  /** Current value in the base currency (0 when the holding is unvalued). */
  readonly value: number;
  /** Cost basis in the base currency (0 when no lots carry a cost). */
  readonly costBasis: number;
  /** Unrealized gain in the base currency (`value - costBasis`). */
  readonly gain: number;
  /**
   * Unrealized gain as a fraction of cost basis (e.g. `0.25` = +25%), or
   * `undefined` when the cost basis is zero (no meaningful percentage).
   */
  readonly gainPct: number | undefined;
  /** Share of the (valued) portfolio total, in [0, 1]. */
  readonly weight: number;

  /** Confidence band of the holding's current valuation, or `undefined`. */
  readonly confidence: ConfidenceLevel | undefined;
  /** How the current valuation was obtained, or `undefined` when unvalued. */
  readonly valuationSource: ValuationSource | undefined;
  /** ISO timestamp of the current valuation, or `undefined` when unvalued. */
  readonly valuationAsOf: string | undefined;
  /** True when the holding has no determinable current value. */
  readonly unvalued: boolean;

  /** Exact current value (base currency) for export. */
  readonly valueMoney: Money;
  /** Exact cost basis (base currency) for export. */
  readonly costBasisMoney: Money;
  /** Exact unrealized gain (base currency) for export. */
  readonly gainMoney: Money;
}

/**
 * Cost basis of a single holding in its *own* currency: the sum over lots of
 * `quantity × unitCost` plus any tracked fees.
 *
 * The lot model already enforces `fees.currency === unitCost.currency`, and a
 * holding's lots are priced in the holding currency; we sum per-lot exactly and
 * require the lot currency to match the holding currency. Returns a zero
 * {@link Money} in `holding.currency` when there are no lots.
 */
export function holdingCostBasis(holding: Holding): Money {
  let total = Money.of("0", holding.currency);
  for (const lot of holding.lots) {
    // `quantity × unitCost`, exact.
    let lotCost = Money.of(lot.unitCost.amount, lot.unitCost.currency).times(
      new Decimal(lot.quantity),
    );
    if (lot.fees) {
      lotCost = lotCost.plus(Money.of(lot.fees.amount, lot.fees.currency));
    }
    total = total.plus(assertSameCurrency(lotCost, holding.currency));
  }
  return total;
}

/**
 * Assert a {@link Money} is already in `currency` and return it unchanged.
 * Lots are priced in the holding currency, so this is a checked identity — the
 * single FX conversion to the base happens later, once, via {@link FxConverter}.
 */
function assertSameCurrency(money: Money, currency: string): Money {
  if (money.currency === currency) return money;
  throw new Error(
    `Lot currency ${money.currency} does not match holding currency ${currency}; ` +
      "cost basis requires same-currency lots.",
  );
}

/**
 * Build the full set of holding rows from a portfolio, in the portfolio's
 * declared order. Each row's value/cost/gain are resolved into the base
 * currency via `fxTable`; weights are computed against the valued total.
 */
export function buildHoldingRows(
  portfolio: Portfolio,
  fxTable: FxRateTable,
): HoldingRow[] {
  const fx = FxConverter.fromTable(fxTable);
  const base = portfolio.baseCurrency;

  // First pass: resolve exact base-currency value + cost for every holding.
  const resolved = portfolio.holdings.map((holding) => {
    const ownValue = holdingValue(holding);
    const valueMoney = ownValue ? fx.toBase(ownValue) : Money.of("0", base);
    const costMoney = fx.toBase(holdingCostBasis(holding));
    return { holding, valueMoney, costMoney, unvalued: !ownValue };
  });

  const total = resolved.reduce(
    (acc, r) => acc.plus(r.valueMoney),
    Money.of("0", base),
  );
  const totalAmount = total.amount;

  return resolved.map(({ holding, valueMoney, costMoney, unvalued }) => {
    const gainMoney = valueMoney.minus(costMoney);
    const v = latestValuation(holding);
    const weight = totalAmount.isZero()
      ? 0
      : valueMoney.amount.div(totalAmount).toNumber();
    const gainPct = costMoney.amount.isZero()
      ? undefined
      : gainMoney.amount.div(costMoney.amount).toNumber();

    return {
      id: holding.id,
      name: holding.name,
      symbol: holding.symbol ?? "",
      assetClass: holding.assetClass,
      assetClassLabel: assetClassLabel(holding.assetClass),
      currency: holding.currency,
      tags: holding.tags,
      lotCount: holding.lots.length,
      value: valueMoney.amount.toNumber(),
      costBasis: costMoney.amount.toNumber(),
      gain: gainMoney.amount.toNumber(),
      gainPct,
      weight,
      confidence: v?.confidence,
      valuationSource: v?.source,
      valuationAsOf: v?.asOf,
      unvalued,
      valueMoney,
      costBasisMoney: costMoney,
      gainMoney,
    };
  });
}

/* ------------------------------------------------------------------------- */
/* Search                                                                    */
/* ------------------------------------------------------------------------- */

/**
 * Free-text search over a row's name, symbol, asset-class label, currency and
 * tags. Case-insensitive, whitespace-trimmed, substring match. An empty/blank
 * query matches everything (returns the input order untouched).
 */
export function searchHoldingRows(
  rows: readonly HoldingRow[],
  query: string,
): HoldingRow[] {
  const q = query.trim().toLowerCase();
  if (q === "") return [...rows];
  return rows.filter((r) => rowSearchHaystack(r).includes(q));
}

/** The lowercased text a row is matched against in {@link searchHoldingRows}. */
function rowSearchHaystack(row: HoldingRow): string {
  return [
    row.name,
    row.symbol,
    row.assetClass,
    row.assetClassLabel,
    row.currency,
    ...row.tags,
  ]
    .join(" ")
    .toLowerCase();
}

/* ------------------------------------------------------------------------- */
/* Column filters                                                            */
/* ------------------------------------------------------------------------- */

/**
 * Column-filter predicate set. Each field, when present, narrows the rows:
 * - `assetClasses` — keep rows whose asset class is in the set.
 * - `currencies` — keep rows whose native currency is in the set.
 * - `confidences` — keep rows whose valuation confidence is in the set.
 * - `minValue` / `maxValue` — keep rows whose base-currency value is within the
 *   inclusive bound(s).
 * - `gain` — `"gain"` keeps rows with a non-negative unrealized gain, `"loss"`
 *   keeps rows with a negative one.
 *
 * An empty set / unset bound imposes no constraint on that dimension. All
 * constraints are AND-ed.
 */
export interface HoldingColumnFilter {
  readonly assetClasses?: ReadonlySet<AssetClass>;
  readonly currencies?: ReadonlySet<string>;
  readonly confidences?: ReadonlySet<ConfidenceLevel>;
  readonly minValue?: number;
  readonly maxValue?: number;
  readonly gain?: "gain" | "loss";
}

/** Whether a column filter constrains nothing (an all-pass filter). */
export function isEmptyColumnFilter(filter: HoldingColumnFilter): boolean {
  return (
    !filter.assetClasses?.size &&
    !filter.currencies?.size &&
    !filter.confidences?.size &&
    filter.minValue === undefined &&
    filter.maxValue === undefined &&
    filter.gain === undefined
  );
}

/** Apply a {@link HoldingColumnFilter} to a row set (AND across dimensions). */
export function filterHoldingRows(
  rows: readonly HoldingRow[],
  filter: HoldingColumnFilter,
): HoldingRow[] {
  if (isEmptyColumnFilter(filter)) return [...rows];
  return rows.filter((r) => {
    if (filter.assetClasses?.size && !filter.assetClasses.has(r.assetClass)) {
      return false;
    }
    if (filter.currencies?.size && !filter.currencies.has(r.currency)) {
      return false;
    }
    if (filter.confidences?.size) {
      if (!r.confidence || !filter.confidences.has(r.confidence)) return false;
    }
    if (filter.minValue !== undefined && r.value < filter.minValue) {
      return false;
    }
    if (filter.maxValue !== undefined && r.value > filter.maxValue) {
      return false;
    }
    if (filter.gain === "gain" && r.gain < 0) return false;
    if (filter.gain === "loss" && r.gain >= 0) return false;
    return true;
  });
}

/* ------------------------------------------------------------------------- */
/* Sort                                                                      */
/* ------------------------------------------------------------------------- */

/** A sortable column key. */
export type HoldingSortKey =
  | "name"
  | "assetClass"
  | "currency"
  | "value"
  | "costBasis"
  | "gain"
  | "gainPct"
  | "weight"
  | "confidence";

/** Sort direction. */
export type SortDirection = "asc" | "desc";

/** A multi-column sort spec, applied in order (first key is primary). */
export interface HoldingSort {
  readonly key: HoldingSortKey;
  readonly direction: SortDirection;
}

/** Confidence ordering for sorting (high > medium > low > none). */
const CONFIDENCE_RANK: Record<ConfidenceLevel, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * Sentinel returned by {@link sortValue} for a row that has no comparable value
 * on the active key (today: a `gainPct` of `undefined`). {@link compareScalar}
 * recognizes it and always orders it after a real value, *before* the asc/desc
 * flip is applied — so such rows stay at the bottom in both directions instead
 * of jumping to the top on an ascending sort.
 */
const MISSING_LAST = Symbol("holdings.missing");

/** Comparable scalar for a row on a given sort key. */
function sortValue(
  row: HoldingRow,
  key: HoldingSortKey,
): number | string | typeof MISSING_LAST {
  switch (key) {
    case "name":
      return row.name.toLowerCase();
    case "assetClass":
      return row.assetClassLabel.toLowerCase();
    case "currency":
      return row.currency.toLowerCase();
    case "value":
      return row.value;
    case "costBasis":
      return row.costBasis;
    case "gain":
      return row.gain;
    case "gainPct":
      // A missing percentage has no comparable position on the scale. It is kept
      // out of the numeric ordering here and handled as an always-last sentinel
      // in {@link sortHoldingRows} (see `MISSING_LAST`), so such rows sink to the
      // bottom in *both* directions rather than flipping to the top on `asc`.
      return row.gainPct ?? MISSING_LAST;
    case "weight":
      return row.weight;
    case "confidence":
      return row.confidence ? CONFIDENCE_RANK[row.confidence] : 0;
  }
}

type SortScalar = number | string | typeof MISSING_LAST;

/**
 * Compare two scalars of the same kind. Strings compare lexicographically.
 *
 * The {@link MISSING_LAST} sentinel is direction-independent: it is reported via
 * {@link missingBias} so the caller can keep missing rows at the bottom *after*
 * the asc/desc flip, never inside the ordinary comparison.
 */
function compareScalar(a: SortScalar, b: SortScalar): number {
  if (typeof a === "string" && typeof b === "string") {
    return a < b ? -1 : a > b ? 1 : 0;
  }
  const na = a as number;
  const nb = b as number;
  return na < nb ? -1 : na > nb ? 1 : 0;
}

/**
 * Direction-independent ordering for the {@link MISSING_LAST} sentinel: a real
 * value always precedes a missing one, and two missing values tie (the id
 * tiebreak then groups them deterministically). Returns `undefined` when neither
 * side is missing, so the caller falls through to {@link compareScalar}.
 */
function missingBias(a: SortScalar, b: SortScalar): number | undefined {
  const am = a === MISSING_LAST;
  const bm = b === MISSING_LAST;
  if (am && bm) return 0;
  if (am) return 1; // a missing → a sorts after b
  if (bm) return -1; // b missing → a sorts before b
  return undefined;
}

/**
 * Stable multi-column sort. Applies `sorts` in priority order; ties on every
 * key fall back to the holding id for a fully deterministic, stable order.
 * Returns a new array; the input is not mutated.
 */
export function sortHoldingRows(
  rows: readonly HoldingRow[],
  sorts: readonly HoldingSort[],
): HoldingRow[] {
  const out = [...rows];
  if (sorts.length === 0) return out;
  out.sort((ra, rb) => {
    for (const { key, direction } of sorts) {
      const va = sortValue(ra, key);
      const vb = sortValue(rb, key);
      // Missing values are pinned to the bottom independent of direction, so the
      // asc/desc flip never lifts a "—" row above real data.
      const bias = missingBias(va, vb);
      if (bias !== undefined) {
        if (bias !== 0) return bias;
        continue; // both missing on this key → fall through to the next key / id
      }
      const cmp = compareScalar(va, vb);
      if (cmp !== 0) return direction === "asc" ? cmp : -cmp;
    }
    // Deterministic tiebreak so the order is total and stable across engines.
    return ra.id < rb.id ? -1 : ra.id > rb.id ? 1 : 0;
  });
  return out;
}

/* ------------------------------------------------------------------------- */
/* Composed view                                                             */
/* ------------------------------------------------------------------------- */

/** The full request describing a holdings-index view. */
export interface HoldingsQuery {
  readonly search?: string;
  readonly filter?: HoldingColumnFilter;
  readonly sort?: readonly HoldingSort[];
}

/** Summary totals over a *visible* row set, in the base currency. */
export interface HoldingsSummary {
  /** Number of visible rows. */
  readonly count: number;
  /** Summed current value of the visible rows (base currency). */
  readonly totalValue: number;
  /** Summed cost basis of the visible rows (base currency). */
  readonly totalCost: number;
  /** Summed unrealized gain of the visible rows (base currency). */
  readonly totalGain: number;
  /** Summed weight of the visible rows, in [0, 1]. */
  readonly totalWeight: number;
}

/** The materialized holdings-index view: visible rows + their summary. */
export interface HoldingsView {
  /** Rows after search → filter → sort. */
  readonly rows: HoldingRow[];
  /** Totals over {@link rows}. */
  readonly summary: HoldingsSummary;
  /** Base currency every figure is expressed in. */
  readonly baseCurrency: string;
}

/**
 * Resolve a {@link HoldingsQuery} against a portfolio into a {@link HoldingsView}.
 *
 * The pipeline is deterministic and order-fixed: build rows → search → column
 * filter → sort → summarize. Each stage is a pure function exported above, so
 * the page and the unit tests share exactly the same logic.
 */
export function buildHoldingsView(
  portfolio: Portfolio,
  fxTable: FxRateTable,
  query: HoldingsQuery = {},
): HoldingsView {
  const all = buildHoldingRows(portfolio, fxTable);
  const searched = searchHoldingRows(all, query.search ?? "");
  const filtered = filterHoldingRows(searched, query.filter ?? {});
  const sorted = sortHoldingRows(filtered, query.sort ?? []);
  return {
    rows: sorted,
    summary: summarizeRows(sorted),
    baseCurrency: portfolio.baseCurrency,
  };
}

/** Summarize a visible row set into {@link HoldingsSummary} totals. */
export function summarizeRows(rows: readonly HoldingRow[]): HoldingsSummary {
  let totalValue = new Decimal(0);
  let totalCost = new Decimal(0);
  let totalGain = new Decimal(0);
  let totalWeight = new Decimal(0);
  for (const r of rows) {
    totalValue = totalValue.plus(r.value);
    totalCost = totalCost.plus(r.costBasis);
    totalGain = totalGain.plus(r.gain);
    totalWeight = totalWeight.plus(r.weight);
  }
  return {
    count: rows.length,
    totalValue: totalValue.toNumber(),
    totalCost: totalCost.toNumber(),
    totalGain: totalGain.toNumber(),
    totalWeight: totalWeight.toNumber(),
  };
}

/** Distinct asset classes present across a row set, in display-label order. */
export function distinctAssetClasses(rows: readonly HoldingRow[]): AssetClass[] {
  const seen = new Set<AssetClass>();
  for (const r of rows) seen.add(r.assetClass);
  return [...seen].sort((a, b) =>
    assetClassLabel(a).localeCompare(assetClassLabel(b)),
  );
}

/** Distinct native currencies present across a row set, sorted. */
export function distinctCurrencies(rows: readonly HoldingRow[]): string[] {
  const seen = new Set<string>();
  for (const r of rows) seen.add(r.currency);
  return [...seen].sort();
}
