import * as React from "react";

import { MAIN_CONTENT_ID } from "@/lib/main-content";
import { CommandPaletteTrigger } from "@/components/CommandPaletteTrigger";
import { ExportMenu } from "@/components/ExportMenu";
import { TagFilter } from "@/components/TagFilter";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NetWorthDashboard } from "@/networth/NetWorthDashboard";
import { buildNetWorthDashboard, networthRateTable } from "@/lib/networth";
import { useFilteredPortfolio, useTagFilter } from "@/lib/filter";
import { seededPortfolio } from "@/fixtures";
import { netWorthExport } from "@/lib/export";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * The application's main view: the net-worth-over-time dashboard with
 * allocation drill-down, driven by the deterministic seeded portfolio fixture.
 *
 * The header navigation is generated from the typed route registry
 * ({@link ROUTES}) rather than hand-written, so adding a route automatically
 * surfaces it in the nav with the right label and `data-testid`.
 */
export function Dashboard() {
  // Narrow the book by the global tag filter. With no tags selected this is the
  // full seeded portfolio (same reference), so the unfiltered dashboard is
  // unchanged; selecting tags rebuilds the net-worth model over the subset.
  const { selected, isFiltering } = useTagFilter();
  const filteredPortfolio = useFilteredPortfolio(seededPortfolio);
  const model = React.useMemo(
    () => buildNetWorthDashboard(filteredPortfolio, networthRateTable),
    [filteredPortfolio],
  );
  const exportDataset = React.useMemo(() => netWorthExport(model), [model]);
  const matchedCount = filteredPortfolio.holdings.length;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <h1 className="text-lg font-semibold tracking-tight">
            Family Office OS
          </h1>
          <div className="flex items-center gap-4">
            <nav className="flex items-center gap-4">
              {ROUTES.filter((r) => r.nav !== false).map((r, i) => (
                <a
                  key={r.path}
                  href={`#${r.path}`}
                  data-testid={r.navTestId}
                  className={cn(
                    "text-sm underline-offset-4 hover:underline",
                    // The first link (Overview) is emphasised; the rest are
                    // muted, matching the original hand-written navigation.
                    i === 0
                      ? "font-medium text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {r.label}
                </a>
              ))}
            </nav>
            <TagFilter />
            <ExportMenu
              dataset={exportDataset}
              testId="networth-export"
              className="hidden sm:flex"
            />
            <CommandPaletteTrigger />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main
        id={MAIN_CONTENT_ID}
        className="mx-auto max-w-6xl space-y-6 px-6 py-10"
      >
        {/* On small screens the header export menu is hidden to save room, so
            surface it inline at the top of the page instead. */}
        <div className="flex justify-end sm:hidden">
          <ExportMenu
            dataset={exportDataset}
            testId="networth-export-mobile"
          />
        </div>
        {isFiltering && (
          <div
            data-testid="tag-filter-summary"
            className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm"
          >
            <span className="text-muted-foreground">
              Filtered to {matchedCount} holding{matchedCount === 1 ? "" : "s"}{" "}
              tagged
            </span>
            {[...selected]
              .sort((a, b) => a.localeCompare(b))
              .map((tag) => (
                <span
                  key={tag}
                  data-testid="tag-filter-summary-chip"
                  className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-foreground"
                >
                  {tag}
                </span>
              ))}
          </div>
        )}
        <NetWorthDashboard model={model} />
      </main>
    </div>
  );
}

export default Dashboard;
