import { Decimal } from "decimal.js";

import {
  LOT_METHOD_LABEL,
  type Ledger,
  type LotMethod,
  type OpenLotPosition,
  type RealizedSummary,
  openLots,
  realizeGains,
} from "@/lib/taxlots";

/**
 * View-model helpers for the tax-lot explorer page. Kept separate from the
 * React component so the formatting/derivation logic is unit-testable without a
 * DOM.
 */

export { LOT_METHOD_LABEL };

/** Ordered list of methods for the page's method selector. */
export const LOT_METHODS: LotMethod[] = ["fifo", "lifo", "hifo", "spec-id"];

/** A short description of what each method does, for the page. */
export const LOT_METHOD_BLURB: Record<LotMethod, string> = {
  fifo: "Sell the oldest lots first.",
  lifo: "Sell the newest lots first.",
  hifo: "Sell the highest-cost lots first — minimizes realized gain.",
  "spec-id": "Sell explicitly chosen lots.",
};

/** Money rows the page renders, pre-formatted as `$` strings. */
export interface TaxLotRow {
  lotId: string;
  symbol: string;
  acquiredOn: string;
  quantity: string;
  basis: string;
  marketValue: string;
  unrealizedGain: string;
  unrealizedGainSign: Sign;
  holdingPeriod: "short" | "long" | "—";
}

/** Sign of a gain, for coloring. */
export type Sign = "positive" | "negative" | "zero";

export interface TaxLotViewModel {
  method: LotMethod;
  methodLabel: string;
  methodBlurb: string;
  currency: string;
  /** Open lots with unrealized gains. */
  rows: TaxLotRow[];
  /** Realized totals. */
  realized: {
    proceeds: string;
    basis: string;
    gain: string;
    gainSign: Sign;
    shortTermGain: string;
    shortTermSign: Sign;
    longTermGain: string;
    longTermSign: Sign;
  };
  /** Per-disposal detail rows. */
  disposals: {
    id: string;
    symbol: string;
    disposedOn: string;
    quantity: string;
    proceeds: string;
    basis: string;
    gain: string;
    gainSign: Sign;
    slices: {
      lotId: string;
      acquiredOn: string;
      quantity: string;
      gain: string;
      gainSign: Sign;
      holdingPeriod: "short" | "long";
    }[];
  }[];
  /** Aggregate unrealized gain across open lots. */
  unrealizedGain: string;
  unrealizedSign: Sign;
}

function signOf(amount: string): Sign {
  // Check zero (including negative zero like "-0" / "-0.00") before sign, so a
  // signed-but-zero amount is classified as zero rather than negative.
  if (/^-?0(\.0+)?$/.test(amount)) return "zero";
  if (amount.startsWith("-")) return "negative";
  return "positive";
}

/**
 * Format a decimal-string amount as a localized currency string.
 *
 * The amount is kept as an exact {@link Decimal} (never parsed through a JS
 * float — see AGENTS.md: never floating-point currency). We round to the
 * currency's minor-unit precision with Decimal, group the integer digits, then
 * splice those exact digits into the locale's currency template (symbol +
 * placement) obtained from `Intl.NumberFormat.formatToParts`.
 */
export function formatMoney(amount: string, currency: string): string {
  const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency });
  const fractionDigits = fmt.resolvedOptions().maximumFractionDigits ?? 2;

  const value = new Decimal(amount).toDecimalPlaces(
    fractionDigits,
    Decimal.ROUND_HALF_UP,
  );
  const negative = value.isNegative() && !value.isZero();
  const abs = value.abs();
  const fixed = abs.toFixed(fractionDigits);
  const [whole, frac] = fixed.split(".");
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const digits = frac ? `${groupedWhole}.${frac}` : groupedWhole;

  // Render a sentinel number once to learn the locale's symbol + layout, then
  // swap in our exact digits. Use 0 so the template has no grouping/sign noise.
  const parts = fmt.formatToParts(0);
  let out = "";
  for (const part of parts) {
    if (part.type === "integer" || part.type === "decimal" || part.type === "fraction") {
      // Replace the whole numeric run in one shot at the first integer part.
      if (part.type === "integer") out += digits;
      // Skip the template's own decimal/fraction parts — our `digits` already
      // contains them.
    } else if (part.type === "minusSign") {
      // Ignore the template sign; we add our own below.
    } else {
      out += part.value;
    }
  }
  return negative ? `-${out}` : out;
}

