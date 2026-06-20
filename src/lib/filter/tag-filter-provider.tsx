import * as React from "react";

import type { Portfolio } from "@/lib/model/portfolio";

import { availableTags, reconcileSelection } from "./holding-filter";
import { readStoredSelection, writeStoredSelection } from "./storage";
import {
  TagFilterContext,
  type TagFilterContextValue,
} from "./tag-filter-context";

/**
 * Provider component for the global holding-tag filter.
 *
 * Mounted once at the app root, it owns the shared selected-tag state: seeded
 * from `localStorage`, reconciled against the source portfolio's available tags
 * (a persisted tag the data no longer has is dropped), and persisted on change.
 * Consumers read it via the hooks in `./tag-filter-context`. READ-ONLY product:
 * the filter only changes what is shown, never the underlying holdings.
 */

export interface TagFilterProviderProps {
  /** The source (unfiltered) portfolio the filter operates over. */
  portfolio: Portfolio;
  children: React.ReactNode;
}

export function TagFilterProvider({
  portfolio,
  children,
}: TagFilterProviderProps) {
  const available = React.useMemo(() => availableTags(portfolio), [portfolio]);

  const [selected, setSelected] = React.useState<ReadonlySet<string>>(
    () => new Set(reconcileSelection(portfolio, readStoredSelection())),
  );

  // Persist on every change. The selection only ever holds tags that exist in
  // the portfolio, so what we store is always reconcilable.
  React.useEffect(() => {
    writeStoredSelection(selected);
  }, [selected]);

  const toggle = React.useCallback((tag: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }, []);

  const setSelection = React.useCallback(
    (tags: Iterable<string>) => {
      // Only keep tags that exist in the source portfolio.
      const present = new Set(available);
      setSelected(new Set([...tags].filter((t) => present.has(t))));
    },
    [available],
  );

  const clear = React.useCallback(() => setSelected(new Set()), []);

  const value = React.useMemo<TagFilterContextValue>(
    () => ({
      available,
      selected,
      isFiltering: selected.size > 0,
      toggle,
      setSelection,
      clear,
    }),
    [available, selected, toggle, setSelection, clear],
  );

  return (
    <TagFilterContext.Provider value={value}>
      {children}
    </TagFilterContext.Provider>
  );
}

export default TagFilterProvider;
