import * as React from "react";
import { ArrowDown, ArrowUp, Search, X } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { ExportMenu } from "@/components/ExportMenu";
import { holdingsExport } from "@/lib/export";
import { seededPortfolio } from "@/fixtures";
import { useOptionalFilteredPortfolio } from "@/lib/filter";
import { useHashQueryParam } from "@/lib/hash-location";
import { networthRateTable } from "@/lib/networth";
import { formatMoneyCompact, formatPercent, formatPercentSigned } from "@/lib/format";
import { useReportingMoney } from "@/lib/reporting-currency";
import { cn } from "@/lib/utils";
import type { ConfidenceLevel } from "@/lib/model/valuation";
import type { AssetClass } from "@/lib/model/asset-class";

import {
  buildHoldingsView,
  distinctAssetClasses,
  distinctCurrencies,
  type HoldingColumnFilter,
  type HoldingSort,
  type HoldingSortKey,
  type SortDirection,
} from "@/lib/holdings";

/* ------------------------------------------------------------------------- */
/* URL <-> sort encoding                                                     */
/* ------------------------------------------------------------------------- */

const SORT_KEYS: readonly HoldingSortKey[] = [
  "name",
  "assetClass",
  "currency",
  "value",
  "costBasis",
  "gain",
  "gainPct",
  "weight",
  "confidence",
];

/** Encode a multi-column sort as `key:dir,key:dir` for the URL. */
function encodeSort(sorts: readonly HoldingSort[]): string {
  return sorts.map((s) => `${s.key}:${s.direction}`).join(",");
}

/** Parse `key:dir,key:dir` back into a validated sort spec (ignores junk). */
function decodeSort(raw: string): HoldingSort[] {
  if (!raw) return [];
  const out: HoldingSort[] = [];
  const seen = new Set<HoldingSortKey>();
  for (const part of raw.split(",")) {
    const [key, dir] = part.split(":");
    if (!SORT_KEYS.includes(key as HoldingSortKey)) continue;
    if (seen.has(key as HoldingSortKey)) continue;
    const direction: SortDirection = dir === "asc" ? "asc" : "desc";
    seen.add(key as HoldingSortKey);
    out.push({ key: key as HoldingSortKey, direction });
  }
  return out;
}

const DEFAULT_SORT: HoldingSort[] = [{ key: "value", direction: "desc" }];

/* ------------------------------------------------------------------------- */
/* Column headers                                                            */
/* ------------------------------------------------------------------------- */

interface ColumnDef {
  readonly key: HoldingSortKey;
  readonly label: string;
  readonly numeric: boolean;
}

const COLUMNS: readonly ColumnDef[] = [
  { key: "name", label: "Holding", numeric: false },
  { key: "assetClass", label: "Class", numeric: false },
  { key: "currency", label: "Ccy", numeric: false },
  { key: "value", label: "Value", numeric: true },
  { key: "costBasis", label: "Cost", numeric: true },
  { key: "gain", label: "Gain", numeric: true },
  { key: "gainPct", label: "Gain %", numeric: true },
  { key: "weight", label: "Weight", numeric: true },
  { key: "confidence", label: "Conf.", numeric: false },
];

const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

/* ------------------------------------------------------------------------- */
/* Page                                                                      */
/* ------------------------------------------------------------------------- */

const inputCls =
  "h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";

const chip =
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Global holdings index (`#/holdings`).
 *
 * A single sortable, searchable, column-filterable table over the entire
 * portfolio. Every figure is re-expressed in the chosen reporting currency at
 * the render boundary; the global tag filter narrows the book before it is
 * indexed; and the current view exports verbatim to CSV/JSON. All derivations
 * are the pure, deterministic helpers in `@/lib/holdings`.
 *
 * READ-ONLY: it reports holdings; it never moves money or proposes a trade.
 */
