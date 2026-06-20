import * as React from "react";

import type { Portfolio } from "@/lib/model/portfolio";

import { filterPortfolioByTags } from "./holding-filter";

/**
 * Shared state and hooks for the global holding-tag filter.
 *
 * The React context object and its consumer hooks live here (no components) so
 * the provider component file stays component-only and Fast Refresh works. A
 * single {@link import("./tag-filter-provider").TagFilterProvider} mounted at
 * the app root owns the selected tags; every page reads them through
 * {@link useTagFilter} (or {@link useFilteredPortfolio}) so the same filter
 * narrows the portfolio across every route. READ-ONLY product: the filter only
 * changes what is shown, never the underlying holdings.
 */

export interface TagFilterContextValue {
  /** All tags present across the source portfolio, sorted for display. */
  readonly available: readonly string[];
  /** The currently selected tags (subset of {@link available}). */
  readonly selected: ReadonlySet<string>;
  /** Whether any tag is selected (i.e. the book is being narrowed). */
  readonly isFiltering: boolean;
  /** Toggle a single tag in/out of the selection. */
  toggle: (tag: string) => void;
  /** Replace the whole selection. */
  setSelection: (tags: Iterable<string>) => void;
  /** Clear the filter (show the whole book). */
  clear: () => void;
}

export const TagFilterContext =
  React.createContext<TagFilterContextValue | null>(null);

/**
 * Read the shared tag-filter state. Throws if used outside a
 * `TagFilterProvider`, so a missing provider is caught immediately rather than
 * silently no-op'ing the filter.
 */
export function useTagFilter(): TagFilterContextValue {
  const ctx = React.useContext(TagFilterContext);
  if (!ctx) {
    throw new Error("useTagFilter must be used within a <TagFilterProvider>");
  }
  return ctx;
}

/**
 * Read the shared tag-filter state without requiring a provider. Returns `null`
 * when there is no `TagFilterProvider` above (e.g. an isolated render of a shell
 * page in a unit test). The
 * {@link import("@/components/TagFilter").TagFilter} control uses this so it can
 * degrade to rendering nothing instead of throwing.
 */
export function useOptionalTagFilter(): TagFilterContextValue | null {
  return React.useContext(TagFilterContext);
}

/**
 * Convenience hook: narrow the supplied portfolio by the active tag selection.
 *
 * Pass the source portfolio a page already renders; with no tags selected this
 * returns the exact same reference (no allocation, no re-render churn), so pages
 * that opt in pay nothing until the user actually filters.
 */
export function useFilteredPortfolio(source: Portfolio): Portfolio {
  const { selected } = useTagFilter();
  return React.useMemo(
    () => filterPortfolioByTags(source, selected),
    [source, selected],
  );
}
