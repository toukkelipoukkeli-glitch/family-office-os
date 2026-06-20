import { Money } from "@/lib/money";

/** Format a weight fraction (0..1) as a percentage string. */
export function formatPct(fraction: number, fractionDigits = 1): string {
  return `${(fraction * 100).toFixed(fractionDigits)}%`;
}

/**
 * Compact currency formatting kept in {@link Money} / Decimal until the final
 * render step (AGENTS.md money rule: never float-divide currency for display).
 * Mirrors the risk cockpit / look-through formatters so the pages read alike.
 */
export function formatMoneyCompact(money: Money): string {
  const n = money.amount;
  const abs = n.abs();
  const tiers: { div: number; dp: number; suffix: string }[] = [
    { div: 1_000_000_000, dp: 2, suffix: "B" },
    { div: 1_000_000, dp: 2, suffix: "M" },
    { div: 1_000, dp: 1, suffix: "K" },
  ];
  let compact: string | undefined;
  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i];
    if (!abs.gte(t.div)) continue;
    const mantissa = n.div(t.div);
    if (mantissa.abs().toDP(t.dp).gte(1000) && i > 0) {
      const up = tiers[i - 1];
      compact = `${n.div(up.div).toFixed(up.dp)}${up.suffix}`;
    } else {
      compact = `${mantissa.toFixed(t.dp)}${t.suffix}`;
    }
    break;
  }
  if (compact === undefined) compact = n.toFixed(0);
  compact = compact
    .replace(/\.00([BMK])$/, "$1")
    .replace(/(\.\d)0([BMK])$/, "$1$2")
    .replace(/\.0([BMK])$/, "$1");
  const symbol = money.currency === "USD" ? "$" : `${money.currency} `;
  return `${symbol}${compact}`;
}
