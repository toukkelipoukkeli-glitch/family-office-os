import * as React from "react";
import {
  AlertTriangle,
  Banknote,
  Droplets,
  Layers,
  ShieldCheck,
  TrendingDown,
} from "lucide-react";

import { BarChart } from "@/components/charts/bar-chart";
import { ExportMenu } from "@/components/ExportMenu";
import { LineChart } from "@/components/charts/line-chart";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buildLiquidityModel, type LiquidityModel } from "@/lib/liquidity";
import { liquidityExport } from "@/lib/export";
import {
  formatMoneyCompact,
  formatMoneyWhole,
  formatMultiple,
} from "@/lib/format";
import { useReportingMoney } from "@/lib/reporting-currency";
import { cn } from "@/lib/utils";

/** A coverage ratio as `2.02×`, or `—` when undefined. */
function coverageLabel(ratio: number | null): string {
  if (ratio === null) return "—";
  return formatMultiple(ratio, { suffix: "×" });
}

/** A readable month label, e.g. `Jul 2024`, from an ISO `YYYY-MM`. */
function monthLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

interface KpiProps {
  testId: string;
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "up" | "down" | "warn";
  icon?: React.ReactNode;
}

function Kpi({ testId, label, value, hint, tone = "default", icon }: KpiProps) {
  return (
    <div data-testid={testId} className="rounded-lg border border-border p-4">
      <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums",
          tone === "up" && "text-[var(--color-chart-up)]",
          tone === "down" && "text-[var(--color-chart-down)]",
          tone === "warn" && "text-[var(--color-chart-down)]",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export interface LiquidityPageProps {
  /** Optional precomputed model (mainly for tests); defaults to the fixture. */
  model?: LiquidityModel;
}

/**
 * Liquidity & capital-call coverage cockpit.
 *
 * Answers, at a glance: *can the family fund its committed-but-uncalled PE
 * capital calls AND its household burn over the horizon — without selling
 * illiquids?* Headline coverage KPIs (deployable reserves, total obligations,
 * horizon and worst-month coverage ratios, any shortfall), a month-by-month
 * **available-liquidity vs obligation** chart that visualises the buffer
 * draining as calls clear, a per-tier reserve breakdown (gross vs deployable
 * after stress haircuts), and a per-month coverage table — all from the
 * deterministic engine via {@link buildLiquidityModel}. Pure and offline;
 * READ-ONLY: it measures coverage, it never moves money.
 */
export function LiquidityPage({ model }: LiquidityPageProps) {
  const lq = React.useMemo(() => model ?? buildLiquidityModel(), [model]);
  const { kpis, months, reserves } = lq;

  // Re-express every base-currency figure in the chosen reporting currency at
  // the render boundary (no-op when the reporting currency is the model base).
  const rm = useReportingMoney();
  const { currency, convert } = rm;
  const exportDataset = React.useMemo(() => liquidityExport(lq, rm), [lq, rm]);
  /** Compact currency, e.g. `$9.2M`, in the reporting currency. */
  const compact = (value: number): string =>
    formatMoneyCompact(convert(value), currency);
  /** Full currency with no fractional cents, e.g. `$9,190,000`. */
  const whole = (value: number): string =>
    formatMoneyWhole(convert(value), currency);

  const availableSeries = months.map((m) => convert(m.availableLiquidity));
  const obligationSeries = months.map((m) => convert(m.obligation));
  const periodLabels = months.map((m) => monthLabel(m.period));

  // Per-tier reserve bar chart: deployable value after the stress haircut.
  const reserveBars = reserves.map((r) => ({
    label: r.label,
    value: convert(r.deployable),
  }));

  const hasShortfall = kpis.firstShortfallPeriod !== null;
  const coverageTone =
    kpis.coverageRatio === null
      ? "default"
      : kpis.coverageRatio >= 1
        ? "up"
        : "down";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <h1 className="text-lg font-semibold tracking-tight">
            Liquidity & capital-call coverage
          </h1>
          <div className="flex items-center gap-4">
            <ExportMenu dataset={exportDataset} testId="liquidity-export" />
            <a
              href="#/"
              data-testid="liquidity-back"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Back to dashboard
            </a>
          </div>
        </div>
      </header>

      <main
        className="mx-auto max-w-6xl space-y-6 px-6 py-10"
        data-testid="liquidity-page"
      >
        {/* Coverage verdict banner */}
        {hasShortfall ? (
          <div
            data-testid="liquidity-shortfall-banner"
            className="flex items-center gap-2 rounded-lg border border-[var(--color-chart-down)]/40 bg-[var(--color-chart-down)]/10 px-4 py-3 text-sm text-[var(--color-chart-down)]"
          >
            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
            <span>
              Coverage gap: deployable reserves fall short of the obligations due
              in{" "}
              <span className="font-semibold">
                {monthLabel(kpis.firstShortfallPeriod!)}
              </span>
              . Funding a call here would force an illiquid sale — raise
              liquidity ahead of the upcoming capital calls.
            </span>
          </div>
        ) : (
          <div
            data-testid="liquidity-covered-banner"
            className="flex items-center gap-2 rounded-lg border border-[var(--color-chart-up)]/40 bg-[var(--color-chart-up)]/10 px-4 py-3 text-sm text-[var(--color-chart-up)]"
          >
            <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
            <span>
              Fully covered: deployable reserves fund every capital call and the
              household burn across the {months.length}-month horizon without
              touching illiquids. Tightest point{" "}
              <span className="font-semibold">
                {kpis.worstPeriod ? monthLabel(kpis.worstPeriod) : "—"}
              </span>{" "}
              at {coverageLabel(kpis.worstCoverageRatio)}.
            </span>
          </div>
        )}

        {/* KPIs */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi
            testId="kpi-liquidity"
            label="Deployable"
            value={compact(kpis.totalLiquidity)}
            hint="after stress haircuts"
            icon={<Droplets className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-obligations"
            label="Obligations"
            value={compact(kpis.totalObligations)}
            hint="calls + burn"
            icon={<Banknote className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-calls"
            label="Capital calls"
            value={compact(kpis.totalCalls)}
            hint="committed-but-uncalled"
          />
          <Kpi
            testId="kpi-coverage"
            label="Coverage"
            value={coverageLabel(kpis.coverageRatio)}
            hint="deployable ÷ obligations"
            tone={coverageTone}
            icon={<Layers className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-worst"
            label="Worst month"
            value={coverageLabel(kpis.worstCoverageRatio)}
            hint={kpis.worstPeriod ? monthLabel(kpis.worstPeriod) : "—"}
            tone={
              kpis.worstCoverageRatio !== null && kpis.worstCoverageRatio < 1
                ? "warn"
                : "default"
            }
            icon={<TrendingDown className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-shortfall"
            label="Shortfall"
            value={compact(kpis.totalShortfall)}
            hint={hasShortfall ? "forced-sale risk" : "none — fully covered"}
            tone={hasShortfall ? "warn" : "up"}
          />
        </section>

        {/* Available liquidity vs obligation line chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Available liquidity vs obligations
            </CardTitle>
            <CardDescription>
              The deployable buffer (haircut reserves coming online and draining
              as calls clear) against each month's obligation over the{" "}
              {months.length}-month horizon. The buffer stepping down marks the
              months large capital calls land; it must stay above the obligation
              line to avoid a forced illiquid sale.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="w-full overflow-hidden">
              <LineChart
                series={[
                  {
                    label: "Available liquidity",
                    values: availableSeries,
                    color: "var(--color-chart-1)",
                  },
                  {
                    label: "Obligation due",
                    values: obligationSeries,
                    color: "var(--color-chart-down)",
                  },
                ]}
                width={1040}
                height={320}
                grid
                className="h-auto w-full"
                preserveAspectRatio="none"
              />
            </div>
            <div
              className="mt-3 flex flex-wrap items-center justify-between gap-4 text-xs text-muted-foreground"
              data-testid="liquidity-chart-summary"
            >
              <span>
                {periodLabels[0]} → {periodLabels[periodLabels.length - 1]}
              </span>
              <span>
                Tightest coverage:{" "}
                <span
                  className={cn(
                    "font-medium tabular-nums text-foreground",
                    kpis.worstCoverageRatio !== null &&
                      kpis.worstCoverageRatio < 1 &&
                      "text-[var(--color-chart-down)]",
                  )}
                >
                  {coverageLabel(kpis.worstCoverageRatio)}
                </span>{" "}
                {kpis.worstPeriod ? `in ${monthLabel(kpis.worstPeriod)}` : ""}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Reserve tier breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Liquid reserves by tier
            </CardTitle>
            <CardDescription>
              Deployable value of each reserve tier after its stress haircut —
              the liquidity actually available to fund a call without selling
              illiquids. Currency: {currency}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="w-full overflow-hidden">
              <BarChart
                data={reserveBars}
                width={1040}
                height={260}
                colorByIndex
                className="h-auto w-full"
                preserveAspectRatio="none"
              />
            </div>
            <div className="mt-4 overflow-x-auto">
              <table
                className="w-full text-sm"
                data-testid="liquidity-reserve-table"
              >
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Tier</th>
                    <th className="py-2 px-3 text-right font-medium">Gross</th>
                    <th className="py-2 px-3 text-right font-medium">Haircut</th>
                    <th className="py-2 px-3 text-right font-medium">
                      Deployable
                    </th>
                    <th className="py-2 pl-3 text-right font-medium">
                      Available
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {reserves.map((r) => (
                    <tr
                      key={r.id}
                      data-testid="liquidity-reserve-row"
                      data-tier={r.id}
                      className="border-b border-border/60 last:border-0"
                    >
                      <td className="py-2 pr-3 font-medium">{r.label}</td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        {whole(r.gross)}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">
                        {(r.haircut * 100).toFixed(0)}%
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        {whole(r.deployable)}
                      </td>
                      <td className="py-2 pl-3 text-right tabular-nums text-muted-foreground">
                        {r.availableFromMonth === 0
                          ? "Now"
                          : `+${r.availableFromMonth}mo`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Per-month coverage table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Monthly coverage</CardTitle>
            <CardDescription>
              Available liquidity, the obligation due, the resulting coverage
              ratio, any shortfall and the buffer carried forward — for every
              month with an obligation in the horizon.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table
                className="w-full text-sm"
                data-testid="liquidity-table"
              >
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Month</th>
                    <th className="py-2 px-3 text-right font-medium">
                      Available
                    </th>
                    <th className="py-2 px-3 text-right font-medium">
                      Obligation
                    </th>
                    <th className="py-2 px-3 text-right font-medium">
                      Coverage
                    </th>
                    <th className="py-2 px-3 text-right font-medium">
                      Shortfall
                    </th>
                    <th className="py-2 pl-3 text-right font-medium">Buffer</th>
                  </tr>
                </thead>
                <tbody>
                  {months
                    .filter((m) => m.obligation > 0)
                    .map((m) => (
                      <tr
                        key={m.index}
                        data-testid="liquidity-row"
                        data-period={m.period}
                        className="border-b border-border/60 last:border-0"
                      >
                        <td className="py-2 pr-3 font-medium">
                          {monthLabel(m.period)}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums">
                          {whole(m.availableLiquidity)}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-[var(--color-chart-down)]">
                          {whole(m.obligation)}
                        </td>
                        <td
                          className={cn(
                            "py-2 px-3 text-right font-medium tabular-nums",
                            m.coverageRatio !== null && m.coverageRatio < 1
                              ? "text-[var(--color-chart-down)]"
                              : "text-[var(--color-chart-up)]",
                          )}
                        >
                          {coverageLabel(m.coverageRatio)}
                        </td>
                        <td
                          className={cn(
                            "py-2 px-3 text-right tabular-nums",
                            m.shortfall > 0
                              ? "text-[var(--color-chart-down)]"
                              : "text-muted-foreground",
                          )}
                        >
                          {m.shortfall > 0 ? whole(m.shortfall) : "—"}
                        </td>
                        <td className="py-2 pl-3 text-right tabular-nums">
                          {whole(m.closingLiquidity)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

export default LiquidityPage;
