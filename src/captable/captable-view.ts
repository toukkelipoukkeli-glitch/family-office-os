import {
  type CapTable,
  type FinancingRound,
  type OwnershipRow,
  type SecurityClass,
  applyRound,
  dilutionImpact,
  ownershipBreakdown,
  ownershipByClass,
  totalShares,
} from "@/lib/captable";

/**
 * View-model helpers for the cap table page. Kept separate from the React
 * component so the formatting/derivation logic is unit-testable without a DOM.
 */

/** Human labels for each security class. */
export const SECURITY_CLASS_LABEL: Record<SecurityClass, string> = {
  common: "Common",
  preferred: "Preferred",
  option: "Option pool",
  warrant: "Warrant",
  safe: "SAFE",
};

/** Group an integer with thin separators (e.g. 4500000 -> "4,500,000"). */
export function formatShares(shares: string): string {
  return BigInt(shares).toLocaleString("en-US");
}

/** Format a percent number to at most 2 dp, trimming trailing zeros. */
export function formatPercent(percent: number): string {
  return `${Number(percent.toFixed(2))}%`;
}

/** Format a signed percentage-point delta (e.g. -9 -> "-9 pp", 0 -> "—"). */
export function formatDelta(delta: number): string {
  if (delta === 0) return "—";
  const v = Number(delta.toFixed(2));
  return `${v > 0 ? "+" : ""}${v} pp`;
}

/**
 * Format a decimal-string money amount with thousands separators and the given
 * currency code (e.g. "15000000", "EUR" -> "EUR 15,000,000").
 */
export function formatMoney(amount: string, currency: string): string {
  const [whole, frac] = amount.split(".");
  const grouped = BigInt(whole).toLocaleString("en-US");
  return `${currency} ${frac ? `${grouped}.${frac}` : grouped}`;
}

/** Everything the page needs to render for a given (table, optional round). */
export interface CapTableViewModel {
  companyName: string;
  currency: string;
  totalShares: string;
  rows: OwnershipRow[];
  byClass: { securityClass: SecurityClass; shares: string; percent: number }[];
  round?: {
    name: string;
    investment: string;
    preMoney: string;
    postMoney: string;
    pricePerShare: string;
    investorShares: string;
    investorPercent: number;
    newPoolShares: string;
    dilution: {
      holder: string;
      beforePercent: number;
      afterPercent: number;
      deltaPercent: number;
    }[];
  };
}

/**
 * Build the view model for the base cap table, or — when a round is supplied —
 * for the post-round table plus the dilution breakdown. Pure.
 */
export function buildViewModel(
  base: CapTable,
  round?: FinancingRound,
): CapTableViewModel {
  if (!round) {
    return {
      companyName: base.companyName,
      currency: base.currency,
      totalShares: totalShares(base).toString(),
      rows: ownershipBreakdown(base),
      byClass: ownershipByClass(base),
    };
  }

  const result = applyRound(base, round);
  const dilution = dilutionImpact(base, result);
  return {
    companyName: base.companyName,
    currency: base.currency,
    totalShares: totalShares(result.table).toString(),
    rows: ownershipBreakdown(result.table),
    byClass: ownershipByClass(result.table),
    round: {
      name: round.name,
      investment: round.investment,
      preMoney: round.preMoneyValuation,
      postMoney: result.postMoneyValuation,
      pricePerShare: result.pricePerShare,
      investorShares: result.investorShares,
      investorPercent: result.investorPercent,
      newPoolShares: result.newPoolShares,
      dilution,
    },
  };
}
