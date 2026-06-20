import { Decimal } from "decimal.js";

import { Money } from "../money";

import {
  type ConcentrationBook,
  type LiquidityTier,
  LIQUIDITY_TIERS,
  type Position,
  type Sector,
  sectorLabel,
} from "./model";

/**
 * Concentration & single-name risk engine (unit m11-concentration-risk).
 *
 * Turns a {@link ConcentrationBook} into the numbers a family-office risk
 * monitor surfaces:
 *  - the largest *single names* as a share of net worth, **with look-through**
 *    (a fund's value is rolled down to the underlying names by constituent
 *    weight, and the same name held directly and inside several funds is
 *    summed);
 *  - single-*issuer* and *sector* concentration;
 *  - the *illiquid* share of the book.
 *
 * The oracle (non-negotiable, see AGENTS.md): every roll-up must *reconcile*.
 * The sum of all single-name look-through exposures (including the residual
 * diversified bucket from each fund's un-modelled tail) equals the book's total
 * net worth, exactly, in {@link Decimal}. Sector totals reconcile to the total
 * too. This is asserted in the unit tests and exposed as {@link reconciles}.
 *
 * All arithmetic runs in {@link Decimal} via {@link Money}; only the final
 * render boundary turns a weight into a `number`. Pure, deterministic and
 * React-free so it unit-tests in isolation.
 */

/** A synthetic issuer id for a fund's un-modelled long tail. */
export const RESIDUAL_ISSUER_ID = "__residual_diversified__";

/** One single name's look-through exposure across the whole book. */
export interface SingleNameExposure {
  issuerId: string;
  name: string;
  sector: Sector;
  /** Total look-through value of this name across all positions. */
  value: Money;
  /** Share of net worth, in [0, 1]. */
  weight: number;
  /** True when this is the synthetic residual-diversified bucket. */
  residual: boolean;
  /** Per-source attribution; sums to {@link value}. */
  sources: NameSource[];
}

/** Where one slice of a single name's exposure came from. */
export interface NameSource {
  positionId: string;
  positionName: string;
  /** "direct" or the fund's weight of this name. */
  via: "direct" | "fund";
  /** Look-through value contributed by this source. */
  value: Money;
}

/** One issuer's look-through exposure (a single name, named for clarity). */
export interface IssuerExposure {
  issuerId: string;
  name: string;
  value: Money;
  weight: number;
}

/** One sector's look-through exposure. */
export interface SectorExposure {
  sector: Sector;
  label: string;
  value: Money;
  weight: number;
}

/** One liquidity tier's share of the book. */
export interface LiquidityExposure {
  tier: LiquidityTier;
  value: Money;
  weight: number;
}

/** The full concentration report for a book. */
export interface ConcentrationReport {
  bookId: string;
  bookName: string;
  currency: string;
  /** Total net worth (sum of all position market values). */
  total: Money;
  /** Single names by look-through value, descending. Includes residual bucket. */
  singleNames: SingleNameExposure[];
  /** Issuers (single names) by value, descending, residual excluded. */
  issuers: IssuerExposure[];
  /** Sectors by value, descending. */
  sectors: SectorExposure[];
  /** Liquidity tiers in canonical order. */
  liquidity: LiquidityExposure[];
  /** Illiquid value and its share of net worth. */
  illiquid: { value: Money; weight: number };
  /** The single most concentrated *real* name (residual excluded), if any. */
  topName: SingleNameExposure | null;
  /** Herfindahl-Hirschman index over real single names, in [0, 1]. */
  hhi: number;
  /**
   * True when every roll-up reconciles to {@link total} exactly (the oracle).
   * Always true for a well-formed book; surfaced so callers/tests can assert.
   */
  reconciles: boolean;
}

interface NameAcc {
  issuerId: string;
  name: string;
  sector: Sector;
  residual: boolean;
  total: Decimal;
  sources: NameSource[];
}

function positionValue(p: Position): Decimal {
  return Money.of(p.value.amount, p.value.currency).amount;
}

/**
 * Roll a single position down to its underlying single-name slices, in the
 * book's base currency. A direct position is one slice (itself). A fund is one
 * slice per constituent (`value × weight`) plus a residual-diversified slice
 * for any weight the constituents do not cover — so the slices of a fund always
 * sum back to the fund's whole value, exactly.
 */
function lookThroughPosition(p: Position): {
  issuerId: string;
  name: string;
  sector: Sector;
  residual: boolean;
  value: Decimal;
  via: "direct" | "fund";
}[] {
  const whole = positionValue(p);
  if (p.kind === "direct") {
    return [
      {
        issuerId: p.issuerId,
        name: p.name,
        sector: p.sector,
        residual: false,
        value: whole,
        via: "direct",
      },
    ];
  }
  const slices: {
    issuerId: string;
    name: string;
    sector: Sector;
    residual: boolean;
    value: Decimal;
    via: "direct" | "fund";
  }[] = [];
  let modelled = new Decimal(0);
  for (const c of p.constituents) {
    // value × weight, kept in Decimal.
    const v = whole.times(new Decimal(c.weight));
    modelled = modelled.plus(v);
    slices.push({
      issuerId: c.issuerId,
      name: c.name,
      sector: c.sector,
      residual: false,
      value: v,
      via: "fund",
    });
  }
  // Residual = whole − modelled. Compute as a subtraction (not Σweight) so the
  // slices reconcile to `whole` to the last unit regardless of weight slop.
  const residual = whole.minus(modelled);
  if (residual.greaterThan(0)) {
    slices.push({
      issuerId: `${RESIDUAL_ISSUER_ID}:${p.id}`,
      name: `${p.name} — diversified tail`,
      sector: "diversified",
      residual: true,
      value: residual,
      via: "fund",
    });
  }
  return slices;
}

