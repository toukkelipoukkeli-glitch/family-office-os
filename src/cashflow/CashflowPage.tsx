import * as React from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  TrendingDown,
  Wallet,
} from "lucide-react";

import { BarChart } from "@/components/charts/bar-chart";
import { LineChart } from "@/components/charts/line-chart";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buildCashflowModel, type CashflowModel } from "@/lib/cashflow";
import { formatMoneyCompact, formatMoneyWhole } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Compact currency, e.g. `$4.0M`, in the model's currency. */
function compact(value: number, currency: string): string {
  return formatMoneyCompact(value, currency);
}

/** Full currency with no fractional cents, e.g. `$4,000,000`, in the model's currency. */
function whole(value: number, currency: string): string {
  return formatMoneyWhole(value, currency);
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

export interface CashflowPageProps {
  /** Optional precomputed model (mainly for tests); defaults to the fixture. */
  model?: CashflowModel;
}

/**
 * Household cashflow projection page.
 *
 * Headline liquidity KPIs (opening / ending / minimum balance, total in- and
 * out-flows, net flow, and a first-shortfall warning), a projected monthly
 * **closing-balance** line chart, a per-category in/out-flow bar chart, and a
 * month-by-month projection table — all driven by the deterministic engine via
 * {@link buildCashflowModel}. The model folds recurring household flows together
 * with a private-markets capital-call / distribution schedule (m9-pe-lifecycle)
 * so the projected cash is net of PE pacing. Pure and offline; READ-ONLY: it
 * projects cash, it never moves money.
 */
export function CashflowPage({ model }: CashflowPageProps) {
  const cf = React.useMemo(() => model ?? buildCashflowModel(), [model]);
  const { kpis, months, categories, currency } = cf;

  const balanceSeries = months.map((m) => m.closingBalance);
  const periodLabels = months.map((m) => monthLabel(m.period));

  // Per-category bar chart: inflows positive, outflows negative, for an
  // at-a-glance picture of the largest cash movers over the horizon.
  const barData = categories.map((c) => ({
    label: c.category,
    value: c.direction === "inflow" ? c.total : -c.total,
  }));

  const hasShortfall = kpis.firstShortfallPeriod !== null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <h1 className="text-lg font-semibold tracking-tight">
            Household cashflow projection
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
        {/* Shortfall banner */}
        {hasShortfall && (
          <div
            data-testid="cashflow-shortfall-banner"
            className="flex items-center gap-2 rounded-lg border border-[var(--color-chart-down)]/40 bg-[var(--color-chart-down)]/10 px-4 py-3 text-sm text-[var(--color-chart-down)]"
          >
            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
            <span>
              Projected liquidity shortfall: cash first goes negative in{" "}
              <span className="font-semibold">
                {monthLabel(kpis.firstShortfallPeriod!)}
              </span>
              . Plan funding ahead of the upcoming capital calls.
            </span>
          </div>
        )}

        {/* KPIs */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi
            testId="kpi-opening"
            label="Opening"
            value={compact(kpis.openingBalance, currency)}
            hint="cash on hand today"
            icon={<Wallet className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-ending"
            label="Ending"
            value={compact(kpis.endingBalance, currency)}
            hint="end of horizon"
            tone={kpis.endingBalance >= kpis.openingBalance ? "up" : "down"}
          />
          <Kpi
            testId="kpi-min"
            label="Min balance"
            value={compact(kpis.minBalance, currency)}
            hint={monthLabel(kpis.minBalancePeriod)}
            tone={kpis.minBalance < 0 ? "warn" : "default"}
            icon={<TrendingDown className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-inflows"
            label="Total inflows"
            value={compact(kpis.totalInflows, currency)}
            hint="over the horizon"
            tone="up"
            icon={<ArrowUpRight className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-outflows"
            label="Total outflows"
            value={compact(kpis.totalOutflows, currency)}
            hint="over the horizon"
            tone="down"
            icon={<ArrowDownRight className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-net"
            label="Net flow"
            value={compact(kpis.netFlow, currency)}
            hint="inflows − outflows"
            tone={kpis.netFlow >= 0 ? "up" : "down"}
          />
        </section>

        {/* Projected balance line chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Projected closing balance
            </CardTitle>
            <CardDescription>
              Month-by-month projected cash on hand over the{" "}
              {months.length}-month horizon, net of recurring household flows and
              the private-markets capital-call / distribution schedule. Dips mark
              the months large capital calls clear.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="w-full overflow-hidden">
              <LineChart
                series={[
                  {
                    label: "Closing balance",
                    values: balanceSeries,
                    color: "var(--color-chart-1)",
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
              data-testid="cashflow-balance-summary"
            >
              <span>
                {periodLabels[0]} → {periodLabels[periodLabels.length - 1]}
              </span>
              <span>
                Lowest balance:{" "}
                <span
                  className={cn(
                    "font-medium tabular-nums text-foreground",
                    kpis.minBalance < 0 && "text-[var(--color-chart-down)]",
                  )}
                >
                  {compact(kpis.minBalance, currency)}
                </span>{" "}
                in {monthLabel(kpis.minBalancePeriod)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Per-category in/out bar chart */}
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="text-base">Cashflow by category</CardTitle>
            <CardDescription>
              Total inflow (positive) and outflow (negative) per category over
              the whole horizon — the largest movers of household cash.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="w-full overflow-hidden">
              <BarChart
                data={barData}
                width={1040}
                height={280}
                colorByIndex
                className="h-auto w-full"
                preserveAspectRatio="none"
              />
            </div>
          </CardContent>
        </Card>

        {/* Per-month projection table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Monthly projection</CardTitle>
            <CardDescription>
              Opening balance, inflows, outflows, net flow and closing balance
              for every month in the horizon. Currency: {currency}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="cashflow-table">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Month</th>
                    <th className="py-2 px-3 text-right font-medium">Opening</th>
                    <th className="py-2 px-3 text-right font-medium">Inflows</th>
                    <th className="py-2 px-3 text-right font-medium">
                      Outflows
                    </th>
                    <th className="py-2 px-3 text-right font-medium">Net</th>
                    <th className="py-2 pl-3 text-right font-medium">Closing</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((m) => (
                    <tr
                      key={m.index}
                      data-testid="cashflow-row"
                      data-period={m.period}
                      className="border-b border-border/60 last:border-0"
                    >
                      <td className="py-2 pr-3 font-medium">
                        {monthLabel(m.period)}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        {whole(m.openingBalance, currency)}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-[var(--color-chart-up)]">
                        {m.inflows > 0 ? whole(m.inflows, currency) : "—"}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-[var(--color-chart-down)]">
                        {m.outflows > 0 ? whole(m.outflows, currency) : "—"}
                      </td>
                      <td
                        className={cn(
                          "py-2 px-3 text-right tabular-nums",
                          m.netFlow < 0
                            ? "text-[var(--color-chart-down)]"
                            : "text-[var(--color-chart-up)]",
                        )}
                      >
                        {whole(m.netFlow, currency)}
                      </td>
                      <td
                        className={cn(
                          "py-2 pl-3 text-right font-medium tabular-nums",
                          m.closingBalance < 0 &&
                            "text-[var(--color-chart-down)]",
                        )}
                      >
                        {whole(m.closingBalance, currency)}
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
