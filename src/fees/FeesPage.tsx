import * as React from "react";
import { Coins, Percent, TrendingDown, Wallet } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { BarChart } from "@/components/charts/bar-chart";
import { DonutChart } from "@/components/charts/donut-chart";
import { LineChart } from "@/components/charts/line-chart";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buildFeeModel, type FeeModel } from "@/lib/fees";
import { formatMoneyCompact, formatMoneyWhole, formatPercent } from "@/lib/format";
import { useReportingMoney } from "@/lib/reporting-currency";
import { cn } from "@/lib/utils";
import { ExportMenu } from "@/components/ExportMenu";
import { tableExport } from "@/lib/export";

/** Basis-points-aware percent, e.g. `0.45%` or `12.3%`. */
function percent(value: number, digits = 2): string {
  return formatPercent(value, { digits });
}

const COMPOSITION_COLORS: Record<string, string> = {
  management: "var(--color-chart-1)",
  fundExpenses: "var(--color-chart-2)",
  performance: "var(--color-chart-3)",
};

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

export interface FeesPageProps {
  /** Optional precomputed model (mainly for tests); defaults to the fixture. */
  model?: FeeModel;
}

/**
 * Fee & TCO transparency page.
 *
 * Headline KPIs (capital, all-in annual cost, blended expense ratio, fee drag),
 * a per-fund cost bar chart, a fee-composition donut (management vs. expenses
 * vs. carry) and a long-run fee-drag line chart (gross vs. net wealth) — all
 * driven by the deterministic fee engine via {@link buildFeeModel}. Pure and
 * offline; this is a READ-ONLY view that reports cost, never moves money.
 */
