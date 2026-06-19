import { Money } from "@/lib/money";
import type { EntityKind } from "@/lib/org";
import type { MoneyValue } from "@/lib/model/primitives";

/** Format an ownership fraction (0..1) as a percentage string. */
export function formatPct(fraction: number): string {
  const pct = fraction * 100;
  // Show up to 2 decimals but trim trailing zeros (60.00 -> 60, 37.50 -> 37.5).
  const rounded = Math.round(pct * 100) / 100;
  return `${Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}%`;
}

/** Format an optional NAV money value as a compact currency string. */
export function formatNav(nav: MoneyValue | undefined): string | null {
  if (!nav) return null;
  const money = Money.of(nav.amount, nav.currency);
  if (money.isZero()) return null;
  // Keep currency math in Decimal; only stringify at the very end so large or
  // precise NAVs are never distorted by float division (AGENTS.md money rule).
  const n = money.amount;
  const abs = n.abs();
  let compact: string;
  if (abs.gte(1_000_000_000)) compact = `${n.div(1_000_000_000).toFixed(1)}B`;
  else if (abs.gte(1_000_000)) compact = `${n.div(1_000_000).toFixed(1)}M`;
  else if (abs.gte(1_000)) compact = `${n.div(1_000).toFixed(0)}K`;
  else compact = n.toFixed(0);
  // Strip trailing ".0" introduced by toFixed(1).
  compact = compact.replace(/\.0([BMK])$/, "$1");
  return `${nav.currency === "USD" ? "$" : `${nav.currency} `}${compact}`;
}

/** Stable fill colour for an entity kind, sourced from theme chart vars. */
export function kindColor(kind: EntityKind): string {
  switch (kind) {
    case "trust":
      return "var(--color-chart-3)";
    case "holding":
      return "var(--color-chart-1)";
    case "operating":
      return "var(--color-chart-2)";
    case "fund":
      return "var(--color-chart-4)";
    case "spv":
      return "var(--color-chart-5)";
    case "foundation":
      return "var(--color-chart-3)";
    case "individual":
      return "var(--color-muted-foreground)";
  }
}
