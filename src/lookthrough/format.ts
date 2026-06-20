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
  // Unit tiers from largest to smallest. Pick the tier by raw magnitude, then
  // guard the boundary: if rounding the mantissa to the tier's precision lands
  // on 1000 (e.g. 999,950 → "1000.0K"), promote to the next tier up so it reads
  // "1M" rather than overflowing the current unit.
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
    // Would this round up to a full thousand of this unit? If so and there is a
    // larger tier, fall through to it; otherwise keep it (e.g. trillions in B).
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