export function FeesPage({ model }: FeesPageProps) {
  const fees = React.useMemo(() => model ?? buildFeeModel(), [model]);
  const { kpis, funds, composition, drag, horizonYears } = fees;

  // Re-express every base-USD figure in the chosen reporting currency at the
  // render boundary (no-op when the reporting currency is the base).
  const { currency, convert } = useReportingMoney();
  const compact = (value: number): string =>
    formatMoneyCompact(convert(value), currency);
  const whole = (value: number): string =>
    formatMoneyWhole(convert(value), currency);

  const barData = funds.map((f) => ({
    label: f.name,
    value: convert(f.totalCost),
  }));
  const donutData = composition
    .filter((s) => s.value > 0)
    .map((s) => ({
      label: s.label,
      value: convert(s.value),
      color: COMPOSITION_COLORS[s.key],
    }));

  const grossSeries = drag.map((p) => convert(p.gross));
  const netSeries = drag.map((p) => convert(p.net));

  return (
    <AppShell
      title={<>Fees &amp; total cost of ownership</>}
      backTestId="fees-back"
      mainClassName="space-y-6"
      mainTestId="fees-page"
      actions={
        <ExportMenu
          dataset={tableExport(
            "fees",
            [
              "id",
              "name",
              "category",
              "invested",
              "managementCost",
              "fundExpenseCost",
              "performanceCost",
              "totalCost",
              "effectiveRate",
            ],
            fees.funds.map((f) => [
              f.id,
              f.name,
              f.category,
              f.invested,
              f.managementCost,
              f.fundExpenseCost,
              f.performanceCost,
              f.totalCost,
              f.effectiveRate,
            ]),
            fees,
          )}
          testId="fees-export"
        />
      }
    >
        {/* KPIs */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            testId="kpi-invested"
            label="Capital invested"
            value={compact(kpis.totalInvested)}
            hint="across all fee-bearing vehicles"
            icon={<Wallet className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-annual-cost"
            label="All-in annual cost"
            value={compact(kpis.totalAnnualCost)}
            hint="management + expenses + carry"
            tone="down"
            icon={<Coins className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-blended-rate"
            label="Blended expense ratio"
            value={percent(kpis.blendedRate)}
            hint="cost as a share of capital"
            icon={<Percent className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-drag"
            label="Fee drag on profit"
            value={percent(kpis.dragShareOfProfit, 1)}
            hint={`of gross gains over ${horizonYears} years`}
            tone="down"
            icon={<TrendingDown className="size-3.5" aria-hidden="true" />}
          />
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          {/* Per-fund cost bar chart */}
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="text-base">Annual cost by fund</CardTitle>
              <CardDescription>
                All-in annual cost per vehicle (management + fund expenses +
                realised carry), most expensive first.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="w-full overflow-hidden">
                <BarChart
                  data={barData}
                  width={640}
                  height={300}
                  colorByIndex
                  className="h-auto w-full"
                  preserveAspectRatio="none"
                />
              </div>
            </CardContent>
          </Card>

          {/* Fee composition donut */}
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="text-base">Fee composition</CardTitle>
              <CardDescription>
                Where the all-in cost goes, by fee type.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-3">
              <DonutChart
                data={donutData}
                size={220}
                thickness={0.45}
                centerLabel={compact(kpis.totalAnnualCost)}
                className="h-auto w-full max-w-[260px]"
              />
              <ul
                className="grid w-full grid-cols-1 gap-1.5"
                data-testid="composition-legend"
              >
                {composition.map((s) => (
                  <li
                    key={s.key}
                    data-testid="composition-row"
                    data-key={s.key}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="inline-block size-3 shrink-0 rounded-sm"
                        style={{ background: COMPOSITION_COLORS[s.key] }}
                      />
                      <span className="truncate">{s.label}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {whole(s.value)}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* Fee-drag line chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Fee drag on compounded wealth
            </CardTitle>
            <CardDescription>
              The same capital grown at the blended gross return over{" "}
              {horizonYears} years, with and without the all-in fee deducted each
              year. The widening gap is wealth lost to fees.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="w-full overflow-hidden">
              <LineChart
                series={[
                  {
                    label: "Gross (no fees)",
                    values: grossSeries,
                    color: "var(--color-chart-up)",
                  },
                  {
                    label: "Net (after fees)",
                    values: netSeries,
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
            <div className="mt-3 flex flex-wrap items-center justify-between gap-4 text-xs text-muted-foreground">
              <span className="flex flex-wrap items-center gap-4">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-0.5 w-4 bg-[var(--color-chart-up)]" />
                  Gross (no fees)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-0.5 w-4 bg-[var(--color-chart-down)]" />
                  Net (after fees)
                </span>
              </span>
              <span data-testid="drag-summary">
                Total drag over {horizonYears}y:{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {compact(fees.terminalDrag)}
                </span>
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Per-fund detail table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Per-fund breakdown</CardTitle>
            <CardDescription>
              Effective expense ratio and cost components for every vehicle.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="fees-table">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Fund</th>
                    <th className="py-2 px-3 font-medium">Category</th>
                    <th className="py-2 px-3 text-right font-medium">
                      Invested
                    </th>
                    <th className="py-2 px-3 text-right font-medium">Mgmt</th>
                    <th className="py-2 px-3 text-right font-medium">
                      Expenses
                    </th>
                    <th className="py-2 px-3 text-right font-medium">Carry</th>
                    <th className="py-2 px-3 text-right font-medium">Total</th>
                    <th className="py-2 pl-3 text-right font-medium">
                      Eff. rate
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {funds.map((f) => (
                    <tr
                      key={f.id}
                      data-testid="fees-row"
                      data-fund={f.id}
                      className="border-b border-border/60 last:border-0"
                    >
                      <td className="py-2 pr-3 font-medium">{f.name}</td>
                      <td className="py-2 px-3 text-muted-foreground">
                        {f.category}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        {whole(f.invested)}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        {whole(f.managementCost)}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        {whole(f.fundExpenseCost)}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        {whole(f.performanceCost)}
                      </td>
                      <td className="py-2 px-3 text-right font-medium tabular-nums">
                        {whole(f.totalCost)}
                      </td>
                      <td className="py-2 pl-3 text-right tabular-nums text-[var(--color-chart-down)]">
                        {percent(f.effectiveRate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
    </AppShell>
  );
}

export default FeesPage;
