import * as React from "react";
import { Activity, Gauge, Scale, Target } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LineChart } from "@/components/charts/line-chart";
import {
  BENCHMARK_CHOICES,
  FAMILY_PORTFOLIO,
  PERIODS_PER_YEAR,
} from "@/lib/benchmark";
import { buildBenchmarkView, type BenchmarkView } from "@/lib/benchmark/view";
import { cn } from "@/lib/utils";

import { ExcessReturnChart } from "./ExcessReturnChart";

/** Signed percentage, e.g. `+1.23%`. */
function pct(value: number, { signed = false, digits = 2 } = {}): string {
  const s = `${(value * 100).toFixed(digits)}%`;
  if (!signed) return s;
  return value > 0 ? `+${s}` : s;
}

/** Plain decimal ratio, e.g. `1.24` or `+0.18`. */
function ratio(value: number, { signed = false, digits = 2 } = {}): string {
  const s = value.toFixed(digits);
  if (!signed) return s;
  return value > 0 ? `+${s}` : s;
}

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
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export interface BenchmarkPageProps {
  /** Optional precomputed view (mainly for tests); defaults to the fixture. */
  view?: BenchmarkView;
}

/**
 * Benchmark + relative-performance page.
 *
 * Measures the family portfolio against a selectable benchmark (bespoke policy
 * mix, classic 60/40, broad equity, or aggregate bonds) over twelve monthly
 * periods. Headline KPIs report excess return, annualized tracking error,
 * information ratio and beta; an **indexed growth chart** overlays the portfolio
 * and benchmark equity curves; an **excess-return strip** shows where the
 * portfolio added or gave back value period by period; a detail table backs it.
 * Pure, deterministic and offline — driven by the benchmark engine.
 */
