import { Decimal } from "decimal.js";

import {
  CapTable,
  type CapTableEntry,
  type FinancingRound,
  type SecurityClass,
} from "./captable";

/**
 * Pure, deterministic cap-table math. Everything in this module runs through
 * `decimal.js` or `BigInt` so share and money arithmetic stays exact.
 *
 * READ-ONLY product: these functions report ownership and model hypothetical
 * dilution; they never issue real shares or move money.
 */

/** A single holder's stake derived from a cap table. */
export interface OwnershipRow {
  /** Entry id this row came from. */
  id: string;
  /** Holder display name. */
  holder: string;
  /** Security class. */
  securityClass: SecurityClass;
  /** Exact share count. */
  shares: string;
  /**
   * Ownership percent of the fully diluted total, in [0, 100], rounded to 4
   * decimals. Exact-string source so the rounding is the only approximation.
   */
  percent: number;
}

/** Total shares outstanding (fully diluted) as an exact `BigInt`. */
export function totalShares(table: CapTable): bigint {
  return table.entries.reduce((sum, e) => sum + BigInt(e.shares), 0n);
}

/**
 * Per-holder ownership breakdown, sorted by share count descending (ties broken
 * by holder name for determinism). Percentages are computed against the fully
 * diluted total and rounded to 4 decimal places.
 */
export function ownershipBreakdown(table: CapTable): OwnershipRow[] {
  const total = new Decimal(totalShares(table).toString());
  const rows = table.entries.map((e) => ({
    id: e.id,
    holder: e.holder,
    securityClass: e.securityClass,
    shares: e.shares,
    percent: total.isZero()
      ? 0
      : new Decimal(e.shares)
          .div(total)
          .mul(100)
          .toDecimalPlaces(4, Decimal.ROUND_HALF_EVEN)
          .toNumber(),
  }));
  return rows.sort((a, b) => {
    const da = new Decimal(a.shares);
    const db = new Decimal(b.shares);
    if (!da.equals(db)) return db.cmp(da);
    return a.holder.localeCompare(b.holder);
  });
}

/** Sum of ownership percentages by security class, for a class-level donut. */
export function ownershipByClass(
  table: CapTable,
): { securityClass: SecurityClass; shares: string; percent: number }[] {
  const total = new Decimal(totalShares(table).toString());
  const byClass = new Map<SecurityClass, bigint>();
  for (const e of table.entries) {
    byClass.set(e.securityClass, (byClass.get(e.securityClass) ?? 0n) + BigInt(e.shares));
  }
  return [...byClass.entries()]
    .map(([securityClass, shares]) => ({
      securityClass,
      shares: shares.toString(),
      percent: total.isZero()
        ? 0
        : new Decimal(shares.toString())
            .div(total)
            .mul(100)
            .toDecimalPlaces(4, Decimal.ROUND_HALF_EVEN)
            .toNumber(),
    }))
    .sort((a, b) => b.percent - a.percent || a.securityClass.localeCompare(b.securityClass));
}

/** Result of applying a {@link FinancingRound} to a {@link CapTable}. */
export interface RoundResult {
  /** The round that was applied. */
  round: FinancingRound;
  /** Price paid per share, exact decimal string. */
  pricePerShare: string;
  /** New investor shares issued, exact whole-number string. */
  investorShares: string;
  /** Fresh option-pool shares created (0 if no pool top-up), exact string. */
  newPoolShares: string;
  /** Post-money valuation = pre-money + investment, exact decimal string. */
  postMoneyValuation: string;
  /** The resulting post-round cap table. */
  table: CapTable;
  /** Investor ownership percent of the post-round table, rounded to 4 dp. */
  investorPercent: number;
}

/**
 * Apply a priced financing round and return the post-round cap table plus
 * derived metrics. Standard VC dilution math:
 *
 *  1. Optionally enlarge the option pool to `optionPoolPercent` of the
 *     post-round fully diluted shares, carving the new pool out *pre-money* so
 *     it dilutes existing holders (the "pool shuffle").
 *  2. Price per share = pre-money / (pre-money fully diluted shares incl. the
 *     enlarged pool).
 *  3. Investor shares = round(investment / price-per-share).
 *
 * Share counts are issued as whole shares (rounded half-up); the tiny rounding
 * is reported exactly rather than hidden. Pure — the input table is not
 * mutated.
 */
