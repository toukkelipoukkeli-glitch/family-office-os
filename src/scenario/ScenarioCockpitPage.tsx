import * as React from "react";
import { Activity, AlertTriangle, TrendingUp } from "lucide-react";

import { ExportMenu } from "@/components/ExportMenu";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  buildCockpitModel,
  COCKPIT_BASE_INPUT,
  type CockpitModel,
} from "@/lib/scenario/cockpit";
import { scenarioExport } from "@/lib/export";
import { getScenario, SCENARIO_RATIONALE } from "@/lib/scenario/named";
import { useHashQueryParam } from "@/lib/hash-location";
import {
  formatMoneyCompact,
  formatMoneySignedCompact,
  formatPercent,
} from "@/lib/format";
import { useReportingMoney } from "@/lib/reporting-currency";
import { cn } from "@/lib/utils";

import { FanChart } from "./FanChart";
import { TornadoChart } from "./TornadoChart";
import { WaterfallChart } from "./WaterfallChart";

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

export interface ScenarioCockpitProps {
  /** Optional precomputed model (mainly for tests); defaults to the fixture. */
  model?: CockpitModel;
}

/**
 * Scenario cockpit: the flagship cross-asset scenario & risk page.
 *
 * A net-worth projection **fan chart**, a **tornado** of named-scenario impacts,
 * and a day-zero repricing **waterfall** for the selected scenario — all driven
 * by the deterministic scenario engine via {@link buildCockpitModel}. Selecting
 * a tornado bar drives the waterfall + rationale. Pure and offline.
 */