export function BenchmarkPage({ view }: BenchmarkPageProps) {
  const [benchmarkId, setBenchmarkId] = React.useState<string>(
    BENCHMARK_CHOICES[0].id,
  );

  const model = React.useMemo<BenchmarkView>(() => {
    if (view) return view;
    const choice =
      BENCHMARK_CHOICES.find((c) => c.id === benchmarkId) ??
      BENCHMARK_CHOICES[0];
    return buildBenchmarkView({
      portfolioLabel: FAMILY_PORTFOLIO.label,
      benchmarkLabel: choice.label,
      portfolio: FAMILY_PORTFOLIO.returns,
      benchmark: choice.returns,
      periodsPerYear: PERIODS_PER_YEAR,
    });
  }, [view, benchmarkId]);

  const m = model.metrics;
  const excessTone = m.totalExcessReturn >= 0 ? "up" : "down";
  const irTone = m.informationRatio >= 0 ? "up" : "down";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <h1 className="text-lg font-semibold tracking-tight">
            Benchmark &amp; relative performance
          </h1>
          <a
            href="#/"
            data-testid="benchmark-back"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Back to dashboard
          </a>
        </div>
      </header>

      <main
        className="mx-auto max-w-6xl space-y-6 px-6 py-10"
        data-testid="benchmark-page"
      >
        {/* Benchmark selector */}
        <div
          className="flex flex-wrap items-center gap-2"
          data-testid="benchmark-toggle"
          role="group"
          aria-label="Benchmark"
        >
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            Benchmark
          </span>
          {BENCHMARK_CHOICES.map((c) => {
            const selected = !view && c.id === benchmarkId;
            const disabled = Boolean(view); // controlled externally in tests
            return (
              <button
                key={c.id}
                type="button"
                data-testid="benchmark-select"
                data-benchmark={c.id}
                data-selected={selected}
                aria-pressed={selected}
                disabled={disabled}
                onClick={() => setBenchmarkId(c.id)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm transition-colors",
                  selected
                    ? "border-border bg-muted font-medium"
                    : "border-transparent hover:bg-muted/60",
                  disabled && "cursor-default opacity-60",
                )}
                title={c.hint}
              >
                {c.label}
              </button>
            );
          })}
        </div>

        {/* KPIs */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            testId="kpi-excess"
            label="Excess return"
            value={pct(m.totalExcessReturn, { signed: true })}
            hint={`vs. ${model.benchmarkLabel} (period total)`}
            tone={excessTone}
            icon={<Scale className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-tracking-error"
            label="Tracking error"
            value={pct(m.trackingError)}
            hint="annualized, of active return"
            icon={<Activity className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-info-ratio"
            label="Information ratio"
            value={ratio(m.informationRatio, { signed: true })}
            hint="annualized excess / tracking error"
            tone={irTone}
            icon={<Target className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-beta"
            label="Beta"
            value={ratio(m.beta)}
            hint={`α ${pct(m.alpha, { signed: true })} · ρ ${ratio(m.correlation)}`}
            icon={<Gauge className="size-3.5" aria-hidden="true" />}
          />
        </section>

        {/* Indexed growth curves */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Growth of 1.00 (indexed)</CardTitle>
            <CardDescription>
              The {model.portfolioLabel.toLowerCase()} and{" "}
              <span className="font-medium text-foreground">
                {model.benchmarkLabel}
              </span>{" "}
              equity curves, each starting at 1.00 and compounding monthly. The
              portfolio ends at{" "}
              <span className="font-medium text-foreground tabular-nums">
                {ratio(model.portfolioCurve[model.portfolioCurve.length - 1])}
              </span>{" "}
              vs.{" "}
              <span className="font-medium text-foreground tabular-nums">
                {ratio(model.benchmarkCurve[model.benchmarkCurve.length - 1])}
              </span>
              .
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-3 rounded-sm bg-[var(--color-chart-1)]" />
                {model.portfolioLabel}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-3 rounded-sm bg-[var(--color-chart-2)]" />
                {model.benchmarkLabel}
              </span>
            </div>
            <div className="w-full overflow-hidden">
              <LineChart
                data-testid="growth-chart"
                series={[
                  {
                    label: model.portfolioLabel,
                    values: model.portfolioCurve,
                    color: "var(--color-chart-1)",
                  },
                  {
                    label: model.benchmarkLabel,
                    values: model.benchmarkCurve,
                    color: "var(--color-chart-2)",
                  },
                ]}
                width={1040}
                height={320}
                className="h-auto w-full"
                preserveAspectRatio="none"
              />
            </div>
          </CardContent>
        </Card>

        {/* Per-period excess */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Excess return by period
            </CardTitle>
            <CardDescription>
              Portfolio minus benchmark, month by month — green above the axis
              when the portfolio beat its benchmark, red below when it lagged.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="w-full overflow-hidden">
              <ExcessReturnChart
                excess={model.excess}
                width={1040}
                height={200}
                formatValue={(v) => pct(v, { signed: true })}
                className="h-auto w-full"
                preserveAspectRatio="none"
              />
            </div>
          </CardContent>
        </Card>

        {/* Detail table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Relative-performance detail</CardTitle>
            <CardDescription>
              Period returns for the portfolio and {model.benchmarkLabel}, with
              the per-period active return. Totals compound to the headline
              excess return.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table
                className="w-full min-w-[480px] border-collapse text-sm"
                data-testid="benchmark-table"
              >
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Period</th>
                    <th className="py-2 px-3 text-right font-medium">
                      Portfolio
                    </th>
                    <th className="py-2 px-3 text-right font-medium">
                      Benchmark
                    </th>
                    <th className="py-2 pl-3 text-right font-medium">Active</th>
                  </tr>
                </thead>
                <tbody>
                  {model.excess.map((e, i) => {
                    const p = model.portfolioCurve[i + 1] / model.portfolioCurve[i] - 1;
                    const b = model.benchmarkCurve[i + 1] / model.benchmarkCurve[i] - 1;
                    return (
                      <tr
                        key={i}
                        data-testid="table-row"
                        data-period={i}
                        className="border-b border-border/60"
                      >
                        <td className="py-2 pr-3 font-medium tabular-nums">
                          {i + 1}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">
                          {pct(p, { signed: true })}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">
                          {pct(b, { signed: true })}
                        </td>
                        <td
                          className={cn(
                            "py-2 pl-3 text-right font-medium tabular-nums",
                            e < 0 && "text-[var(--color-chart-down)]",
                            e > 0 && "text-[var(--color-chart-up)]",
                          )}
                        >
                          {pct(e, { signed: true })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr
                    className="border-t-2 border-border font-medium"
                    data-testid="table-total"
                  >
                    <td className="py-2 pr-3">Total</td>
                    <td className="py-2 px-3 text-right tabular-nums">
                      {pct(m.portfolioTotalReturn, { signed: true })}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums">
                      {pct(m.benchmarkTotalReturn, { signed: true })}
                    </td>
                    <td
                      className={cn(
                        "py-2 pl-3 text-right tabular-nums",
                        m.totalExcessReturn < 0 &&
                          "text-[var(--color-chart-down)]",
                        m.totalExcessReturn > 0 &&
                          "text-[var(--color-chart-up)]",
                      )}
                      data-testid="table-excess"
                    >
                      {pct(m.totalExcessReturn, { signed: true })}
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

export default BenchmarkPage;
