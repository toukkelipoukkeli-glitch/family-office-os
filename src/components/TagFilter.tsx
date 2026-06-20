import * as React from "react";
import { Check, Tag, X } from "lucide-react";

import { useOptionalTagFilter } from "@/lib/filter";
import { FILTER_NA_REASON, filterScopeForPath } from "@/lib/routes";
import { useHashRoute } from "@/lib/use-hash-route";
import { cn } from "@/lib/utils";

export interface TagFilterProps {
  className?: string;
  /** `data-testid` for the trigger button (defaults to `tag-filter`). */
  testId?: string;
  /**
   * Whether the tag filter applies on the current page. When omitted the
   * control derives this from the active hash route via
   * {@link filterScopeForPath}. When `false`, the control renders visibly inert
   * (disabled, with an explanatory tooltip) instead of pretending to narrow —
   * this is how the global filter stays *consistent* across pages: present
   * everywhere, but clearly off where it cannot narrow anything.
   */
  applies?: boolean;
}

/**
 * Global holding-tag filter surfaced in the app chrome.
 *
 * A compact trigger button opens a popover of every tag present in the
 * portfolio; toggling tags narrows the portfolio across every page via the
 * shared {@link useTagFilter} state. The trigger shows the active count so the
 * filter is visible even when the popover is closed. Hidden from print so the
 * control never bleeds into reports.
 *
 * Renders nothing when the portfolio has no tags at all (there is nothing to
 * filter by), so untagged data degrades gracefully.
 *
 * On pages where the filter does not apply (see {@link filterScopeForPath}) the
 * control still renders — for visible consistency — but as a disabled trigger
 * that explains it is inactive here, so the user is never left wondering why
 * selecting tags changed nothing.
 */
export function TagFilter({
  className,
  testId = "tag-filter",
  applies: appliesProp,
}: TagFilterProps) {
  const filter = useOptionalTagFilter();
  const path = useHashRoute();
  // The caller may force the scope (the dashboard always applies); otherwise
  // derive it from the current route.
  const applies = appliesProp ?? filterScopeForPath(path) === "applies";
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  // Close the popover when the filter stops applying (e.g. navigating to an
  // n/a page while it was open) so an inert control can't show a live popover.
  React.useEffect(() => {
    if (!applies) setOpen(false);
  }, [applies]);

  // Close on outside click / Escape.
  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // No provider (e.g. an isolated unit render) or no tags to filter by: render
  // nothing so untagged data and provider-less tests degrade gracefully.
  if (!filter || filter.available.length === 0) return null;

  const { available, selected, isFiltering, toggle, clear } = filter;
  const count = selected.size;

  // Scope = does-not-apply: show a disabled, clearly-inert trigger instead of a
  // working filter. The selection still exists (it persists for pages where it
  // does apply), but here it is presented as off and non-interactive.
  if (!applies) {
    return (
      <div
        ref={rootRef}
        className={cn("relative print:hidden", className)}
        data-testid={`${testId}-root`}
        data-filtering={isFiltering}
        data-applies="false"
      >
        <button
          type="button"
          disabled
          aria-disabled="true"
          data-testid={testId}
          data-applies="false"
          aria-label="Tag filter — not available on this page"
          title={FILTER_NA_REASON}
          className={cn(
            "inline-flex h-9 cursor-not-allowed items-center gap-2 rounded-md border px-2.5",
            "border-dashed border-border text-sm text-muted-foreground/60",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <Tag className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Tags · n/a</span>
          {/* Compact marker so the inert state is legible on mobile too, where
              the full label is hidden. */}
          <span
            aria-hidden="true"
            className="text-[11px] font-medium uppercase tracking-wide sm:hidden"
          >
            n/a
          </span>
        </button>
      </div>
    );
  }
  const label = isFiltering
    ? `Tags · ${count}`
    : "Tags";

  return (
    <div
      ref={rootRef}
      className={cn("relative print:hidden", className)}
      data-testid={`${testId}-root`}
      data-filtering={isFiltering}
      data-applies="true"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-applies="true"
        data-testid={testId}
        data-open={open}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={
          isFiltering
            ? `Filter by tags, ${count} selected`
            : "Filter by tags"
        }
        title="Filter the portfolio by holding tags"
        className={cn(
          "inline-flex h-9 items-center gap-2 rounded-md border px-2.5",
          "text-sm transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isFiltering
            ? "border-primary/40 bg-primary/10 text-foreground"
            : "border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        )}
      >
        <Tag className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">{label}</span>
        {isFiltering && (
          <span
            data-testid={`${testId}-count`}
            className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground sm:hidden"
          >
            {count}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          data-testid={`${testId}-popover`}
          className={cn(
            "absolute right-0 z-50 mt-2 w-60 origin-top-right rounded-md border border-border",
            "bg-popover p-1 text-popover-foreground shadow-lg",
          )}
        >
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Filter by tag
            </span>
            {isFiltering && (
              <button
                type="button"
                onClick={clear}
                data-testid={`${testId}-clear`}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-3 w-3" aria-hidden="true" />
                Clear
              </button>
            )}
          </div>
          <ul className="max-h-72 overflow-auto py-0.5">
            {available.map((tag) => {
              const isOn = selected.has(tag);
              return (
                <li key={tag}>
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={isOn}
                    onClick={() => toggle(tag)}
                    data-testid="tag-filter-option"
                    data-tag={tag}
                    data-selected={isOn}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm",
                      "transition-colors hover:bg-accent hover:text-accent-foreground",
                      isOn && "font-medium",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded border",
                        isOn
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border",
                      )}
                    >
                      {isOn && <Check className="size-3" />}
                    </span>
                    <span className="truncate">{tag}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

export default TagFilter;