export function ScenarioCockpit({ model }: ScenarioCockpitProps) {
  const cockpit = React.useMemo(
    () => model ?? buildCockpitModel(COCKPIT_BASE_INPUT),
    [model],
  );

  // Re-express every base-USD figure in the chosen reporting currency at the
  // render boundary. Conversion is a uniform scalar, so chart geometry (which
  // is relative) is unchanged; only the labelled values change unit.
  const rm = useReportingMoney();
  const { currency, convert } = rm;
  const exportDataset = React.useMemo(
    () => scenarioExport(cockpit, rm),
    [cockpit, rm],
  );
  const compact = (value: number): string =>
    formatMoneyCompact(convert(value), currency);
  const signedCompact = (value: number): string =>
    formatMoneySignedCompact(convert(value), currency);

  // Default selection: the worst scenario (first tornado bar). The selection is
  // a deep-linkable sub-view stored on the route's hash (`#/scenarios?s=<id>`),
  // so a chosen scenario is shareable and survives reload.
  const defaultScenarioId = cockpit.tornado.bars[0]?.scenarioId ?? "";
  const [selectedId, setSelectedId] = useHashQueryParam("s", defaultScenarioId);

  // If the URL points at a scenario that does not exist in this model, fall back
  // to the worst scenario so the waterfall never points at a missing id.
  const known = selectedId in cockpit.waterfalls;
  React.useEffect(() => {
    if (!known) setSelectedId(defaultScenarioId);
  }, [known, defaultScenarioId, setSelectedId]);
  const effectiveId = known ? selectedId : defaultScenarioId;

  const waterfall = cockpit.waterfalls[effectiveId];
  const selectedBar = cockpit.tornado.bars.find(
    (b) => b.scenarioId === effectiveId,
  );
  const rationale =
    effectiveId in SCENARIO_RATIONALE ? SCENARIO_RATIONALE[effectiveId] : "";
  const scenarioName = (() => {
    try {
      return getScenario(effectiveId).name;
    } catch {
      return waterfall?.scenarioName ?? "";
    }
  })();

  const { kpis } = cockpit;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <h1 className="text-lg font-semibold tracking-tight">
            Scenario cockpit
          </h1>
          <div className="flex items-center gap-4">
            <ExportMenu dataset={exportDataset} testId="scenario-export" />
            <a
              href="#/"
              data-testid="cockpit-back"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Back to dashboard
            </a>
          </div>
        </div>
      </header>

      <main
        className="mx-auto max-w-6xl space-y-6 px-6 py-10"
        data-testid="cockpit-page"
      >
        {/* KPIs */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            testId="kpi-networth"
            label="Net worth today"
            value={compact(kpis.initialNetWorth)}
            hint={`${cockpit.horizonYears}-year planning horizon`}
            icon={<Activity className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-expected"
            label="Expected (mean) terminal"
            value={compact(kpis.expectedTerminal)}
            hint={`median ${compact(kpis.medianTerminal)}`}
            icon={<TrendingUp className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-var"
            label="95% Value-at-Risk"
            value={compact(kpis.valueAtRisk95)}
            hint="terminal loss vs. today, 1-in-20 tail"
            tone="down"
            icon={<AlertTriangle className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-ploss"
            label="Probability of loss"
            value={percent(kpis.probabilityOfLoss)}
            hint="chance of ending below today"
            tone={kpis.probabilityOfLoss > 0.5 ? "down" : "default"}
          />
        </section>

        {/* Fan chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Net-worth projection fan
            </CardTitle>
            <CardDescription>
              Monte Carlo cone of total net worth over the next{" "}
              {cockpit.horizonYears} years — median with the 25–75 and 5–95
              percentile bands.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="w-full overflow-hidden">
              <FanChart
                points={cockpit.fan.points}
                width={1040}
                height={320}
                className="h-auto w-full"
                preserveAspectRatio="none"
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-4 bg-[var(--color-chart-1)]" />
                Median
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-3 rounded-sm bg-[var(--color-chart-1)] opacity-30" />
                25–75th pct
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-3 rounded-sm bg-[var(--color-chart-1)] opacity-[0.18]" />
                5–95th pct
              </span>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          {/* Tornado */}
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="text-base">Scenario impact tornado</CardTitle>
              <CardDescription>
                Change in expected terminal net worth per named stress, worst
                first. Click a bar to break it down.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TornadoChart
                bars={cockpit.tornado.bars}
                width={520}
                formatValue={signedCompact}
                className="h-auto w-full"
              />
              <ul className="mt-3 space-y-1" data-testid="tornado-legend">
                {cockpit.tornado.bars.map((bar) => {
                  const active = bar.scenarioId === effectiveId;
                  return (
                    <li key={bar.scenarioId}>
                      <button
                        type="button"
                        data-testid="scenario-select"
                        data-scenario={bar.scenarioId}
                        data-selected={active}
                        aria-pressed={active}
                        onClick={() => setSelectedId(bar.scenarioId)}
                        className={cn(
                          "flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                          active ? "bg-muted" : "hover:bg-muted/60",
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {bar.scenarioName}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 tabular-nums",
                            bar.meanDelta < 0
                              ? "text-[var(--color-chart-down)]"
                              : "text-[var(--color-chart-up)]",
                          )}
                        >
                          {signedCompact(bar.meanDelta)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>

          {/* Waterfall */}
          <Card className="flex flex-col">
            <CardHeader className="gap-1">
              <CardTitle
                className="text-base"
                data-testid="waterfall-title"
              >
                {scenarioName}: day-zero repricing
              </CardTitle>
              <CardDescription>
                How today&apos;s net worth reprices the instant the scenario
                hits, by asset class.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {waterfall ? (
                <>
                  <WaterfallChart
                    key={effectiveId}
                    model={waterfall}
                    width={720}
                    height={300}
                    formatValue={compact}
                    className="h-auto w-full"
                  />
                  <p
                    className="text-sm text-muted-foreground"
                    data-testid="waterfall-summary"
                  >
                    Net worth moves from{" "}
                    <span className="font-medium text-foreground tabular-nums">
                      {compact(waterfall.initialNetWorth)}
                    </span>{" "}
                    to{" "}
                    <span className="font-medium text-foreground tabular-nums">
                      {compact(waterfall.shockedNetWorth)}
                    </span>{" "}
                    (
                    <span
                      className={cn(
                        "tabular-nums",
                        selectedBar && selectedBar.initialDelta < 0
                          ? "text-[var(--color-chart-down)]"
                          : "text-[var(--color-chart-up)]",
                      )}
                    >
                      {signedCompact(
                        waterfall.shockedNetWorth - waterfall.initialNetWorth,
                      )}
                    </span>
                    ) on day zero.
                  </p>
                  {rationale && (
                    <p
                      className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground"
                      data-testid="scenario-rationale"
                    >
                      {rationale}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Select a scenario to see its repricing.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

export default ScenarioCockpit;