/** Format a signed currency amount with an explicit leading sign. */
export function formatSigned(amount: string, currency: string): string {
  const base = formatMoney(amount.replace(/^-/, ""), currency);
  const sign = signOf(amount);
  if (sign === "negative") return `−${base}`;
  if (sign === "zero") return base;
  return `+${base}`;
}

/** Format a holding period for display. */
export function formatHoldingPeriod(p: "short" | "long" | "—"): string {
  if (p === "short") return "Short-term";
  if (p === "long") return "Long-term";
  return "—";
}

/**
 * Build the full view model for a ledger under a selection method, valued
 * against `prices` as of `asOf`. Pure.
 */
export function buildViewModel(
  ledger: Ledger,
  method: LotMethod,
  options: { prices?: Record<string, string>; asOf?: string } = {},
): TaxLotViewModel {
  const realized: RealizedSummary = realizeGains(ledger, method);
  const positions: OpenLotPosition[] = openLots(ledger, method, options);

  const rows: TaxLotRow[] = positions.map((p) => {
    const basis = p.basis.amount.toFixed();
    const mv = p.marketValue?.amount.toFixed() ?? "0";
    const ug = p.unrealizedGain?.amount.toFixed() ?? "0";
    return {
      lotId: p.lotId,
      symbol: p.symbol,
      acquiredOn: p.acquiredOn,
      quantity: p.quantity,
      basis: formatMoney(basis, ledger.currency),
      marketValue: p.marketValue
        ? formatMoney(mv, ledger.currency)
        : "—",
      unrealizedGain: p.unrealizedGain
        ? formatSigned(ug, ledger.currency)
        : "—",
      unrealizedGainSign: p.unrealizedGain ? signOf(ug) : "zero",
      holdingPeriod: p.holdingPeriod ?? "—",
    };
  });

  const totalUnrealized = positions.reduce(
    (acc, p) =>
      p.unrealizedGain ? acc.plus(p.unrealizedGain.amount) : acc,
    realized.gain.amount.times(0),
  );

  return {
    method,
    methodLabel: LOT_METHOD_LABEL[method],
    methodBlurb: LOT_METHOD_BLURB[method],
    currency: ledger.currency,
    rows,
    realized: {
      proceeds: formatMoney(realized.proceeds.amount.toFixed(), ledger.currency),
      basis: formatMoney(realized.basis.amount.toFixed(), ledger.currency),
      gain: formatSigned(realized.gain.amount.toFixed(), ledger.currency),
      gainSign: signOf(realized.gain.amount.toFixed()),
      shortTermGain: formatSigned(
        realized.shortTermGain.amount.toFixed(),
        ledger.currency,
      ),
      shortTermSign: signOf(realized.shortTermGain.amount.toFixed()),
      longTermGain: formatSigned(
        realized.longTermGain.amount.toFixed(),
        ledger.currency,
      ),
      longTermSign: signOf(realized.longTermGain.amount.toFixed()),
    },
    disposals: realized.disposals.map((d) => ({
      id: d.disposalId,
      symbol: d.symbol,
      disposedOn: d.disposedOn,
      quantity: d.quantity,
      proceeds: formatMoney(d.proceeds.amount.toFixed(), ledger.currency),
      basis: formatMoney(d.basis.amount.toFixed(), ledger.currency),
      gain: formatSigned(d.gain.amount.toFixed(), ledger.currency),
      gainSign: signOf(d.gain.amount.toFixed()),
      slices: d.slices.map((s) => ({
        lotId: s.lotId,
        acquiredOn: s.acquiredOn,
        quantity: s.quantity,
        gain: formatSigned(s.gain.amount.toFixed(), ledger.currency),
        gainSign: signOf(s.gain.amount.toFixed()),
        holdingPeriod: s.holdingPeriod,
      })),
    })),
    unrealizedGain: formatSigned(totalUnrealized.toFixed(), ledger.currency),
    unrealizedSign: signOf(totalUnrealized.toFixed()),
  };
}
