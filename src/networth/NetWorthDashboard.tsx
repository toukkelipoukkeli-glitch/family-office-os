import * as React from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { AreaChart } from "@/components/charts/area-chart";
import { ChartFigure } from "@/components/charts/chart-figure";
import { DonutChart, type DonutDatum } from "@/components/charts/donut-chart";
import { seriesColor } from "@/components/charts/palette";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { assetClassLabel } from "@/lib/model/asset-class";
import { Money } from "@/lib/money";
import type {
  AssetClassDetail,
  NetWorthDashboardModel,
  NetWorthSeries,
} from "@/lib/networth";
import { cn } from "@/lib/utils";

/** Compact currency string, e.g. `$12.5M` / `$840K`, for axis-free KPIs. */
function compactMoney(money: Money): string {
  const n = money.amount.toNumber();
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: money.currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

/** Full currency string with no fractional minor units. */
function fullMoney(money: Money): string {
  return money.format({ fractionDigits: 0 });
}

/** Signed percent string for a return/change, e.g. `+18.4%` / `-3.2%`. */
function signedPercent(value: { toNumber(): number }): string {
  const pct = value.toNumber() * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

/** Unsigned percent string for a share/weight, e.g. `41.1%`. */
function sharePercent(value: { toNumber(): number }): string {
  return `${(value.toNumber() * 100).toFixed(1)}%`;
}

function seriesValues(series: NetWorthSeries): number[] {
  return series.points.map((p) => p.value.amount.toNumber());
}

interface KpiProps {
  label: string;
  value: string;
  hint?: string;
  trend?: "up" | "down";
  testId?: string;
}

function Kpi({ label, value, hint, trend, testId }: KpiProps) {
  return (
    <div
      data-testid={testId}
      className="rounded-lg border border-border p-4"
    >
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 flex items-center gap-1 text-2xl font-semibold tabular-nums">
        {trend === "up" && (
          <ArrowUpRight className="size-5 text-[var(--color-chart-up)]" aria-hidden="true" />
        )}
        {trend === "down" && (
          <ArrowDownRight className="size-5 text-[var(--color-chart-down)]" aria-hidden="true" />
        )}
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export interface NetWorthDashboardProps {
  model: NetWorthDashboardModel;
}

/**
 * Net-worth-over-time dashboard with allocation drill-down.
 *
 * Renders the consolidated net-worth history (area chart) and headline KPIs, an
 * allocation donut, and a clickable list of asset classes. Selecting a class
 * swaps the chart + KPIs to that class's own history — the drill-down. Pure and
 * deterministic: all data comes from the supplied {@link NetWorthDashboardModel}.
 */
export function NetWorthDashboard({ model }: NetWorthDashboardProps) {
  // `null` selection = consolidated view; otherwise drill into one asset class.
  const [selected, setSelected] = React.useState<string | null>(null);

  const selectedDetail: AssetClassDetail | undefined = React.useMemo(
    () => model.byAssetClass.find((d) => d.assetClass === selected),
    [model.byAssetClass, selected],
  );

  const activeSeries = selectedDetail ? selectedDetail.series : model.total;
  const activeValue = selectedDetail ? selectedDetail.value : model.current;
  const openingValue = activeSeries.points[0]?.value ?? model.opening;
  const change = activeValue.minus(openingValue);
  const changePct =
    openingValue.amount.isZero()
      ? "0.0%"
      : signedPercent(change.amount.div(openingValue.amount));
  const trend: "up" | "down" | undefined = change.amount.isZero()
    ? undefined
    : change.amount.isNegative()
      ? "down"
      : "up";
  const activeColor = selectedDetail
    ? seriesColor(model.byAssetClass.indexOf(selectedDetail))
    : "var(--color-chart-1)";

  const donutData: DonutDatum[] = model.byAssetClass.map((d, i) => ({
    label: assetClassLabel(d.assetClass),
    value: d.value.amount.toNumber(),
    color: seriesColor(i),
  }));

  const headingTitle = selectedDetail
    ? assetClassLabel(selectedDetail.assetClass)
    : "Total net worth";
  const firstDate = activeSeries.points[0]?.date ?? "";
  const lastDate =
    activeSeries.points[activeSeries.points.length - 1]?.date ?? "";

  return (
    <div className="space-y-6" data-testid="networth-dashboard">
      <Card>
        <CardHeader className="flex-col gap-1 space-y-0 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle data-testid="networth-chart-title">
              {headingTitle}
            </CardTitle>
            <CardDescription>
              {selectedDetail
                ? `${selectedDetail.holdingCount} holding${selectedDetail.holdingCount === 1 ? "" : "s"} · ${sharePercent(selectedDetail.weight)} of the book`
                : "Consolidated across every account and holding"}
              {firstDate && lastDate ? ` · ${firstDate} → ${lastDate}` : ""}
            </CardDescription>
          </div>
          {selectedDetail && (
            <button
              type="button"
              data-testid="networth-clear-selection"
              onClick={() => setSelected(null)}
              className="self-start rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
            >
              Back to total
            </button>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Kpi
              testId="kpi-current"
              label={selectedDetail ? "Class value" : "Net worth"}
              value={fullMoney(activeValue)}
              hint={`as of ${lastDate}`}
            />
            <Kpi
              testId="kpi-change"
              label="Change over window"
              value={`${change.amount.isNegative() ? "-" : "+"}${compactMoney(change.abs())}`}
              hint={`since ${firstDate}`}
              trend={trend}
            />
            <Kpi
              testId="kpi-return"
              label="Return over window"
              value={changePct}
              hint={
                selectedDetail
                  ? "asset-class growth"
                  : `TWR ${signedPercent(model.totalReturn)}`
              }
              trend={trend}
            />
          </div>

          <ChartFigure
            testId="networth-area-figure"
            caption={`${headingTitle} over time, in ${model.baseCurrency}.`}
            hideCaption
            columns={[
              { header: "Date" },
              { header: `Value (${model.baseCurrency})`, align: "right" },
            ]}
            rows={activeSeries.points.map((p) => [
              p.date,
              fullMoney(p.value),
            ])}
          >
            <div className="w-full overflow-hidden">
              <AreaChart
                key={selected ?? "__total__"}
                data-testid="networth-area"
                values={seriesValues(activeSeries)}
                color={activeColor}
                width={920}
                height={260}
                className="h-auto w-full"
                preserveAspectRatio="none"
              />
            </div>
          </ChartFigure>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Allocation</CardTitle>
            <CardDescription>By asset class, in {model.baseCurrency}.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <ChartFigure
              testId="networth-donut-figure"
              caption={`Allocation by asset class, in ${model.baseCurrency}.`}
              hideCaption
              tableMode="visually-hidden"
              columns={[
                { header: "Asset class" },
                { header: `Value (${model.baseCurrency})`, align: "right" },
              ]}
              rows={model.byAssetClass.map((d) => [
                assetClassLabel(d.assetClass),
                fullMoney(d.value),
              ])}
            >
              <DonutChart
                data={donutData}
                size={200}
                thickness={0.42}
                centerLabel={compactMoney(model.current)}
                data-testid="networth-donut"
              />
            </ChartFigure>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Drill down by asset class</CardTitle>
            <CardDescription>
              Select a class to see its own net-worth history.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {model.byAssetClass.length === 0 ? (
              <p className="text-sm text-muted-foreground">No valued holdings.</p>
            ) : (
              <ul className="divide-y divide-border" data-testid="asset-class-list">
                {model.byAssetClass.map((detail, i) => {
                  const isActive = detail.assetClass === selected;
                  return (
                    <li key={detail.assetClass}>
                      <button
                        type="button"
                        data-testid="asset-class-row"
                        data-asset-class={detail.assetClass}
                        data-selected={isActive}
                        aria-pressed={isActive}
                        onClick={() =>
                          setSelected(isActive ? null : detail.assetClass)
                        }
                        className={cn(
                          "flex w-full items-center gap-3 py-2.5 text-left transition-colors",
                          isActive ? "bg-muted" : "hover:bg-muted/60",
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className="size-3 shrink-0 rounded-sm"
                          style={{ backgroundColor: seriesColor(i) }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {assetClassLabel(detail.assetClass)}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {detail.holdingCount} holding
                            {detail.holdingCount === 1 ? "" : "s"} ·{" "}
                            {sharePercent(detail.weight)} of book
                          </span>
                        </span>
                        <span className="shrink-0 text-right text-sm font-medium tabular-nums">
                          {compactMoney(detail.value)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default NetWorthDashboard;
