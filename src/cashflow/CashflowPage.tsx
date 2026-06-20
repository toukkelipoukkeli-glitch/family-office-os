import * as React from "react";
import { Activity, AlertTriangle, TrendingDown, Wallet } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  FLOW_KINDS,
  FLOW_KIND_LABELS,
  SAMPLE_FORECAST_INPUT,
  TIGHT_FORECAST_INPUT,
  forecastCashflow,
  type CashflowForecastInput,
} from "@/lib/cashflow";
import { cn } from "@/lib/utils";

import { RunwayChart } from "./RunwayChart";
import {
  compactCurrency,
  flowRows,
  runwayKpis,
  runwayPoints,
  signedCompactCurrency,
} from "./cashflow-view";

interface KpiProps {
  testId: string;
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "up" | "down";
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
          tone === "up" && "text-[var(--color-chart-up)]",
        )}
        data-tone={tone}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

type ScenarioId = "base" | "tight";

const SCENARIOS: Record<
  ScenarioId,
  { label: string; description: string; input: CashflowForecastInput }
> = {
  base: {
    label: "Base case",
    description:
      "Current liquid cash buffer against the standing 12-month schedule.",
    input: SAMPLE_FORECAST_INPUT,
  },
  tight: {
    label: "Thin buffer",
    description:
      "The same commitments and expenses, but starting from a much smaller cash position — the runway runs out mid-year.",
    input: TIGHT_FORECAST_INPUT,
  },
};

export interface CashflowPageProps {
  /** Optional override input (mainly for tests); defaults to the base scenario. */
  input?: CashflowForecastInput;
}

/**
 * Cashflow & liquidity-runway page.
 *
 * Projects the family office's liquid cash balance across a 12-month schedule of
 * commitments (drawdowns), distributions (inflows) and operating expenses, and
 * charts the resulting **runway** — how long the cash lasts before it would be
 * forced to raise liquidity. A scenario toggle switches between the base case
 * and a thin-buffer case that depletes mid-year. Pure and offline.
 */
