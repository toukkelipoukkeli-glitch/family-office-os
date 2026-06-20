import * as React from "react";
import { Activity, Crosshair, Scale, TrendingUp } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LineChart } from "@/components/charts";
import {
  BENCHMARKS,
  buildBenchmarkView,
  PERIODS_PER_YEAR,
  PORTFOLIO_RETURNS,
  type BenchmarkView,
  type PolicyBenchmark,
} from "@/lib/benchmark";
import { cn } from "@/lib/utils";

/** Format a decimal as a percentage, optionally signed. */
function pct(value: number, { signed = false, digits = 2 } = {}): string {
  const s = `${(value * 100).toFixed(digits)}%`;
  if (!signed) return s;
  return value > 0 ? `+${s}` : s;
}

/** Format a plain ratio (info ratio, beta, alpha) to fixed digits. */
function num(value: number, digits = 2): string {
  return value.toFixed(digits);
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
  /** Selectable benchmarks; defaults to the fixture set. */
  benchmarks?: readonly PolicyBenchmark[];
}

/**
 * Benchmark + relative-performance page.
 *
 * Measures the family's portfolio against a selectable benchmark — a single
 * index or a blended policy basket built from weighted asset-class index
 * returns. Headline KPIs report excess return, tracking error, information
 * ratio and beta; a growth chart overlays the compounded portfolio and
 * benchmark curves; a detail table backs it period by period. Pure,
 * deterministic and offline — driven by the benchmark engine.
 */
export function BenchmarkPage({ view, benchmarks = BENCHMARKS }: BenchmarkPageProps) {
  if (!view && benchmarks.length === 0) {
    throw new Error(
      "BenchmarkPage requires at least one benchmark when `view` is not provided.",
    );
  }

  const [benchmarkId, setBenchmarkId] = React.useState<string>(
    view?.benchmarkId ?? benchmarks[0].id,
  );

  const model = React.useMemo<BenchmarkView>(() => {
    if (view) return view;
    const benchmark =
      benchmarks.find((b) => b.id === benchmarkId) ?? benchmarks[0];
    return buildBenchmarkView({
      portfolio: PORTFOLIO_RETURNS,
      benchmark,
      periodsPerYear: PERIODS_PER_YEAR,
    });
  }, [view, benchmarks, benchmarkId]);

  const { performance: perf, rows } = model;
  if (rows.length === 0) {
    throw new Error("BenchmarkPage requires at least one period row.");
  }
  const lastRow = rows[rows.length - 1];
  const excessTone = perf.excessReturn >= 0 ? "up" : "down";
  const irTone = perf.informationRatio >= 0 ? "up" : "down";

  const controlled = Boolean(view);

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
          {benchmarks.map((b) => {
            const selected = model.benchmarkId === b.id;
            return (
              <button
                key={b.id}
                type="button"
                data-testid="benchmark-select"
                data-benchmark={b.id}
                data-selected={selected}
                aria-pressed={selected}
                disabled={controlled}
                onClick={() => setBenchmarkId(b.id)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm transition-colors",
                  selected
                    ? "border-border bg-muted font-medium"
                    : "border-transparent hover:bg-muted/60",
                  controlled && "cursor-default opacity-60",
                )}
              >
                {b.label}
              </button>
            );
          })}
        </div>

        {/* KPIs */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            testId="kpi-excess"
            label="Excess return"
            value={pct(perf.excessReturn, { signed: true })}
            hint={`vs ${model.benchmarkLabel}`}
            tone={excessTone}
            icon={<TrendingUp className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-tracking-error"
            label="Tracking error"
            value={pct(perf.trackingError)}
            hint="annualized, σ of active"
            icon={<Activity className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-info-ratio"
            label="Information ratio"
            value={num(perf.informationRatio)}
            hint="annualized active / TE"
            tone={irTone}
            icon={<Crosshair className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-beta"
            label="Beta"
            value={num(perf.beta)}
            hint={`alpha ${pct(perf.alpha, { signed: true, digits: 2 })}/period`}
            icon={<Scale className="size-3.5" aria-hidden="true" />}
          />
        </section>

        {/* Growth overlay */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Growth of 1.00</CardTitle>
            <CardDescription>
              Compounded growth of the portfolio against{" "}
              <span className="font-medium text-foreground">
                {model.benchmarkLabel}
              </span>
              . Portfolio ended at{" "}
              <span className="font-medium text-foreground tabular-nums">
                {lastRow.portfolioGrowth.toFixed(3)}
              </span>{" "}
              vs benchmark{" "}
              <span className="font-medium text-foreground tabular-nums">
                {lastRow.benchmarkGrowth.toFixed(3)}
              </span>
              .
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-3 rounded-sm bg-[var(--color-chart-1)]" />
                Portfolio
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-3 rounded-sm bg-[var(--color-chart-2)]" />
                {model.benchmarkLabel}
              </span>
            </div>
            <div className="w-full overflow-hidden" data-testid="growth-chart">
              <LineChart
                series={[
                  {
                    label: "Portfolio",
                    values: rows.map((r) => r.portfolioGrowth),
                  },
                  {
                    label: model.benchmarkLabel,
                    values: rows.map((r) => r.benchmarkGrowth),
                  },
                ]}
                width={1040}
                height={300}
                className="h-auto w-full"
                preserveAspectRatio="none"
              />
            </div>
          </CardContent>
        </Card>

        {/* Detail table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Period detail</CardTitle>
            <CardDescription>
              Per-period portfolio and benchmark returns, the active return, and
              the running growth of each.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table
                className="w-full min-w-[560px] border-collapse text-sm"
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
                    <th className="py-2 px-3 text-right font-medium">Active</th>
                    <th className="py-2 px-3 text-right font-medium">
                      Port. growth
                    </th>
                    <th className="py-2 pl-3 text-right font-medium">
                      Bench. growth
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.period}
                      data-testid="table-row"
                      data-period={r.period}
                      className="border-b border-border/60"
                    >
                      <td className="py-2 pr-3 font-medium tabular-nums">
                        {r.period}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">
                        {pct(r.portfolioReturn, { signed: true })}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">
                        {pct(r.benchmarkReturn, { signed: true })}
                      </td>
                      <td
                        className={cn(
                          "py-2 px-3 text-right tabular-nums",
                          r.activeReturn < 0 && "text-[var(--color-chart-down)]",
                        )}
                      >
                        {pct(r.activeReturn, { signed: true })}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        {r.portfolioGrowth.toFixed(3)}
                      </td>
                      <td className="py-2 pl-3 text-right tabular-nums">
                        {r.benchmarkGrowth.toFixed(3)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr
                    className="border-t-2 border-border font-medium"
                    data-testid="table-total"
                  >
                    <td className="py-2 pr-3">Total</td>
                    <td className="py-2 px-3 text-right tabular-nums">
                      {pct(perf.portfolioReturn, { signed: true })}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums">
                      {pct(perf.benchmarkReturn, { signed: true })}
                    </td>
                    <td
                      className={cn(
                        "py-2 px-3 text-right tabular-nums",
                        perf.excessReturn < 0 && "text-[var(--color-chart-down)]",
                      )}
                      data-testid="table-excess"
                    >
                      {pct(perf.excessReturn, { signed: true })}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums">
                      {lastRow.portfolioGrowth.toFixed(3)}
                    </td>
                    <td className="py-2 pl-3 text-right tabular-nums">
                      {lastRow.benchmarkGrowth.toFixed(3)}
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
