import * as React from "react";

import { BarChart, type BarDatum } from "@/components/charts/bar-chart";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  assessPortfolio,
  type DataQualityReport,
  DATA_QUALITY_HOLDINGS,
  DATA_QUALITY_TODAY,
  type HoldingQuality,
  type QualityFlag,
  QUALITY_FLAG_LABELS,
  type StalenessStatus,
} from "@/lib/dataquality";
import type { Holding } from "@/lib/model";
import { ExportMenu } from "@/components/ExportMenu";
import { tableExport } from "@/lib/export";

import { formatMoneyCompact, formatPct, formatScore } from "./format";

export interface DataQualityViewProps {
  holdings?: readonly Holding[];
  /** Fixed reference date; defaults to the deterministic fixture "today". */
  today?: Date;
}

/** Tailwind tone per staleness status. */
const STATUS_TONE: Record<StalenessStatus, string> = {
  fresh: "text-emerald-600 dark:text-emerald-400",
  aging: "text-amber-600 dark:text-amber-400",
  stale: "text-red-600 dark:text-red-400",
};

const STATUS_DOT: Record<StalenessStatus, string> = {
  fresh: "bg-emerald-500",
  aging: "bg-amber-500",
  stale: "bg-red-500",
};

const STATUS_LABEL: Record<StalenessStatus, string> = {
  fresh: "Fresh",
  aging: "Aging",
  stale: "Stale",
};

/** Colour the headline grade by band. */
function gradeTone(grade: string): string {
  switch (grade) {
    case "A":
      return "text-emerald-600 dark:text-emerald-400";
    case "B":
      return "text-lime-600 dark:text-lime-400";
    case "C":
      return "text-amber-600 dark:text-amber-400";
    case "D":
      return "text-orange-600 dark:text-orange-400";
    default:
      return "text-red-600 dark:text-red-400";
  }
}