/** Sort a list of `{ value: Decimal }` desc, ties broken by id for stability. */
function byValueDesc<T extends { value: Decimal; key: string }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    const cmp = b.value.comparedTo(a.value);
    if (cmp !== 0) return cmp;
    return a.key.localeCompare(b.key);
  });
}

/**
 * Analyse a book into a full {@link ConcentrationReport}. Pure and
 * deterministic. The single-name, issuer and sector roll-ups all reconcile to
 * the book total exactly (the oracle), with residual-diversified buckets
 * absorbing each fund's un-modelled tail.
 */
export function analyzeConcentration(
  book: ConcentrationBook,
): ConcentrationReport {
  const currency = book.baseCurrency;

  // 1) Total net worth = Σ position values.
  let total = new Decimal(0);
  for (const p of book.positions) total = total.plus(positionValue(p));

  // 2) Single-name look-through roll-up (residual-aware).
  const nameAcc = new Map<string, NameAcc>();
  const sectorAcc = new Map<Sector, Decimal>();
  for (const p of book.positions) {
    for (const slice of lookThroughPosition(p)) {
      const acc =
        nameAcc.get(slice.issuerId) ??
        ({
          issuerId: slice.issuerId,
          name: slice.name,
          sector: slice.sector,
          residual: slice.residual,
          total: new Decimal(0),
          sources: [],
        } satisfies NameAcc);
      acc.total = acc.total.plus(slice.value);
      acc.sources.push({
        positionId: p.id,
        positionName: p.name,
        via: slice.via,
        value: Money.of(slice.value, currency),
      });
      nameAcc.set(slice.issuerId, acc);

      const sPrev = sectorAcc.get(slice.sector) ?? new Decimal(0);
      sectorAcc.set(slice.sector, sPrev.plus(slice.value));
    }
  }

  const weightOf = (v: Decimal): number =>
    total.isZero() ? 0 : v.div(total).toNumber();

  // 3) Single names, descending.
  const singleNames: SingleNameExposure[] = byValueDesc(
    [...nameAcc.values()].map((a) => ({ ...a, key: a.issuerId, value: a.total })),
  ).map((a) => ({
    issuerId: a.issuerId,
    name: a.name,
    sector: a.sector,
    value: Money.of(a.total, currency),
    weight: weightOf(a.total),
    residual: a.residual,
    sources: [...a.sources].sort((x, y) =>
      y.value.amount.comparedTo(x.value.amount),
    ),
  }));

  // 4) Issuers = single names with the residual buckets removed.
  const issuers: IssuerExposure[] = singleNames
    .filter((n) => !n.residual)
    .map((n) => ({
      issuerId: n.issuerId,
      name: n.name,
      value: n.value,
      weight: n.weight,
    }));

  // 5) Sectors, descending.
  const sectors: SectorExposure[] = byValueDesc(
    [...sectorAcc.entries()].map(([sector, value]) => ({
      sector,
      value,
      key: sector,
    })),
  ).map((s) => ({
    sector: s.sector,
    label: sectorLabel(s.sector),
    value: Money.of(s.value, currency),
    weight: weightOf(s.value),
  }));

  // 6) Liquidity tiers (position-level; funds inherit their own tier).
  const liqAcc = new Map<LiquidityTier, Decimal>();
  for (const tier of LIQUIDITY_TIERS) liqAcc.set(tier, new Decimal(0));
  for (const p of book.positions) {
    liqAcc.set(p.liquidity, liqAcc.get(p.liquidity)!.plus(positionValue(p)));
  }
  const liquidity: LiquidityExposure[] = LIQUIDITY_TIERS.map((tier) => {
    const v = liqAcc.get(tier)!;
    return { tier, value: Money.of(v, currency), weight: weightOf(v) };
  });
  const illiquidVal = liqAcc.get("illiquid")!;
  const illiquid = {
    value: Money.of(illiquidVal, currency),
    weight: weightOf(illiquidVal),
  };

  // 7) HHI over real single names (a diversification scalar in [0, 1]).
  let hhi = 0;
  if (!total.isZero()) {
    for (const n of issuers) hhi += n.weight * n.weight;
  }

  // 8) Reconciliation (the oracle): every roll-up sums back to total.
  const reconciles = checkReconciliation(total, singleNames, sectors, liquidity);

  return {
    bookId: book.id,
    bookName: book.name,
    currency,
    total: Money.of(total, currency),
    singleNames,
    issuers,
    sectors,
    liquidity,
    illiquid,
    topName: issuers.length > 0 ? (singleNames.find((n) => !n.residual) ?? null) : null,
    hhi,
    reconciles,
  };
}

function sumDecimals(values: Decimal[]): Decimal {
  return values.reduce((acc, v) => acc.plus(v), new Decimal(0));
}

/**
 * The oracle check: the single-name, sector and liquidity roll-ups each sum
 * back to the book total, exactly. Returns false on any mismatch so a caller or
 * test can fail loudly rather than render a silently-wrong picture.
 */
function checkReconciliation(
  total: Decimal,
  singleNames: SingleNameExposure[],
  sectors: SectorExposure[],
  liquidity: LiquidityExposure[],
): boolean {
  const nameSum = sumDecimals(singleNames.map((n) => n.value.amount));
  const sectorSum = sumDecimals(sectors.map((s) => s.value.amount));
  const liqSum = sumDecimals(liquidity.map((l) => l.value.amount));
  return (
    nameSum.equals(total) && sectorSum.equals(total) && liqSum.equals(total)
  );
}
