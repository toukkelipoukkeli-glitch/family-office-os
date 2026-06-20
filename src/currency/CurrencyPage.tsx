import * as React from "react";
import { Globe, Shield, TrendingDown, Wallet } from "lucide-react";

import { BarChart } from "@/components/charts/bar-chart";
import { DonutChart, type DonutDatum } from "@/components/charts/donut-chart";
import { seriesColor } from "@/components/charts/palette";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buildCurrencyModel } from "@/lib/currency";
import {
  formatMoneyCompact,
  formatMoneyWhole,
  formatPercentIntl,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { ExportMenu } from "@/components/ExportMenu";
import { tableExport } from "@/lib/export";

/** Compact base-currency amount, e.g. `€6.5M`. */
function compact(value: number, currency: string): string {
  return formatMoneyCompact(value, currency);
}

/** Whole base-currency amount with no fractional units, e.g. `€6,500,000`. */
function whole(value: number, currency: string): string {
  return formatMoneyWhole(value, currency);
}

/** A signed percentage, e.g. `+50.0%` / `-1.3%`. */
function pct(fraction: number, opts: { signed?: boolean } = {}): string {
  return formatPercentIntl(fraction, { signed: opts.signed });
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

export interface CurrencyPageProps {
  /** Initial hedge ratio (0..1); defaults to 50%. Mainly for tests. */
  initialRatio?: number;
}

/**
 * Currency exposure & hedging page.
 *
 * Headline FX KPIs (total portfolio value, gross foreign exposure and its
 * share, residual unhedged exposure after the hedge, and the indicative annual
 * cost), a per-currency exposure donut, a hedge-ratio scenario slider that
 * recomputes the residual exposure and indicative cost live, and a per-currency
 * hedge table — all driven by the deterministic engine via
 * {@link buildCurrencyModel}. Pure and offline; READ-ONLY: it reports FX
 * exposure and the indicative cost of a hedge, it never trades or moves money.
 */
export function CurrencyPage({ initialRatio = 0.5 }: CurrencyPageProps) {
  const [ratioPct, setRatioPct] = React.useState(
    Math.round(initialRatio * 100),
  );
  const ratio = ratioPct / 100;

  const model = React.useMemo(
    () => buildCurrencyModel({ policy: { defaultRatio: ratio } }),
    [ratio],
  );
  const { base, kpis, exposures, hedges } = model;

  // Donut: one segment per currency bucket, base highlighted.
  const donutData: DonutDatum[] = exposures.map((e, i) => ({
    label: e.currency,
    value: e.valueBase,
    color: e.isBase ? "var(--color-muted-foreground)" : seriesColor(i),
  }));

  // Bar chart: residual unhedged exposure per foreign currency under the hedge.
  const barData = hedges.map((h) => ({
    label: h.currency,
    value: h.residualBase,
  }));

  const costTone = kpis.annualCost > 0 ? "down" : "up";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <h1 className="text-lg font-semibold tracking-tight">
            Currency exposure &amp; hedging
          </h1>
          <div className="flex items-center gap-4">
            <ExportMenu
              dataset={tableExport(
                "currency-exposure",
                [
                  "currency",
                  "isBase",
                  "valueBase",
                  "weight",
                  "positionCount",
                  "rateToBase",
                ],
                exposures.map((e) => [
                  e.currency,
                  e.isBase,
                  e.valueBase,
                  e.weight,
                  e.positionCount,
                  e.rateToBase,
                ]),
                model,
              )}
              testId="currency-export"
            />
            <a
              href="#/"
              data-testid="currency-back"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Back to dashboard
            </a>
          </div>
        </div>
      </header>

      <main
        className="mx-auto max-w-6xl space-y-6 px-6 py-10"
        data-testid="currency-page"
      >
        {/* KPIs */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Kpi
            testId="kpi-total"
            label="Portfolio"
            value={compact(kpis.totalBase, base)}
            hint={`reporting base ${base}`}
            icon={<Wallet className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-foreign"
            label="Foreign exposure"
            value={compact(kpis.foreignBase, base)}
            hint={`${pct(kpis.foreignShare)} of portfolio`}
            icon={<Globe className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-residual"
            label="Unhedged"
            value={compact(kpis.residualBase, base)}
            hint={`${pct(kpis.residualShare)} after hedge`}
            tone="warn"
            icon={<TrendingDown className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-hedged"
            label="Hedge ratio"
            value={pct(kpis.effectiveHedgeRatio)}
            hint="of foreign exposure"
            tone="up"
            icon={<Shield className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-cost"
            label="Indic. cost / yr"
            value={whole(kpis.annualCost, base)}
            hint={`${pct(kpis.annualCostBps / 10000, { signed: true })} of portfolio`}
            tone={costTone}
          />
        </section>

        {/* Hedge-ratio scenario control */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Hedge-ratio scenario</CardTitle>
            <CardDescription>
              Drag to choose what fraction of every foreign-currency exposure to
              hedge. The residual exposure, effective hedge ratio and indicative
              annual cost above recompute live. Indicative only — READ-ONLY, no
              forward is placed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={ratioPct}
                onChange={(e) => setRatioPct(Number(e.target.value))}
                data-testid="hedge-ratio-slider"
                aria-label="Hedge ratio"
                className="w-full accent-[var(--color-chart-1)] sm:max-w-md"
              />
              <span
                data-testid="hedge-ratio-value"
                className="text-2xl font-semibold tabular-nums"
              >
                {ratioPct}%
              </span>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Exposure donut */}
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="text-base">Exposure by currency</CardTitle>
              <CardDescription>
                Portfolio value rolled up by denominating currency and converted
                into {base}. The base currency carries no FX risk.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col items-center gap-4">
              <DonutChart
                data={donutData}
                size={220}
                thickness={0.45}
                centerLabel={compact(kpis.totalBase, base)}
              />
              <ul
                className="grid w-full grid-cols-2 gap-x-4 gap-y-1 text-xs"
                data-testid="currency-legend"
              >
                {exposures.map((e, i) => (
                  <li
                    key={e.currency}
                    data-testid="currency-legend-item"
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="flex items-center gap-1.5">
                      <span
                        className="inline-block size-2.5 rounded-sm"
                        style={{
                          background: e.isBase
                            ? "var(--color-muted-foreground)"
                            : seriesColor(i),
                        }}
                        aria-hidden="true"
                      />
                      {e.currency}
                      {e.isBase && (
                        <span className="text-muted-foreground">(base)</span>
                      )}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {pct(e.weight)}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Residual exposure bar chart */}
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="text-base">
                Residual unhedged exposure
              </CardTitle>
              <CardDescription>
                What remains at risk per foreign currency after applying a{" "}
                {ratioPct}% hedge, in {base}.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 items-center">
              <div className="w-full overflow-hidden">
                <BarChart
                  data={barData}
                  width={520}
                  height={240}
                  colorByIndex
                  className="h-auto w-full"
                  preserveAspectRatio="none"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Per-currency hedge table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Hedge cost by currency
            </CardTitle>
            <CardDescription>
              Gross exposure, hedged fraction, residual exposure and the
              indicative annualised cost (forward points / carry) per foreign
              currency. A negative cost means the hedge earns carry.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table
                className="w-full text-sm tabular-nums"
                data-testid="currency-hedge-table"
              >
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Currency</th>
                    <th className="py-2 pr-4 text-right font-medium">Gross</th>
                    <th className="py-2 pr-4 text-right font-medium">Hedge</th>
                    <th className="py-2 pr-4 text-right font-medium">
                      Residual
                    </th>
                    <th className="py-2 pr-4 text-right font-medium">Rate</th>
                    <th className="py-2 text-right font-medium">Cost / yr</th>
                  </tr>
                </thead>
                <tbody>
                  {hedges.map((h) => (
                    <tr
                      key={h.currency}
                      data-testid="currency-hedge-row"
                      data-currency={h.currency}
                      className="border-b border-border/60"
                    >
                      <td className="py-2 pr-4 font-medium">{h.currency}</td>
                      <td className="py-2 pr-4 text-right">
                        {whole(h.grossBase, base)}
                      </td>
                      <td className="py-2 pr-4 text-right">
                        {pct(h.ratio)}
                      </td>
                      <td className="py-2 pr-4 text-right">
                        {whole(h.residualBase, base)}
                      </td>
                      <td className="py-2 pr-4 text-right text-muted-foreground">
                        {pct(h.costRate, { signed: true })}
                      </td>
                      <td
                        className={cn(
                          "py-2 text-right",
                          h.annualCost > 0 && "text-[var(--color-chart-down)]",
                          h.annualCost < 0 && "text-[var(--color-chart-up)]",
                        )}
                      >
                        {whole(h.annualCost, base)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr
                    className="font-medium"
                    data-testid="currency-hedge-total"
                  >
                    <td className="py-2 pr-4">Total</td>
                    <td className="py-2 pr-4 text-right">
                      {whole(kpis.foreignBase, base)}
                    </td>
                    <td className="py-2 pr-4 text-right">
                      {pct(kpis.effectiveHedgeRatio)}
                    </td>
                    <td className="py-2 pr-4 text-right">
                      {whole(kpis.residualBase, base)}
                    </td>
                    <td className="py-2 pr-4" />
                    <td
                      className={cn(
                        "py-2 text-right",
                        kpis.annualCost > 0 && "text-[var(--color-chart-down)]",
                        kpis.annualCost < 0 && "text-[var(--color-chart-up)]",
                      )}
                    >
                      {whole(kpis.annualCost, base)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

export default CurrencyPage;