export function CashflowPage({ input }: CashflowPageProps) {
  const [scenario, setScenario] = React.useState<ScenarioId>("base");

  const activeInput = input ?? SCENARIOS[scenario].input;
  const forecast = React.useMemo(
    () => forecastCashflow(activeInput),
    [activeInput],
  );

  const kpis = runwayKpis(forecast);
  const points = runwayPoints(forecast);
  const rows = flowRows(forecast);
  const cur = forecast.baseCurrency;
  const controlled = input !== undefined;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <h1 className="text-lg font-semibold tracking-tight">
            Cashflow &amp; liquidity runway
          </h1>
          <a
            href="#/"
            data-testid="cashflow-back"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Back to dashboard
          </a>
        </div>
      </header>

      <main
        className="mx-auto max-w-6xl space-y-6 px-6 py-10"
        data-testid="cashflow-page"
      >
        {/* Scenario toggle */}
        {!controlled && (
          <div
            className="inline-flex rounded-lg border border-border p-1"
            data-testid="scenario-toggle"
            role="group"
            aria-label="Forecast scenario"
          >
            {(Object.keys(SCENARIOS) as ScenarioId[]).map((id) => {
              const active = id === scenario;
              return (
                <button
                  key={id}
                  type="button"
                  data-testid={`scenario-${id}`}
                  data-selected={active}
                  aria-pressed={active}
                  onClick={() => setScenario(id)}
                  className={cn(
                    "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {SCENARIOS[id].label}
                </button>
              );
            })}
          </div>
        )}

        {/* KPIs */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            testId="kpi-opening"
            label="Opening cash"
            value={kpis.openingCash}
            hint={`${forecast.periods}-month projection`}
            icon={<Wallet className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-runway"
            label="Liquidity runway"
            value={kpis.runway}
            hint={
              forecast.runwayExhausted
                ? "until cash first goes negative"
                : "covered across the horizon"
            }
            tone={kpis.runwayTone}
            icon={<Activity className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-lowest"
            label="Lowest balance"
            value={kpis.lowestBalance}
            hint={`trough at ${kpis.lowestPeriodLabel}`}
            tone={kpis.lowestTone}
            icon={<TrendingDown className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-ending"
            label="Ending cash"
            value={kpis.endingCash}
            hint={`net ${kpis.netChange} over the year`}
            tone={kpis.endingTone}
            icon={<AlertTriangle className="size-3.5" aria-hidden="true" />}
          />
        </section>

        {/* Runway chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Liquidity runway</CardTitle>
            <CardDescription data-testid="scenario-description">
              {controlled ? "Projected cash balance over the horizon." : SCENARIOS[scenario].description}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="w-full overflow-hidden">
              <RunwayChart
                key={controlled ? "controlled" : scenario}
                points={points}
                depletionPeriod={forecast.depletionPeriod}
                lowestPeriod={forecast.lowestBalancePeriod}
                width={960}
                height={320}
                className="h-auto w-full"
                preserveAspectRatio="none"
                formatValue={(v) => compactCurrency(v, cur)}
              />
            </div>
            <p
              className="mt-3 text-sm text-muted-foreground"
              data-testid="runway-summary"
            >
              Cash {forecast.runwayExhausted ? "runs out" : "holds"} —{" "}
              <span
                className={cn(
                  "font-medium tabular-nums",
                  forecast.runwayExhausted
                    ? "text-[var(--color-chart-down)]"
                    : "text-[var(--color-chart-up)]",
                )}
              >
                {kpis.runway}
              </span>{" "}
              of runway. Opening {kpis.openingCash} moves to ending{" "}
              <span className="font-medium tabular-nums text-foreground">
                {kpis.endingCash}
              </span>{" "}
              ({kpis.netChange}). The trough is {kpis.lowestBalance} at{" "}
              {kpis.lowestPeriodLabel}.
            </p>
          </CardContent>
        </Card>

        {/* Per-period flow table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Period-by-period flows</CardTitle>
            <CardDescription>
              Opening balance, the commitments / distributions / expenses applied
              each month, the net change, and the resulting closing balance.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table
                className="w-full border-collapse text-sm tabular-nums"
                data-testid="flow-table"
              >
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-2 py-2 font-medium">Period</th>
                    <th className="px-2 py-2 text-right font-medium">Opening</th>
                    {FLOW_KINDS.map((k) => (
                      <th
                        key={k}
                        className="px-2 py-2 text-right font-medium"
                      >
                        {FLOW_KIND_LABELS[k]}
                      </th>
                    ))}
                    <th className="px-2 py-2 text-right font-medium">Net</th>
                    <th className="px-2 py-2 text-right font-medium">Closing</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.period}
                      data-testid="flow-row"
                      data-period={row.period}
                      data-breached={row.breached}
                      className={cn(
                        "border-b border-border/60",
                        row.breached && "bg-[var(--color-chart-down)]/5",
                      )}
                    >
                      <td className="px-2 py-1.5 font-medium">{row.label}</td>
                      <td className="px-2 py-1.5 text-right">
                        {compactCurrency(row.opening, cur)}
                      </td>
                      {FLOW_KINDS.map((k) => {
                        const v = row.byKind[k];
                        return (
                          <td
                            key={k}
                            className={cn(
                              "px-2 py-1.5 text-right",
                              v < 0 && "text-[var(--color-chart-down)]",
                              v > 0 && "text-[var(--color-chart-up)]",
                              v === 0 && "text-muted-foreground",
                            )}
                          >
                            {v === 0 ? "—" : signedCompactCurrency(v, cur)}
                          </td>
                        );
                      })}
                      <td
                        className={cn(
                          "px-2 py-1.5 text-right font-medium",
                          row.net < 0
                            ? "text-[var(--color-chart-down)]"
                            : "text-[var(--color-chart-up)]",
                        )}
                      >
                        {signedCompactCurrency(row.net, cur)}
                      </td>
                      <td
                        className={cn(
                          "px-2 py-1.5 text-right font-semibold",
                          row.breached && "text-[var(--color-chart-down)]",
                        )}
                      >
                        {compactCurrency(row.closing, cur)}
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

export default CashflowPage;