export function HoldingsIndexPage() {
  // The global tag filter narrows the source book *before* it is indexed, so the
  // index honours the same selection as the rest of the app.
  const portfolio = useOptionalFilteredPortfolio(seededPortfolio);

  // Search query + sort live on the URL hash, so a filtered/sorted view is
  // deep-linkable and survives reload. Column filters are richer (multi-set) and
  // kept as local UI state.
  const [search, setSearch] = useHashQueryParam("q", "");
  const [sortRaw, setSortRaw] = useHashQueryParam("sort", encodeSort(DEFAULT_SORT));
  const sorts = React.useMemo(() => decodeSort(sortRaw), [sortRaw]);

  const [assetClasses, setAssetClasses] = React.useState<ReadonlySet<AssetClass>>(
    new Set(),
  );
  const [currencies, setCurrencies] = React.useState<ReadonlySet<string>>(
    new Set(),
  );
  const [confidences, setConfidences] = React.useState<ReadonlySet<ConfidenceLevel>>(
    new Set(),
  );
  const [gainOnly, setGainOnly] = React.useState<"" | "gain" | "loss">("");

  const filter = React.useMemo<HoldingColumnFilter>(
    () => ({
      assetClasses: assetClasses.size ? assetClasses : undefined,
      currencies: currencies.size ? currencies : undefined,
      confidences: confidences.size ? confidences : undefined,
      gain: gainOnly === "" ? undefined : gainOnly,
    }),
    [assetClasses, currencies, confidences, gainOnly],
  );

  // The full index (pre-search/filter) drives the available facet chips so the
  // controls reflect the *narrowed book*, not a stale global list.
  const allRows = React.useMemo(
    () => buildHoldingsView(portfolio, networthRateTable).rows,
    [portfolio],
  );
  const facetClasses = React.useMemo(() => distinctAssetClasses(allRows), [allRows]);
  const facetCurrencies = React.useMemo(() => distinctCurrencies(allRows), [allRows]);

  const view = React.useMemo(
    () => buildHoldingsView(portfolio, networthRateTable, { search, filter, sort: sorts }),
    [portfolio, search, filter, sorts],
  );

  const { currency, convert } = useReportingMoney();
  const money = (v: number) =>
    formatMoneyCompact(convert(v), currency, { maximumFractionDigits: 0 });

  const anyColumnFilter =
    assetClasses.size > 0 ||
    currencies.size > 0 ||
    confidences.size > 0 ||
    gainOnly !== "";
  const anyFilterOrSearch = anyColumnFilter || search.trim() !== "";

  function clearAll() {
    setSearch("");
    setAssetClasses(new Set());
    setCurrencies(new Set());
    setConfidences(new Set());
    setGainOnly("");
  }

  function toggleSort(key: HoldingSortKey) {
    // Click a header → make it the sole primary sort, toggling its direction if
    // it is already primary. Shift-click would extend, but a single-primary model
    // keeps the URL state small and predictable.
    const current = sorts[0];
    if (current?.key === key) {
      setSortRaw(
        encodeSort([
          { key, direction: current.direction === "asc" ? "desc" : "asc" },
        ]),
      );
    } else {
      // Text columns default to ascending; numeric columns to descending.
      const col = COLUMNS.find((c) => c.key === key);
      setSortRaw(encodeSort([{ key, direction: col?.numeric ? "desc" : "asc" }]));
    }
  }

  return (
    <AppShell
      title="Holdings"
      subtitle={
        <p className="text-xs text-muted-foreground">
          The whole book — one searchable, sortable index
        </p>
      }
      width="6xl"
      containerTestId="holdings-page"
      mainTestId="holdings-main"
      backTestId="holdings-back"
      actions={
        <ExportMenu
          dataset={holdingsExport(view)}
          testId="holdings-export"
        />
      }
    >
      <p className="mb-6 max-w-3xl text-sm text-muted-foreground">
        Every position the family holds, across all{" "}
        <span className="font-medium text-foreground">asset classes</span>,
        rolled into the reporting currency. Search by name, symbol, currency or
        tag; filter by class, currency, confidence or gain/loss; click any column
        to sort. The global tag filter narrows the book first; the export
        reproduces exactly the view below.
      </p>

      {/* Controls */}
      <div className="mb-4 space-y-3" data-testid="holdings-controls">
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative flex-1 min-w-[220px]">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search holdings, symbols, tags…"
              aria-label="Search holdings"
              data-testid="holdings-search"
              className={cn(inputCls, "w-full pl-8")}
            />
          </label>

          <select
            value={gainOnly}
            onChange={(e) =>
              setGainOnly(e.target.value as "" | "gain" | "loss")
            }
            aria-label="Filter by gain or loss"
            data-testid="holdings-gain-filter"
            className={inputCls}
          >
            <option value="">All P/L</option>
            <option value="gain">Gainers</option>
            <option value="loss">Losers</option>
          </select>

          {anyFilterOrSearch && (
            <button
              type="button"
              onClick={clearAll}
              data-testid="holdings-clear"
              className={cn(
                chip,
                "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              <X className="size-3" aria-hidden="true" />
              Clear
            </button>
          )}
        </div>

        {/* Asset-class facet chips */}
        <FacetRow label="Class" testId="holdings-facet-class">
          {facetClasses.map((ac) => (
            <FacetChip
              key={ac}
              active={assetClasses.has(ac)}
              testId={`facet-class-${ac}`}
              onClick={() => setAssetClasses(toggleSet(assetClasses, ac))}
            >
              {labelForClass(allRows, ac)}
            </FacetChip>
          ))}
        </FacetRow>

        {/* Currency facet chips */}
        <FacetRow label="Currency" testId="holdings-facet-ccy">
          {facetCurrencies.map((c) => (
            <FacetChip
              key={c}
              active={currencies.has(c)}
              testId={`facet-ccy-${c}`}
              onClick={() => setCurrencies(toggleSet(currencies, c))}
            >
              {c}
            </FacetChip>
          ))}
        </FacetRow>

        {/* Confidence facet chips */}
        <FacetRow label="Confidence" testId="holdings-facet-conf">
          {(["high", "medium", "low"] as ConfidenceLevel[]).map((cf) => (
            <FacetChip
              key={cf}
              active={confidences.has(cf)}
              testId={`facet-conf-${cf}`}
              onClick={() => setConfidences(toggleSet(confidences, cf))}
            >
              {CONFIDENCE_LABEL[cf]}
            </FacetChip>
          ))}
        </FacetRow>
      </div>

      {/* Summary bar */}
      <div
        className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4"
        data-testid="holdings-summary"
      >
        <Stat label="Holdings" value={String(view.summary.count)} testId="stat-count" />
        <Stat
          label="Total value"
          value={money(view.summary.totalValue)}
          testId="stat-value"
        />
        <Stat
          label="Unrealized gain"
          value={money(view.summary.totalGain)}
          tone={view.summary.totalGain >= 0 ? "up" : "down"}
          testId="stat-gain"
        />
        <Stat
          label="Share of book"
          value={formatPercent(view.summary.totalWeight, { digits: 1 })}
          testId="stat-weight"
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table
          className="w-full min-w-[860px] border-collapse text-sm"
          data-testid="holdings-table"
        >
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              {COLUMNS.map((col) => {
                const active = sorts[0]?.key === col.key;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={
                      active
                        ? sorts[0].direction === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                    className={cn(
                      "px-3 py-2 font-medium",
                      col.numeric && "text-right",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      data-testid={`sort-${col.key}`}
                      data-active={active}
                      className={cn(
                        "inline-flex items-center gap-1 hover:text-foreground",
                        col.numeric && "flex-row-reverse",
                        active && "text-foreground",
                      )}
                    >
                      {col.label}
                      {active &&
                        (sorts[0].direction === "asc" ? (
                          <ArrowUp className="size-3" aria-hidden="true" />
                        ) : (
                          <ArrowDown className="size-3" aria-hidden="true" />
                        ))}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {view.rows.map((r) => (
              <tr
                key={r.id}
                data-testid="holdings-row"
                data-holding={r.id}
                className="border-b border-border/60 last:border-0 hover:bg-muted/40"
              >
                <td className="px-3 py-2">
                  <div className="font-medium text-foreground">{r.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.symbol || r.tags.slice(0, 3).join(" · ") || "—"}
                  </div>
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {r.assetClassLabel}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{r.currency}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {money(r.value)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {r.costBasis === 0 ? "—" : money(r.costBasis)}
                </td>
                <td
                  className={cn(
                    "px-3 py-2 text-right tabular-nums",
                    r.gain > 0 && "text-[var(--color-chart-up)]",
                    r.gain < 0 && "text-[var(--color-chart-down)]",
                  )}
                >
                  {money(r.gain)}
                </td>
                <td
                  className={cn(
                    "px-3 py-2 text-right tabular-nums",
                    r.gainPct !== undefined &&
                      r.gainPct > 0 &&
                      "text-[var(--color-chart-up)]",
                    r.gainPct !== undefined &&
                      r.gainPct < 0 &&
                      "text-[var(--color-chart-down)]",
                  )}
                >
                  {r.gainPct === undefined
                    ? "—"
                    : formatPercentSigned(r.gainPct, { digits: 1 })}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {formatPercent(r.weight, { digits: 1 })}
                </td>
                <td className="px-3 py-2">
                  {r.confidence ? (
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-xs",
                        r.confidence === "high" && "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
                        r.confidence === "medium" && "bg-amber-500/15 text-amber-600 dark:text-amber-400",
                        r.confidence === "low" && "bg-rose-500/15 text-rose-600 dark:text-rose-400",
                      )}
                    >
                      {CONFIDENCE_LABEL[r.confidence]}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {view.rows.length === 0 && (
          <div
            className="px-3 py-10 text-center text-sm text-muted-foreground"
            data-testid="holdings-empty"
          >
            No holdings match the current search and filters.
          </div>
        )}
      </div>
    </AppShell>
  );
}

/* ------------------------------------------------------------------------- */
/* Small presentational helpers                                              */
/* ------------------------------------------------------------------------- */

function Stat({
  label,
  value,
  tone = "default",
  testId,
}: {
  label: string;
  value: string;
  tone?: "default" | "up" | "down";
  testId: string;
}) {
  return (
    <div className="rounded-lg border border-border p-3" data-testid={testId}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 text-lg font-semibold tabular-nums",
          tone === "up" && "text-[var(--color-chart-up)]",
          tone === "down" && "text-[var(--color-chart-down)]",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function FacetRow({
  label,
  testId,
  children,
}: {
  label: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid={testId}>
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

function FacetChip({
  active,
  onClick,
  testId,
  children,
}: {
  active: boolean;
  onClick: () => void;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      data-active={active}
      aria-pressed={active}
      className={cn(
        chip,
        active
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

/** Toggle a value in/out of a readonly set, returning a new set. */
function toggleSet<T>(set: ReadonlySet<T>, value: T): ReadonlySet<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

/** Resolve an asset class to its display label via any matching row. */
function labelForClass(
  rows: readonly { assetClass: AssetClass; assetClassLabel: string }[],
  ac: AssetClass,
): string {
  return rows.find((r) => r.assetClass === ac)?.assetClassLabel ?? ac;
}

export default HoldingsIndexPage;
