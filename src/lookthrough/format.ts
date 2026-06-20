import { Money } from "@/lib/money";

/** Format an ownership/weight fraction (0..1) as a percentage string. */
export function formatPct(fraction: number): string {
  const pct = fraction * 100;
  const rounded = Math.round(pct * 100) / 100;
  return `${
    Number.isInteger(rounded)
      ? rounded.toString()
      : rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")
  }%`;
}

/**
 * Compact currency formatting kept in {@link Money} / Decimal until the very
 * last step (AGENTS.md money rule: never float-divide currency for display).
 */
export function formatMoneyCompact(money: Money): string {
  const n = money.amount;
  const abs = n.abs();
  let compact: string;
  if (abs.gte(1_000_000_000)) compact = `${n.div(1_000_000_000).toFixed(2)}B`;
  else if (abs.gte(1_000_000)) compact = `${n.div(1_000_000).toFixed(2)}M`;
  else if (abs.gte(1_000)) compact = `${n.div(1_000).toFixed(1)}K`;
  else compact = n.toFixed(0);
  compact = compact
    .replace(/\.00([BMK])$/, "$1")
    .replace(/(\.\d)0([BMK])$/, "$1$2")
    .replace(/\.0([BMK])$/, "$1");
  const symbol = money.currency === "USD" ? "$" : `${money.currency} `;
  return `${symbol}${compact}`;
}
