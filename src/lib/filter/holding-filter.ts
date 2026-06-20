import type { Holding } from "@/lib/model/holding";
import type { Portfolio } from "@/lib/model/portfolio";

/**
 * Pure, offline helpers for the global holding-tag filter.
 *
 * Holdings carry an optional free-text `tags` array (see
 * {@link import("@/lib/model/holding").Holding}). This module turns those tags
 * into a portfolio-wide filter: collect the available tags, and narrow a
 * {@link Portfolio} down to the holdings that match a selected set of tags.
 *
 * The filter is *non-destructive*: it returns a shallow-cloned portfolio whose
 * `holdings` array is a subset of the original holdings (the holding objects
 * themselves are reused, never mutated). Because it only drops whole holdings,
 * it preserves every holding's exact `Decimal`/string money values untouched —
 * money is never re-derived here, so there is no rounding or float boundary to
 * cross. READ-ONLY product: filtering only changes *what is shown*; it never
 * moves money or alters a holding.
 */

/** Selection semantics: a holding matches when it carries ANY selected tag (OR). */
export type TagMatch = "any";

/**
 * Every distinct tag present across the portfolio's holdings, sorted
 * alphabetically (case-insensitive, stable). Tags are compared by their exact
 * stored string; the sort is purely for stable, predictable display order.
 */
export function availableTags(portfolio: Portfolio): string[] {
  const seen = new Set<string>();
  for (const holding of portfolio.holdings) {
    for (const tag of holding.tags) seen.add(tag);
  }
  return [...seen].sort((a, b) =>
    a.localeCompare(b, "en", { sensitivity: "base" }),
  );
}

/**
 * Count of holdings carrying a given tag, for the filter UI's per-tag badges.
 *
 * This counts *holdings*, not raw tag occurrences: the Holding schema does not
 * enforce per-holding tag uniqueness, so a holding may list the same tag twice.
 * Such a holding still contributes exactly one to that tag's count (it is one
 * holding), matching the documented "holdings per tag" semantics.
 */
export function tagCounts(portfolio: Portfolio): Map<string, number> {
  const counts = new Map<string, number>();
  for (const holding of portfolio.holdings) {
    for (const tag of new Set(holding.tags)) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return counts;
}

/** True when a holding carries at least one of the selected tags (OR semantics). */
export function holdingMatchesTags(
  holding: Holding,
  selected: ReadonlySet<string>,
): boolean {
  if (selected.size === 0) return true;
  for (const tag of holding.tags) {
    if (selected.has(tag)) return true;
  }
  return false;
}

/**
 * Narrow a portfolio to the holdings matching the selected tags.
 *
 * An empty selection is the identity filter: the same portfolio reference is
 * returned (no work, no allocation) so the unfiltered path stays a no-op. With a
 * non-empty selection a shallow clone is returned whose `holdings` is the subset
 * matching ANY selected tag; all other fields are carried over unchanged. The
 * holding objects are shared by reference and never mutated.
 */
export function filterPortfolioByTags(
  portfolio: Portfolio,
  selected: ReadonlySet<string>,
): Portfolio {
  if (selected.size === 0) return portfolio;
  return {
    ...portfolio,
    holdings: portfolio.holdings.filter((h) => holdingMatchesTags(h, selected)),
  };
}

/**
 * Drop selected tags that no longer exist in the portfolio, returning a stable
 * (sorted) array. Used so a persisted selection can't pin a tag the data no
 * longer has, which would silently hide the whole book.
 */
export function reconcileSelection(
  portfolio: Portfolio,
  selected: Iterable<string>,
): string[] {
  const present = new Set(availableTags(portfolio));
  const kept = new Set<string>();
  for (const tag of selected) {
    if (present.has(tag)) kept.add(tag);
  }
  return [...kept].sort((a, b) =>
    a.localeCompare(b, "en", { sensitivity: "base" }),
  );
}
