import * as React from "react";
import { Activity, AlertTriangle, CalendarClock, History } from "lucide-react";

import { ExportMenu } from "@/components/ExportMenu";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { WaterfallChart } from "@/scenario/WaterfallChart";
import { buildStressModel, STRESS_BASE_INPUT, type StressModel } from "@/lib/stress";
import { stressExport } from "@/lib/export";
import { useHashQueryParam } from "@/lib/hash-location";
import {
  formatMoneyCompact,
  formatMoneySignedCompact,
  formatPercent,
  formatPercentSigned,
} from "@/lib/format";
import { useReportingMoney } from "@/lib/reporting-currency";
import { cn } from "@/lib/utils";

import { BeforeAfterChart } from "./BeforeAfterChart";

/** Signed percentage, e.g. `-32.5%`. */
function signedPercent(value: number): string {
  return formatPercentSigned(value);
}

function percent(value: number): string {
  return formatPercent(value);
}

interface KpiProps {
  testId: string;
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "down";
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
          tone === "down" && "text-[var(--color-chart-down)]",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export interface StressTestPageProps {
  /** Optional precomputed model (mainly for tests); defaults to the fixture. */
  model?: StressModel;
}

/**
 * Historical stress-test library page.
 *
 * Re-plays real market dislocations — the 2008 GFC, the 2020 COVID crash, the
 * 2022 rate shock — against the family book and shows what each *would have
 * done* to net worth: a grouped before/after comparison bar, a day-zero
 * repricing waterfall for the selected episode, and the documented provenance
 * (window, peak-to-trough, recovery, sources) behind every parameter set. All
 * driven by the deterministic stress engine via {@link buildStressModel}. Pure
 * and offline.
 */
export function StressTestPage({ model }: StressTestPageProps) {
  const stress = React.useMemo(
    () => model ?? buildStressModel(STRESS_BASE_INPUT),
    [model],
  );

  // Re-express every base-USD figure in the chosen reporting currency at the
  // render boundary. Conversion is a uniform scalar, so the auto-scaled chart
  // geometry is unchanged; only the labelled values change unit.
  const rm = useReportingMoney();
  const { currency, convert } = rm;
  const exportDataset = React.useMemo(
    () => stressExport(stress, rm),
    [stress, rm],
  );
  const compact = (value: number): string =>
    formatMoneyCompact(convert(value), currency);
  const signedCompact = (value: number): string =>
    formatMoneySignedCompact(convert(value), currency);

  // Default selection: the worst episode (first result, worst drawdown). The
  // selected episode is a deep-linkable sub-view stored on the route's hash
  // (`#/stress?e=<id>`), so a chosen episode is shareable and survives reload.
  const defaultEpisodeId = stress.results[0]?.scenario.id ?? "";
  const [selectedId, setSelectedId] = useHashQueryParam("e", defaultEpisodeId);

  // Resolve to a real episode; an unknown id in the URL falls back to the worst
  // episode so the detail panel never renders against a missing result.
  const selected =
    stress.results.find((r) => r.scenario.id === selectedId) ??
    stress.results[0];

  const worst = stress.results[0];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <History className="size-5" aria-hidden="true" />
            Historical stress tests
          </h1>
          <div className="flex items-center gap-4">
            <ExportMenu dataset={exportDataset} testId="stress-export" />
            <a
              href="#/"
              data-testid="stress-back"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Back to dashboard
            </a>
          </div>
        </div>
      </header>

      <main
        className="mx-auto max-w-6xl space-y-6 px-6 py-10"
        data-testid="stress-page"
      >
        {/* KPIs */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            testId="kpi-networth"
            label="Net worth today"
            value={compact(stress.netWorthToday)}
            hint={`${stress.horizonYears}-year recovery window`}
            icon={<Activity className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-worst"
            label="Worst-case drawdown"
            value={signedPercent(worst?.drawdownPct ?? 0)}
            hint={worst ? `${worst.scenario.name}` : undefined}
            tone="down"
            icon={<AlertTriangle className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-worst-loss"
            label="Worst-case loss"
            value={signedCompact(worst?.drawdown ?? 0)}
            hint="day-zero net-worth hit"
            tone="down"
          />
          <Kpi
            testId="kpi-episodes"
            label="Episodes tested"
            value={String(stress.results.length)}
            hint="documented historical scenarios"
            icon={<CalendarClock className="size-3.5" aria-hidden="true" />}
          />
        </section>

        {/* Before / after comparison */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Net worth: before vs. after each crisis
            </CardTitle>
            <CardDescription>
              What today&apos;s book would be worth the instant each historical
              shock hit — today&apos;s net worth (muted) vs. the shocked value
              (red), with the drawdown labelled.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="w-full overflow-hidden">
              <BeforeAfterChart
                results={stress.results}
                netWorthToday={stress.netWorthToday}
                width={1040}
                height={320}
                formatValue={compact}
                formatPct={signedPercent}
                className="h-auto w-full"
                preserveAspectRatio="none"
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-3 rounded-sm bg-[var(--color-chart-1)] opacity-30" />
                Net worth today
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-3 rounded-sm bg-[var(--color-chart-down)]" />
                After the shock
              </span>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          {/* Scenario list */}
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="text-base">Historical episodes</CardTitle>
              <CardDescription>
                Worst first. Select an episode to break down its impact.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5" data-testid="stress-list">
                {stress.results.map((r) => {
                  const active = r.scenario.id === selected?.scenario.id;
                  return (
                    <li key={r.scenario.id}>
                      <button
                        type="button"
                        data-testid="stress-select"
                        data-scenario={r.scenario.id}
                        data-selected={active}
                        aria-pressed={active}
                        onClick={() => setSelectedId(r.scenario.id)}
                        className={cn(
                          "flex w-full items-start justify-between gap-3 rounded-md border px-3 py-2.5 text-left transition-colors",
                          active
                            ? "border-border bg-muted"
                            : "border-transparent hover:bg-muted/60",
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {r.scenario.name}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {r.scenario.window.start} →{" "}
                            {r.scenario.window.end}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block text-sm font-semibold tabular-nums text-[var(--color-chart-down)]">
                            {signedPercent(r.drawdownPct)}
                          </span>
                          <span className="block text-xs text-muted-foreground tabular-nums">
                            {signedCompact(r.drawdown)}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>

          {/* Selected episode detail */}
          <Card className="flex flex-col">
            <CardHeader className="gap-1">
              <CardTitle className="text-base" data-testid="stress-detail-title">
                {selected?.scenario.name}: day-zero repricing
              </CardTitle>
              <CardDescription>
                How today&apos;s net worth reprices the instant the{" "}
                {selected?.scenario.period} shock hits, by asset class.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {selected ? (
                <>
                  <WaterfallChart
                    key={selected.scenario.id}
                    model={selected.waterfall}
                    width={760}
                    height={300}
                    formatValue={compact}
                    className="h-auto w-full"
                  />
                  <p
                    className="text-sm text-muted-foreground"
                    data-testid="stress-summary"
                  >
                    Net worth moves from{" "}
                    <span className="font-medium text-foreground tabular-nums">
                      {compact(selected.netWorthBefore)}
                    </span>{" "}
                    to{" "}
                    <span className="font-medium text-foreground tabular-nums">
                      {compact(selected.netWorthAfter)}
                    </span>{" "}
                    (
                    <span className="tabular-nums text-[var(--color-chart-down)]">
                      {signedCompact(selected.drawdown)} /{" "}
                      {signedPercent(selected.drawdownPct)}
                    </span>
                    ) on day zero.
                  </p>

                  {/* Forward + provenance grid */}
                  <dl
                    className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border border-border p-3 text-xs"
                    data-testid="stress-forward"
                  >
                    <div>
                      <dt className="text-muted-foreground">
                        Expected hit ({stress.horizonYears}y mean)
                      </dt>
                      <dd className="font-medium tabular-nums text-[var(--color-chart-down)]">
                        {signedCompact(selected.forward.meanDelta)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">
                        Tail risk (Δ 95% VaR)
                      </dt>
                      <dd className="font-medium tabular-nums">
                        {signedCompact(selected.forward.varDelta)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Recovery</dt>
                      <dd className="font-medium tabular-nums">
                        ~{selected.scenario.recoveryMonths} months
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">
                        Prob. still down ({stress.horizonYears}y)
                      </dt>
                      <dd className="font-medium tabular-nums">
                        {percent(selected.forward.probabilityOfLoss)}
                      </dd>
                    </div>
                  </dl>

                  <p className="text-sm text-muted-foreground">
                    {selected.scenario.description}
                  </p>

                  <div
                    className="rounded-md border border-border bg-muted/40 p-3"
                    data-testid="stress-sources"
                  >
                    <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Sources &amp; calibration
                    </p>
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      {selected.scenario.sources.map((src) => (
                        <li key={src} className="flex gap-1.5">
                          <span aria-hidden="true">•</span>
                          <span>{src}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Select an episode to see its repricing.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

export default StressTestPage;