/** A small summary tile. */
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
  tone?: string;
  testid?: string;
}) {
  return (
    <div className="rounded-lg border border-border p-4" data-testid={testid}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone ?? ""}`}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

/** Pill listing a holding's data-quality flags. */
function FlagPills({ flags }: { flags: QualityFlag[] }) {
  if (flags.length === 0) {
    return (
      <span className="text-xs text-muted-foreground" data-testid="dq-no-flags">
        —
      </span>
    );
  }
  return (
    <span className="flex flex-wrap gap-1" data-testid="dq-flags">
      {flags.map((f) => (
        <span
          key={f}
          data-testid="dq-flag"
          data-flag={f}
          title={QUALITY_FLAG_LABELS[f]}
          className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
        >
          {f.replace(/_/g, " ")}
        </span>
      ))}
    </span>
  );
}

/** Detail panel for the selected holding. */
function DetailPanel({ row }: { row: HoldingQuality | null }) {
  if (!row) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="dq-detail-empty">
        Select a holding to inspect its valuation freshness, confidence and
        gaps.
      </p>
    );
  }
  return (
    <div className="space-y-3" data-testid="dq-detail">
      <div>
        <h3 className="text-base font-semibold" data-testid="dq-detail-name">
          {row.name}
        </h3>
        <p className="text-xs text-muted-foreground">
          {row.assetClassLabel} ·{" "}
          {row.asOf ? formatMoneyCompact(row.value) : "unvalued"}
        </p>
      </div>
      <dl className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Quality score</dt>
          <dd className="font-semibold tabular-nums" data-testid="dq-detail-score">
            {formatScore(row.score)}/100
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Valuation as of</dt>
          <dd className="tabular-nums">
            {row.asOf ? row.asOf.slice(0, 10) : "—"}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Staleness</dt>
          <dd className={`tabular-nums ${STATUS_TONE[row.stalenessStatus]}`}>
            {row.stalenessDays === undefined
              ? "no valuation"
              : `${row.stalenessDays}d / ${row.budgetDays}d budget`}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Confidence</dt>
          <dd className="tabular-nums">{formatPct(row.confidenceScore)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Freshness</dt>
          <dd className="tabular-nums">{formatPct(row.freshnessScore)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Completeness</dt>
          <dd className="tabular-nums">{formatPct(row.completenessScore)}</dd>
        </div>
      </dl>
      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">
          Data-quality flags
        </p>
        {row.flags.length === 0 ? (
          <p className="text-sm text-emerald-600 dark:text-emerald-400">
            No issues — trusted number.
          </p>
        ) : (
          <ul className="space-y-1 text-sm" data-testid="dq-detail-flags">
            {row.flags.map((f) => (
              <li key={f} className="flex items-start gap-2" data-flag={f}>
                <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                <span>{QUALITY_FLAG_LABELS[f]}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

type StatusFilter = "all" | StalenessStatus;

/**
 * The valuation-staleness & data-quality monitor view. Scores how much the
 * family should trust each reported number — staleness vs a per-asset-class
 * freshness budget, valuation confidence, and missing-data flags — and rolls it
 * up into a single headline grade. Pure and deterministic; fed by offline
 * fixtures judged against a fixed "today".
 */
export function DataQualityView({
  holdings = DATA_QUALITY_HOLDINGS,
  today = DATA_QUALITY_TODAY,
}: DataQualityViewProps) {
  const report: DataQualityReport = React.useMemo(
    () => assessPortfolio(holdings, today),
    [holdings, today],
  );

  const [filter, setFilter] = React.useState<StatusFilter>("all");
  const [selectedId, setSelectedId] = React.useState<string | null>(
    report.holdings[0]?.holdingId ?? null,
  );

  // Keep the selection valid when inputs change.
  React.useEffect(() => {
    setSelectedId(report.holdings[0]?.holdingId ?? null);
    setFilter("all");
  }, [report]);

  const visible = React.useMemo(
    () =>
      filter === "all"
        ? report.holdings
        : report.holdings.filter((h) => h.stalenessStatus === filter),
    [report.holdings, filter],
  );

  const selected =
    report.holdings.find((h) => h.holdingId === selectedId) ?? null;

  const statusBars: BarDatum[] = (
    ["fresh", "aging", "stale"] as StalenessStatus[]
  ).map((s) => ({ label: STATUS_LABEL[s], value: report.byStatus[s] }));

  const flagBars: BarDatum[] = (Object.keys(report.flagTotals) as QualityFlag[])
    .filter((f) => report.flagTotals[f] > 0)
    .map((f) => ({
      label: QUALITY_FLAG_LABELS[f],
      value: report.flagTotals[f],
    }));

  const filters: StatusFilter[] = ["all", "fresh", "aging", "stale"];

  return (
    <div className="space-y-6" data-testid="dataquality-view">
      <div className="flex justify-end">
        <ExportMenu
          dataset={tableExport(
            `data-quality-${report.today}`,
            [
              "holdingId",
              "name",
              "assetClass",
              `value`,
              "asOf",
              "stalenessDays",
              "budgetDays",
              "stalenessStatus",
              "confidenceScore",
              "freshnessScore",
              "completenessScore",
              "score",
              "flags",
            ],
            report.holdings.map((h) => [
              h.holdingId,
              h.name,
              h.assetClass,
              h.value.amount.toFixed(),
              h.asOf ?? null,
              h.stalenessDays ?? null,
              h.budgetDays,
              h.stalenessStatus,
              h.confidenceScore,
              h.freshnessScore,
              h.completenessScore,
              h.score,
              h.flags.join("|"),
            ]),
            {
              today: report.today,
              score: report.score,
              grade: report.grade,
              staleCount: report.staleCount,
              missingValuationCount: report.missingValuationCount,
              flagCount: report.flagCount,
              byStatus: report.byStatus,
              flagTotals: report.flagTotals,
              holdings: report.holdings.map((h) => ({
                holdingId: h.holdingId,
                name: h.name,
                assetClass: h.assetClass,
                assetClassLabel: h.assetClassLabel,
                value: h.value.amount.toFixed(),
                asOf: h.asOf ?? null,
                stalenessDays: h.stalenessDays ?? null,
                budgetDays: h.budgetDays,
                stalenessStatus: h.stalenessStatus,
                confidenceScore: h.confidenceScore,
                freshnessScore: h.freshnessScore,
                completenessScore: h.completenessScore,
                score: h.score,
                flags: h.flags,
              })),
            },
          )}
          testId="dataquality-export"
        />
      </div>
      {/* Headline grade + summary stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          testid="dq-grade"
          label="Data-quality grade"
          value={`${report.grade} · ${formatScore(report.score)}`}
          sub="value-weighted, /100"
          tone={gradeTone(report.grade)}
        />
        <Stat
          testid="dq-stale"
          label="Stale valuations"
          value={report.staleCount.toString()}
          sub="past freshness budget"
          tone={report.staleCount > 0 ? STATUS_TONE.stale : undefined}
        />
        <Stat
          testid="dq-missing"
          label="Missing valuations"
          value={report.missingValuationCount.toString()}
          sub="no number on record"
          tone={
            report.missingValuationCount > 0 ? STATUS_TONE.stale : undefined
          }
        />
        <Stat
          testid="dq-flags-total"
          label="Open flags"
          value={report.flagCount.toString()}
          sub={`across ${report.holdings.length} holdings`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="space-y-6">
          {/* Staleness distribution */}
          <Card data-testid="dq-status-card">
            <CardHeader>
              <CardTitle className="text-base">Valuation freshness</CardTitle>
              <CardDescription>
                Holdings by staleness band, judged against each asset class&apos;s
                freshness budget (as of {report.today.slice(0, 10)}).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <BarChart data={statusBars} width={560} height={200} colorByIndex />
              </div>
              <ul className="mt-3 flex flex-wrap gap-4 text-xs" data-testid="dq-status-legend">
                {(["fresh", "aging", "stale"] as StalenessStatus[]).map((s) => (
                  <li key={s} className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className={`inline-block h-3 w-3 rounded-sm ${STATUS_DOT[s]}`}
                    />
                    <span className={STATUS_TONE[s]}>{STATUS_LABEL[s]}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {report.byStatus[s]}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Flag breakdown */}
          {flagBars.length > 0 && (
            <Card data-testid="dq-flagchart-card">
              <CardHeader>
                <CardTitle className="text-base">Open data gaps</CardTitle>
                <CardDescription>
                  Count of each missing-data / low-trust flag across the book.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <BarChart data={flagBars} width={560} height={220} colorByIndex />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Holdings table */}
          <Card data-testid="dq-table-card">
            <CardHeader>
              <CardTitle className="text-base">Per-holding trust</CardTitle>
              <CardDescription>
                Worst-first. Click a row to inspect why a number is or isn&apos;t
                trusted.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Status filter */}
              <div className="flex flex-wrap gap-2" data-testid="dq-filters">
                {filters.map((f) => (
                  <button
                    key={f}
                    type="button"
                    data-testid="dq-filter"
                    data-filter={f}
                    data-active={filter === f ? "true" : "false"}
                    onClick={() => setFilter(f)}
                    className={`rounded-md border px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                      filter === f
                        ? "border-foreground bg-foreground text-background"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="dq-table">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="py-2 font-medium">Holding</th>
                      <th className="py-2 text-right font-medium">Score</th>
                      <th className="py-2 text-right font-medium">Staleness</th>
                      <th className="py-2 text-right font-medium">Conf.</th>
                      <th className="py-2 font-medium">Flags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((h) => {
                      const active = h.holdingId === selectedId;
                      return (
                        <tr
                          key={h.holdingId}
                          data-testid="dq-row"
                          data-holding-id={h.holdingId}
                          data-status={h.stalenessStatus}
                          data-selected={active ? "true" : "false"}
                          role="button"
                          tabIndex={0}
                          aria-pressed={active}
                          aria-label={`Inspect data quality of ${h.name}`}
                          onClick={() => setSelectedId(h.holdingId)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setSelectedId(h.holdingId);
                            }
                          }}
                          className={`cursor-pointer border-b border-border/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                            active ? "bg-muted" : "hover:bg-muted/50"
                          }`}
                        >
                          <td className="py-2 pr-2">
                            <span className="flex items-center gap-2">
                              <span
                                aria-hidden
                                className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_DOT[h.stalenessStatus]}`}
                              />
                              <span className="min-w-0">
                                <span className="block truncate font-medium">
                                  {h.name}
                                </span>
                                <span className="block text-[11px] text-muted-foreground">
                                  {h.assetClassLabel}
                                </span>
                              </span>
                            </span>
                          </td>
                          <td
                            className="py-2 text-right font-semibold tabular-nums"
                            data-testid="dq-row-score"
                          >
                            {formatScore(h.score)}
                          </td>
                          <td
                            className={`py-2 text-right tabular-nums ${STATUS_TONE[h.stalenessStatus]}`}
                          >
                            {h.stalenessDays === undefined
                              ? "—"
                              : `${h.stalenessDays}d`}
                          </td>
                          <td className="py-2 text-right tabular-nums text-muted-foreground">
                            {formatPct(h.confidenceScore)}
                          </td>
                          <td className="py-2">
                            <FlagPills flags={h.flags} />
                          </td>
                        </tr>
                      );
                    })}
                    {visible.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="py-6 text-center text-sm text-muted-foreground"
                          data-testid="dq-empty"
                        >
                          No holdings in this band.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Detail drill-down */}
        <Card data-testid="dq-detail-card">
          <CardHeader>
            <CardTitle className="text-base">Trust detail</CardTitle>
            <CardDescription>Why this number is (un)trusted</CardDescription>
          </CardHeader>
          <CardContent>
            <DetailPanel row={selected} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
