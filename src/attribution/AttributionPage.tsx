import * as React from "react";
import { Layers, Scale, Target, TrendingUp } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  buildAttributionView,
  type AttributionView,
} from "@/lib/attribution/view";
import {
  FAMILY_OFFICE_ATTRIBUTION,
  type AttributionMethod,
} from "@/lib/attribution";
import { cn } from "@/lib/utils";

import { AttributionBridge } from "./AttributionBridge";
import { SegmentEffectsChart } from "./SegmentEffectsChart";

/** Format a decimal return as a signed percentage, e.g. `+0.83%`. */
function pct(value: number, { signed = false, digits = 2 } = {}): string {
  const s = `${(value * 100).toFixed(digits)}%`;
  if (!signed) return s;
  return value > 0 ? `+${s}` : s;
}

/** Unsigned magnitude percent for waterfall step labels. */
function pctMag(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
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

export interface AttributionPageProps {
  /** Optional precomputed view (mainly for tests); defaults to the fixture. */
  view?: AttributionView;
}

const METHODS: { id: AttributionMethod; label: string; hint: string }[] = [
  { id: "BF", label: "Brinson-Fachler", hint: "allocation vs. total benchmark" },
  { id: "BHB", label: "Brinson-Hood-Beebower", hint: "absolute segment allocation" },
];

/**
 * Performance attribution page.
 *
 * Decomposes the portfolio's active return (vs. its strategic benchmark) into
 * allocation, selection and interaction effects, segment by segment. A headline
 * **active-return bridge** waterfall walks benchmark → effects → portfolio; a
 * **per-segment diverging-bar** chart shows which decision helped where; a
 * detail table backs it with the raw weights and returns. A method toggle
 * switches between the Brinson-Fachler and Brinson-Hood-Beebower conventions.
 * Pure, deterministic and offline — driven by the attribution engine.
 */
export function AttributionPage({ view }: AttributionPageProps) {
  const [method, setMethod] = React.useState<AttributionMethod>(
    view?.method ?? "BF",
  );

  const model = React.useMemo<AttributionView>(() => {
    if (view) return view;
    return buildAttributionView({ ...FAMILY_OFFICE_ATTRIBUTION, method });
  }, [view, method]);

  const activeTone = model.activeReturn >= 0 ? "up" : "down";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <h1 className="text-lg font-semibold tracking-tight">
            Performance attribution
          </h1>
          <a
            href="#/"
            data-testid="attribution-back"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Back to dashboard
          </a>
        </div>
      </header>

      <main
        className="mx-auto max-w-6xl space-y-6 px-6 py-10"
        data-testid="attribution-page"
      >
        {/* KPIs */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            testId="kpi-portfolio"
            label="Portfolio return"
            value={pct(model.portfolioReturn)}
            hint="period total, weighted"
            icon={<TrendingUp className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-benchmark"
            label="Benchmark return"
            value={pct(model.benchmarkReturn)}
            hint="strategic policy mix"
            icon={<Target className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-active"
            label="Active return"
            value={pct(model.activeReturn, { signed: true })}
            hint="portfolio − benchmark"
            tone={activeTone}
            icon={<Scale className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-allocation"
            label="Allocation effect"
            value={pct(model.totalAllocation, { signed: true })}
            hint={`selection ${pct(model.totalSelection, { signed: true })}`}
            tone={model.totalAllocation >= 0 ? "up" : "down"}
            icon={<Layers className="size-3.5" aria-hidden="true" />}
          />
        </section>

        {/* Method toggle */}
        <div
          className="flex flex-wrap items-center gap-2"
          data-testid="method-toggle"
          role="group"
          aria-label="Attribution method"
        >
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            Method
          </span>
          {METHODS.map((mth) => {
            const active = model.method === method && method === mth.id;
            const disabled = Boolean(view); // controlled externally in tests
            return (
              <button
                key={mth.id}
                type="button"
                data-testid="method-select"
                data-method={mth.id}
                data-selected={method === mth.id}
                aria-pressed={method === mth.id}
                disabled={disabled}
                onClick={() => setMethod(mth.id)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm transition-colors",
                  active || method === mth.id
                    ? "border-border bg-muted font-medium"
                    : "border-transparent hover:bg-muted/60",
                  disabled && "cursor-default opacity-60",
                )}
                title={mth.hint}
              >
                {mth.label}
              </button>
            );
          })}
        </div>

        {/* Active-return bridge */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Active-return bridge</CardTitle>
            <CardDescription>
              From the benchmark return, stepping through the total allocation,
              selection and interaction effects, to the portfolio return. The
              three effects sum exactly to the{" "}
              <span className="font-medium text-foreground">
                {pct(model.activeReturn, { signed: true })}
              </span>{" "}
              active return.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="w-full overflow-hidden">
              <AttributionBridge
                view={model}
                width={1040}
                height={300}
                formatValue={pctMag}
                className="h-auto w-full"
                preserveAspectRatio="none"
              />
            </div>
          </CardContent>
        </Card>

        {/* Per-segment effects */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Effects by segment</CardTitle>
            <CardDescription>
              Allocation, selection and interaction effect per asset class —
              right of the axis added value, left of it subtracted.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-3 rounded-sm bg-[var(--color-chart-1)]" />
                Allocation
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-3 rounded-sm bg-[var(--color-chart-2)]" />
                Selection
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-3 rounded-sm bg-[var(--color-chart-3)]" />
                Interaction
              </span>
            </div>
            <div className="w-full overflow-x-auto">
              <SegmentEffectsChart
                segments={model.segments}
                width={640}
                formatValue={(v) => pct(v, { signed: true })}
                className="h-auto w-full min-w-[420px]"
              />
            </div>
          </CardContent>
        </Card>

        {/* Detail table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Attribution detail</CardTitle>
            <CardDescription>
              Per-segment weights, returns and effects. Totals reconcile to the
              active return.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table
                className="w-full min-w-[640px] border-collapse text-sm"
                data-testid="attribution-table"
              >
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Segment</th>
                    <th className="py-2 px-3 text-right font-medium">Wgt P/B</th>
                    <th className="py-2 px-3 text-right font-medium">Ret P/B</th>
                    <th className="py-2 px-3 text-right font-medium">Alloc</th>
                    <th className="py-2 px-3 text-right font-medium">Select</th>
                    <th className="py-2 px-3 text-right font-medium">Interact</th>
                    <th className="py-2 pl-3 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {model.segments.map((s) => (
                    <tr
                      key={s.id}
                      data-testid="table-row"
                      data-segment={s.id}
                      className="border-b border-border/60"
                    >
                      <td className="py-2 pr-3 font-medium">{s.label}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">
                        {pct(s.portfolioWeight, { digits: 0 })} /{" "}
                        {pct(s.benchmarkWeight, { digits: 0 })}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">
                        {pct(s.portfolioReturn)} / {pct(s.benchmarkReturn)}
                      </td>
                      <td
                        className={cn(
                          "py-2 px-3 text-right tabular-nums",
                          s.allocation < 0 &&
                            "text-[var(--color-chart-down)]",
                        )}
                      >
                        {pct(s.allocation, { signed: true })}
                      </td>
                      <td
                        className={cn(
                          "py-2 px-3 text-right tabular-nums",
                          s.selection < 0 && "text-[var(--color-chart-down)]",
                        )}
                      >
                        {pct(s.selection, { signed: true })}
                      </td>
                      <td
                        className={cn(
                          "py-2 px-3 text-right tabular-nums",
                          s.interaction < 0 &&
                            "text-[var(--color-chart-down)]",
                        )}
                      >
                        {pct(s.interaction, { signed: true })}
                      </td>
                      <td
                        className={cn(
                          "py-2 pl-3 text-right font-medium tabular-nums",
                          s.total < 0 && "text-[var(--color-chart-down)]",
                        )}
                      >
                        {pct(s.total, { signed: true })}
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
                    <td className="py-2 px-3" />
                    <td className="py-2 px-3" />
                    <td className="py-2 px-3 text-right tabular-nums">
                      {pct(model.totalAllocation, { signed: true })}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums">
                      {pct(model.totalSelection, { signed: true })}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums">
                      {pct(model.totalInteraction, { signed: true })}
                    </td>
                    <td
                      className={cn(
                        "py-2 pl-3 text-right tabular-nums",
                        model.activeReturn < 0 &&
                          "text-[var(--color-chart-down)]",
                      )}
                      data-testid="table-active"
                    >
                      {pct(model.totalEffect, { signed: true })}
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

export default AttributionPage;
