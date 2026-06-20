import * as React from "react";
import {
  BarChart3,
  Download,
  Gauge,
  LineChart as LineIcon,
  Percent,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { ExportMenu } from "@/components/ExportMenu";
import { BarChart } from "@/components/charts/bar-chart";
import { LineChart } from "@/components/charts/line-chart";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  buildBoardReport,
  exportReportMarkdown,
  type BoardReport,
} from "@/lib/reporting";
import { reportExport } from "@/lib/export";
import { cn } from "@/lib/utils";

/** Full currency with no fractional cents, e.g. `$1,250,000`. */
function whole(value: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

/** Percent, e.g. `12.3%`. */
function percent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

/** Signed basis points, e.g. `+123 bps`. */
function bps(value: number): string {
  const b = Math.round(value * 10000);
  return `${b >= 0 ? "+" : ""}${b} bps`;
}

const KPI_ICONS: Record<string, React.ReactNode> = {
  "net-worth": <TrendingUp className="size-3.5" aria-hidden="true" />,
  twr: <LineIcon className="size-3.5" aria-hidden="true" />,
  "excess-return": <BarChart3 className="size-3.5" aria-hidden="true" />,
  "info-ratio": <Gauge className="size-3.5" aria-hidden="true" />,
  "policy-breaches": <ShieldCheck className="size-3.5" aria-hidden="true" />,
  "fee-rate": <Percent className="size-3.5" aria-hidden="true" />,
  "pe-tvpi": <TrendingUp className="size-3.5" aria-hidden="true" />,
};

export interface ReportsPageProps {
  /** Optional precomputed report (mainly for tests); defaults to the fixture. */
  report?: BoardReport;
}

/**
 * Board-grade reporting page (`/reports`).
 *
 * Composes the deterministic family-office engines into one dated board report
 * via {@link buildBoardReport}: a headline KPI strip, net-worth & TWR with a
 * 24-month series chart, allocation-vs-policy (IPS) compliance, benchmark-
 * relative performance, a Brinson attribution bar chart, fees / TCO, and
 * private-markets (PE) metrics — plus a deterministic Markdown export the board
 * can archive. Pure, offline and READ-ONLY: it reports, it never moves money.
 */
export function ReportsPage({ report }: ReportsPageProps) {
  const data = React.useMemo(() => report ?? buildBoardReport(), [report]);
  const [showExport, setShowExport] = React.useState(false);
  const markdown = React.useMemo(() => exportReportMarkdown(data), [data]);

  const { currency } = data;
  const nw = data.netWorth;
  const policy = data.policy;
  const bm = data.benchmark;
  const attr = data.attribution;
  const fees = data.fees;
  const pe = data.privateMarkets;

  const nwSeries = nw.series.map((p) => p.value);
  const attrBars = attr.segments.map((s) => ({
    label: s.label,
    value: s.total,
  }));

  return (
    <AppShell
      title="Board report"
      titleAside={
        <span
          className="text-sm text-muted-foreground tabular-nums"
          data-testid="report-as-of"
        >
          as of {data.asOf}
        </span>
      }
      actions={
        <div className="flex items-center gap-2">
          <ExportMenu dataset={reportExport(data)} testId="reports-export" />
          <button
            type="button"
            data-testid="toggle-export"
            onClick={() => setShowExport((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted"
          >
            <Download className="size-3.5" aria-hidden="true" />
            {showExport ? "Hide memo" : "Memo"}
          </button>
        </div>
      }
      backTestId="reports-back"
      mainClassName="space-y-6"
      mainTestId="reports-page"
    >
        {/* Headline KPI strip */}
        <section
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7"
          data-testid="kpi-strip"
        >
          {data.kpis.map((k) => (
            <div
              key={k.key}
              data-testid={`kpi-${k.key}`}
              className="rounded-lg border border-border p-4"
            >
              <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                {KPI_ICONS[k.key]}
                <span className="truncate">{k.label}</span>
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {k.display}
              </p>
            </div>
          ))}
        </section>

        {/* Export preview */}
        {showExport && (
          <Card data-testid="export-card">
            <CardHeader>
              <CardTitle className="text-base">Deterministic export</CardTitle>
              <CardDescription>
                A byte-stable Markdown memo of this report. The same dated report
                always exports identically — safe to archive and diff.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre
                data-testid="export-markdown"
                className="max-h-96 overflow-auto rounded-md bg-muted p-4 text-xs leading-relaxed"
              >
                {markdown}
              </pre>
            </CardContent>
          </Card>
        )}

        {/* Net worth & TWR */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Net worth & TWR</CardTitle>
            <CardDescription>
              Consolidated net worth over {nw.months} months and the cumulative
              time-weighted return of the book.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Stat label="Opening" value={whole(nw.opening, currency)} />
              <Stat label="Current" value={whole(nw.current, currency)} />
              <Stat
                label="Window TWR"
                value={percent(nw.totalReturn)}
                tone="up"
              />
            </div>
            <div className="w-full overflow-hidden">
              <LineChart
                series={[
                  {
                    label: "Net worth",
                    values: nwSeries,
                    color: "var(--color-chart-up)",
                  },
                ]}
                width={1040}
                height={280}
                grid
                className="h-auto w-full"
                preserveAspectRatio="none"
              />
            </div>
            <div className="overflow-x-auto">
            <table
              className="w-full text-sm"
              data-testid="allocation-table"
            >
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Asset class</th>
                  <th className="py-2 px-3 text-right font-medium">Value</th>
                  <th className="py-2 pl-3 text-right font-medium">Weight</th>
                </tr>
              </thead>
              <tbody>
                {nw.byAssetClass.map((a) => (
                  <tr
                    key={a.assetClass}
                    data-testid="allocation-row"
                    className="border-b border-border/60 last:border-0"
                  >
                    <td className="py-2 pr-3 font-medium">{a.label}</td>
                    <td className="py-2 px-3 text-right tabular-nums">
                      {whole(a.value, currency)}
                    </td>
                    <td className="py-2 pl-3 text-right tabular-nums text-muted-foreground">
                      {percent(a.weight)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Allocation vs policy (IPS) */}
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="text-base">
                Allocation vs. policy (IPS)
              </CardTitle>
              <CardDescription>
                Compliance of the current allocation against the Investment
                Policy Statement constraints.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div
                data-testid="policy-status"
                data-compliant={policy.compliant ? "true" : "false"}
                className={cn(
                  "rounded-md border px-3 py-2 text-sm font-medium",
                  policy.compliant
                    ? "border-[var(--color-chart-up)]/40 text-[var(--color-chart-up)]"
                    : "border-[var(--color-chart-down)]/40 text-[var(--color-chart-down)]",
                )}
              >
                {policy.compliant
                  ? "Compliant — no constraints breached."
                  : `${policy.breachCount} breach(es): ${policy.criticalBreaches} critical, ${policy.warningBreaches} warning.`}
              </div>
              {!policy.compliant && (
                <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="breach-table">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Subject</th>
                      <th className="py-2 px-3 text-right font-medium">
                        Weight
                      </th>
                      <th className="py-2 px-3 text-right font-medium">Limit</th>
                      <th className="py-2 pl-3 text-right font-medium">
                        Over/Under
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {policy.breaches.map((b, i) => (
                      <tr
                        key={`${b.subject}-${b.bound}-${i}`}
                        data-testid="breach-row"
                        data-severity={b.severity}
                        className="border-b border-border/60 last:border-0"
                      >
                        <td className="py-2 pr-3">
                          <span className="font-medium">{b.subject}</span>
                          <span className="ml-1 text-xs text-muted-foreground">
                            {b.kind} ({b.bound})
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums">
                          {percent(b.weight)}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">
                          {percent(b.limit)}
                        </td>
                        <td className="py-2 pl-3 text-right tabular-nums text-[var(--color-chart-down)]">
                          {whole(b.exceedanceAmount, currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Benchmark-relative performance */}
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="text-base">
                Benchmark-relative performance
              </CardTitle>
              <CardDescription>
                Measured against {bm.benchmarkLabel}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl
                className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm"
                data-testid="benchmark-stats"
              >
                <Metric label="Portfolio" value={percent(bm.portfolioReturn)} />
                <Metric label="Benchmark" value={percent(bm.benchmarkReturn)} />
                <Metric
                  label="Excess (active)"
                  value={bps(bm.excessReturn)}
                  tone="up"
                />
                <Metric
                  label="Tracking error"
                  value={percent(bm.trackingError)}
                />
                <Metric
                  label="Information ratio"
                  value={bm.informationRatio.toFixed(2)}
                />
                <Metric label="Beta" value={bm.beta.toFixed(2)} />
                <Metric label="Alpha" value={bps(bm.alpha)} />
              </dl>
            </CardContent>
          </Card>
        </div>

        {/* Attribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Performance attribution ({attr.method})
            </CardTitle>
            <CardDescription>
              Total Brinson effect per segment (allocation + selection +
              interaction), reconciling to the {bps(attr.activeReturn)} active
              return.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="w-full overflow-hidden">
              <BarChart
                data={attrBars}
                width={1040}
                height={260}
                signed
                className="h-auto w-full"
                preserveAspectRatio="none"
              />
            </div>
            <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="attribution-table">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Segment</th>
                  <th className="py-2 px-3 text-right font-medium">
                    Allocation
                  </th>
                  <th className="py-2 px-3 text-right font-medium">Selection</th>
                  <th className="py-2 px-3 text-right font-medium">
                    Interaction
                  </th>
                  <th className="py-2 pl-3 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {attr.segments.map((s) => (
                  <tr
                    key={s.id}
                    data-testid="attribution-row"
                    className="border-b border-border/60 last:border-0"
                  >
                    <td className="py-2 pr-3 font-medium">{s.label}</td>
                    <td className="py-2 px-3 text-right tabular-nums">
                      {bps(s.allocation)}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums">
                      {bps(s.selection)}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums">
                      {bps(s.interaction)}
                    </td>
                    <td className="py-2 pl-3 text-right font-medium tabular-nums">
                      {bps(s.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Fees */}
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="text-base">
                Fees & total cost of ownership
              </CardTitle>
              <CardDescription>
                The all-in cost of the book and its long-run drag.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl
                className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm"
                data-testid="fees-stats"
              >
                <Metric
                  label="Capital invested"
                  value={whole(fees.totalInvested, currency)}
                />
                <Metric
                  label="All-in annual cost"
                  value={whole(fees.totalAnnualCost, currency)}
                  tone="down"
                />
                <Metric
                  label="Blended fee"
                  value={percent(fees.blendedRate, 2)}
                />
                <Metric
                  label={`Fee drag (${fees.horizonYears}y)`}
                  value={percent(fees.dragShareOfProfit)}
                  tone="down"
                />
              </dl>
            </CardContent>
          </Card>

          {/* Private markets */}
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="text-base">Private markets (PE)</CardTitle>
              <CardDescription>
                Drawn-down commitments and their multiples.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl
                className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm"
                data-testid="pe-stats"
              >
                <Metric
                  label="Committed"
                  value={whole(pe.committed, currency)}
                />
                <Metric label="NAV" value={whole(pe.nav, currency)} />
                <Metric label="TVPI" value={`${pe.tvpi.toFixed(2)}×`} />
                <Metric label="DPI" value={`${pe.dpi.toFixed(2)}×`} />
                <Metric label="RVPI" value={`${pe.rvpi.toFixed(2)}×`} />
                <Metric
                  label="Pooled IRR"
                  value={pe.irr === null ? "n/a" : percent(pe.irr)}
                  tone="up"
                />
              </dl>
            </CardContent>
          </Card>
        </div>
    </AppShell>
  );
}

interface StatProps {
  label: string;
  value: string;
  tone?: "default" | "up" | "down";
}

function Stat({ label, value, tone = "default" }: StatProps) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-lg font-semibold tabular-nums",
          tone === "up" && "text-[var(--color-chart-up)]",
          tone === "down" && "text-[var(--color-chart-down)]",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function Metric({ label, value, tone = "default" }: StatProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "font-medium tabular-nums",
          tone === "up" && "text-[var(--color-chart-up)]",
          tone === "down" && "text-[var(--color-chart-down)]",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

export default ReportsPage;