export function applyRound(table: CapTable, round: FinancingRound): RoundResult {
  const preShares = new Decimal(totalShares(table).toString());
  const pre = new Decimal(round.preMoneyValuation);
  const investment = new Decimal(round.investment);
  const post = pre.add(investment);

  // 1. Option pool top-up (carved pre-money). Solve for pool shares P such that
  //    (existingPool + P) / (preShares + P + investorShares) = poolPct.
  //    Investor shares depend on price, which depends on the enlarged pre-money
  //    share count, which includes P — so we solve the system directly.
  //
  // Let:
  //   S0 = current shares, E = current option/warrant pool shares
  //   f  = investment / pre-money  (investor fraction of post-money)
  //   p  = target pool fraction of post-money fully diluted
  // Post-money FD total T satisfies:  preFD = S0 + P (the enlarged pre-money base)
  //   investorShares = preFD * f
  //   T = preFD * (1 + f)
  //   (E + P) / T = p  =>  E + P = p * (S0 + P) * (1 + f)
  // Solve for P:
  //   E + P = p(1+f)S0 + p(1+f)P
  //   P (1 - p(1+f)) = p(1+f)S0 - E
  //   P = (p(1+f)S0 - E) / (1 - p(1+f))
  const f = investment.div(pre);
  let newPoolShares = new Decimal(0);
  if (round.optionPoolPercent != null && round.optionPoolPercent > 0) {
    const p = new Decimal(round.optionPoolPercent).div(100);
    const existingPool = new Decimal(
      table.entries
        .filter((e) => e.securityClass === "option" || e.securityClass === "warrant")
        .reduce((sum, e) => sum + BigInt(e.shares), 0n)
        .toString(),
    );
    const pf = p.mul(new Decimal(1).add(f));
    const denom = new Decimal(1).sub(pf);
    if (denom.gt(0)) {
      const raw = pf.mul(preShares).sub(existingPool).div(denom);
      if (raw.gt(0)) {
        newPoolShares = raw.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
      }
    }
  }

  // 2. Pre-money fully diluted base (existing + fresh pool).
  const preFd = preShares.add(newPoolShares);

  // 3. Price per share off the enlarged pre-money base.
  const pricePerShare = pre.div(preFd);

  // 4. Investor shares (whole shares, rounded half-up).
  const investorShares = investment
    .div(pricePerShare)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

  const newEntries: CapTableEntry[] = [...table.entries];
  if (newPoolShares.gt(0)) {
    newEntries.push({
      id: `${round.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-pool`,
      holder: `${round.name} Option Pool`,
      securityClass: "option",
      shares: newPoolShares.toFixed(0),
    });
  }
  newEntries.push({
    id: `${round.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-investor`,
    holder: `${round.name} Investors`,
    securityClass: "preferred",
    shares: investorShares.toFixed(0),
  });

  const postTable = CapTable.parse({
    companyId: table.companyId,
    companyName: table.companyName,
    currency: table.currency,
    entries: newEntries,
  });

  const postTotal = new Decimal(totalShares(postTable).toString());
  const investorPercent = postTotal.isZero()
    ? 0
    : investorShares
        .div(postTotal)
        .mul(100)
        .toDecimalPlaces(4, Decimal.ROUND_HALF_EVEN)
        .toNumber();

  return {
    round,
    pricePerShare: pricePerShare.toDecimalPlaces(6, Decimal.ROUND_HALF_EVEN).toString(),
    investorShares: investorShares.toFixed(0),
    newPoolShares: newPoolShares.toFixed(0),
    postMoneyValuation: post.toString(),
    table: postTable,
    investorPercent,
  };
}

/**
 * The dilution each existing holder experiences from a round: their ownership
 * percent before vs. after, and the percentage-point delta (always <= 0 for
 * existing holders). Holders new to the post-round table are omitted.
 */
export function dilutionImpact(
  before: CapTable,
  result: RoundResult,
): { holder: string; beforePercent: number; afterPercent: number; deltaPercent: number }[] {
  const beforeRows = new Map(
    ownershipBreakdown(before).map((r) => [r.id, r.percent]),
  );
  const afterRows = new Map(
    ownershipBreakdown(result.table).map((r) => [r.id, r.percent]),
  );
  return before.entries.map((e) => {
    const beforePercent = beforeRows.get(e.id) ?? 0;
    const afterPercent = afterRows.get(e.id) ?? 0;
    const delta = new Decimal(afterPercent)
      .sub(beforePercent)
      .toDecimalPlaces(4, Decimal.ROUND_HALF_EVEN)
      .toNumber();
    return {
      holder: e.holder,
      beforePercent,
      afterPercent,
      deltaPercent: delta,
    };
  });
}
