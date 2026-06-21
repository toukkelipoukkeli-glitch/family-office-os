import * as React from "react";

import { DonutChart, type DonutDatum } from "@/components/charts/donut-chart";
import { seriesColor } from "@/components/charts/palette";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  analyzeConcentration,
  type ConcentrationBook,
  type ConcentrationReport,
  DIVERSIFIED_BOOK,
  type LiquidityTier,
  liquidityLabel,
  SAMPLE_CONCENTRATION_BOOK,
  type SingleNameExposure,
} from "@/lib/concentration";

import { useReportingMoney } from "@/lib/reporting-currency";
import type { Money } from "@/lib/money";

import { formatMoneyCompact, formatPct } from "./format";

export interface ConcentrationViewProps {
  /** Books offered in the selector; defaults to the two sample books. */
  books?: readonly ConcentrationBook[];
  /** Concentration threshold (single-name share of net worth) flagged red. */
  nameLimit?: number;
}

const DEFAULT_BOOKS = [SAMPLE_CONCENTRATION_BOOK, DIVERSIFIED_BOOK] as const;
const DEFAULT_NAME_LIMIT = 0.1; // 10% of net worth in any single name.

/** A small stat tile. */
function Stat({
  label,
  value,
  sub,
  tone,
  testid,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "danger" | "warn" | "ok";
  testid?: string;
}) {
  const toneClass =
    tone === "danger"
      ? "text-red-600 dark:text-red-400"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "ok"
          ? "text-emerald-600 dark:text-emerald-400"
          : "";
  return (
    <div
      className="rounded-lg border border-border p-4"
      data-testid={testid ?? "conc-stat"}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>
        {value}
      </p>
      {sub && <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

/**
 * One single-name row: a horizontal bar whose fill is the name's look-through
 * weight, split into its direct-vs-fund composition, with a limit marker. The
 * bar turns red when the name breaches the concentration limit.
 */
function NameBar({
  name,
  limit,
  scale,
  money,
}: {
  name: SingleNameExposure;
  limit: number;
  scale: number;
  money: (m: Money) => string;
  }) {
  const breached = !name.residual && name.weight > limit;
  const fillPct = Math.min(100, name.weight * scale * 100);
  const limitPct = Math.min(100, limit * scale * 100);

  // Split the fill into a direct segment and a fund (look-through) segment so a
  // viewer can see how much of the exposure is hidden inside funds.
  const directVal = name.sources
    .filter((s) => s.via === "direct")
    .reduce((acc, s) => acc + s.value.amount.toNumber(), 0);
  const total = name.value.amount.toNumber();
  const directFrac = total > 0 ? directVal / total : 0;
  const directWidth = fillPct * directFrac;
  const fundWidth = fillPct * (1 - directFrac);

  return (
    <div
      className="space-y-1"
      data-testid="conc-name-row"
      data-issuer-id={name.issuerId}
      data-residual={name.residual ? "true" : "false"}
      data-breached={breached ? "true" : "false"}
    >
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium">{name.name}</span>
          {!name.residual && directFrac < 1 && (
            <span
              className="shrink-0 rounded-full bg-[var(--color-chart-2)]/15 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
              title="Includes look-through exposure inside funds"
            >
              look-through
            </span>
          )}
        </span>
        <span className="shrink-0 tabular-nums">
          <span
            className={`font-semibold ${
              breached ? "text-red-600 dark:text-red-400" : ""
            }`}
            data-testid="conc-name-weight"
          >
            {formatPct(name.weight)}
          </span>
          <span className="text-muted-foreground">
            {" "}
            · {money(name.value)}
          </span>
        </span>
      </div>
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted">
        {/* Direct segment */}
        <div
          className={`absolute left-0 top-0 h-full ${
            breached ? "bg-red-500" : "bg-[var(--color-chart-1)]"
          }`}
          style={{ width: `${directWidth}%` }}
          data-testid="conc-name-fill-direct"
        />
        {/* Fund (look-through) segment, hatched lighter, starts after direct */}
        <div
          className={`absolute top-0 h-full ${
            breached ? "bg-red-400" : "bg-[var(--color-chart-2)]"
          }`}
          style={{ left: `${directWidth}%`, width: `${fundWidth}%` }}
          data-testid="conc-name-fill-fund"
        />
        {!name.residual && (
          <div
            aria-hidden
            className="absolute top-[-2px] h-[calc(100%+4px)] w-0.5 bg-foreground"
            style={{ left: `${limitPct}%` }}
            data-testid="conc-name-limit-marker"
          />
        )}
      </div>
    </div>
  );
}

/**
 * Concentration & single-name risk monitor. Surfaces the largest single names
 * as a share of net worth *with look-through* (a fund's value rolled down to
 * its underlying names), single-issuer and sector concentration, and the
 * illiquid share. Pure and deterministic; fed by offline fixtures.
 */
export function ConcentrationView({
  books = DEFAULT_BOOKS,
  nameLimit = DEFAULT_NAME_LIMIT,
}: ConcentrationViewProps) {
  const [bookId, setBookId] = React.useState(books[0]?.id ?? "");
  const book = React.useMemo(
    () => books.find((b) => b.id === bookId) ?? books[0],
    [books, bookId],
  );

  const report: ConcentrationReport = React.useMemo(
    () => analyzeConcentration(book),
    [book],
  );

  // Top 10 single names (residual buckets included so the bars are honest about
  // un-modelled exposure, but they never count as a breach).
  const topNames = report.singleNames.slice(0, 10);
  // Scale so the largest of (top weight, limit) reaches ~92% of the track.
  const maxWeight = Math.max(
    topNames[0]?.weight ?? 0,
    nameLimit,
    0.0001,
  );
  const scale = 0.92 / maxWeight;

  const breachCount = report.issuers.filter((i) => i.weight > nameLimit).length;

  // Re-express every base-USD figure in the chosen reporting currency at the
  // render boundary: convert the exact Money first, then format/scale. Weights
  // and donut geometry are scale-invariant ratios, so only the labelled units
  // change. No-op when the reporting currency is the base.
  const { convertMoney } = useReportingMoney();
  const money = (m: Money): string => formatMoneyCompact(convertMoney(m));

  // Sector donut (top sectors; merge a long tail visually is unnecessary here).
  const sectorColor = (i: number) => seriesColor(i);
  const sectorDonut: DonutDatum[] = report.sectors
    .filter((s) => s.value.amount.greaterThan(0))
    .map((s, i) => ({
      label: s.label,
      value: convertMoney(s.value).amount.toNumber(),
      color: sectorColor(i),
    }));

  const tierColor = (tier: LiquidityTier): string =>
    seriesColor(report.liquidity.findIndex((t) => t.tier === tier));

  return (
    <div className="space-y-6" data-testid="concentration-view">
      {/* Book selector */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            Book
          </span>
          <select
            data-testid="conc-book-select"
            value={book.id}
            onChange={(e) => setBookId(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm sm:w-72"
          >
            {books.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Status banner */}
      <div
        data-testid="conc-status-banner"
        data-breached={breachCount > 0 ? "true" : "false"}
        className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 ${
          breachCount > 0
            ? "border-red-500/30 bg-red-500/10"
            : "border-emerald-500/30 bg-emerald-500/10"
        }`}
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {breachCount > 0
              ? `${breachCount} single ${
                  breachCount === 1 ? "name" : "names"
                } over the ${formatPct(nameLimit, 0)} concentration limit`
              : `No single name over the ${formatPct(nameLimit, 0)} concentration limit`}
          </p>
          <p className="text-xs text-muted-foreground">
            {report.topName
              ? `Largest single name with look-through: ${report.topName.name} at ${formatPct(report.topName.weight)} of net worth.`
              : "No modelled single-name exposure in this book."}
          </p>
        </div>
        <span className="shrink-0 text-2xl font-bold tabular-nums">
          {breachCount > 0 ? breachCount : "OK"}
        </span>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          testid="conc-stat-networth"
          label="Net worth"
          value={money(report.total)}
          sub={report.bookName}
        />
        <Stat
          label="Top single name"
          value={report.topName ? formatPct(report.topName.weight) : "—"}
          sub={report.topName?.name}
          tone={
            report.topName && report.topName.weight > nameLimit
              ? "danger"
              : undefined
          }
          testid="conc-stat-topname"
        />
        <Stat
          label="Illiquid"
          value={formatPct(report.illiquid.weight)}
          sub="of net worth"
          tone={report.illiquid.weight > 0.3 ? "warn" : undefined}
          testid="conc-stat-illiquid"
        />
        <Stat
          label="Concentration (HHI)"
          value={report.hhi.toFixed(3)}
          sub={report.hhi > 0.15 ? "concentrated" : "diversified"}
          tone={report.hhi > 0.15 ? "warn" : "ok"}
          testid="conc-stat-hhi"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-6">
          {/* Single names with look-through */}
          <Card data-testid="conc-names-card">
            <CardHeader>
              <CardTitle className="text-base">
                Largest single names (with look-through)
              </CardTitle>
              <CardDescription>
                Each name's true share of net worth once funds are rolled down to
                their constituents. The dark segment is held directly; the
                lighter segment is hidden inside funds. The marker is the{" "}
                {formatPct(nameLimit, 0)} limit.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {topNames.length > 0 ? (
                <div className="space-y-4" data-testid="conc-names-list">
                  {topNames.map((n) => (
                    <NameBar
                      key={n.issuerId}
                      name={n}
                      limit={nameLimit}
                      scale={scale}
                      money={money}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No single-name exposure in this book.
                </p>
              )}
              {/* Legend */}
              <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[var(--color-chart-1)]" />
                  Held directly
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[var(--color-chart-2)]" />
                  Via funds (look-through)
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sector + liquidity sidebar */}
        <div className="min-w-0 space-y-6">
          <Card data-testid="conc-sector-card">
            <CardHeader>
              <CardTitle className="text-base">Sector concentration</CardTitle>
              <CardDescription>Look-through value by sector.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center gap-4">
                {sectorDonut.length > 0 ? (
                  <DonutChart
                    data={sectorDonut}
                    size={180}
                    thickness={0.42}
                    centerLabel={money(report.total)}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">No exposure.</p>
                )}
                <ul className="w-full space-y-1.5" data-testid="conc-sector-legend">
                  {report.sectors.slice(0, 6).map((s, i) => (
                    <li
                      key={s.sector}
                      className="flex items-center justify-between gap-3 text-sm"
                      data-testid="conc-sector-row"
                      data-sector={s.sector}
                    >
                      <span className="flex items-center gap-2 truncate">
                        <span
                          aria-hidden
                          className="inline-block h-3 w-3 shrink-0 rounded-sm"
                          style={{ background: sectorColor(i) }}
                        />
                        <span className="truncate">{s.label}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {formatPct(s.weight)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="conc-liquidity-card">
            <CardHeader>
              <CardTitle className="text-base">Liquidity</CardTitle>
              <CardDescription>
                Share of net worth by how fast it can be realised.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3" data-testid="conc-liquidity-list">
                {report.liquidity.map((t) => (
                  <li
                    key={t.tier}
                    data-testid="conc-liquidity-row"
                    data-tier={t.tier}
                    className="space-y-1"
                  >
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden
                          className="inline-block h-3 w-3 shrink-0 rounded-sm"
                          style={{ background: tierColor(t.tier) }}
                        />
                        {liquidityLabel(t.tier)}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {formatPct(t.weight)}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, t.weight * 100)}%`,
                          background: tierColor(t.tier),
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default ConcentrationView;
