import * as React from "react";
import {
  Award,
  Coins,
  Crosshair,
  Gauge,
  Scale,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BarChart, LineChart } from "@/components/charts";
import { ExportMenu } from "@/components/ExportMenu";
import {
  buildScorecardView,
  MANAGERS,
  PERIODS_PER_YEAR,
  type Manager,
  type ScorecardView,
} from "@/lib/managers";
import { managersExport } from "@/lib/export";
import { useHashQueryParam } from "@/lib/hash-location";
import { formatMoneyCompact } from "@/lib/format";
import { useReportingMoney, type ReportingMoney } from "@/lib/reporting-currency";
import { cn } from "@/lib/utils";

/** Format a decimal fraction as a percentage, optionally signed. */
function pct(value: number, { signed = false, digits = 2 } = {}): string {
  const s = `${(value * 100).toFixed(digits)}%`;
  if (!signed) return s;
  return value > 0 ? `+${s}` : s;
}

/** Format a plain ratio to fixed digits. */
function num(value: number, digits = 2): string {
  return value.toFixed(digits);
}

/**
 * Build a compact-currency formatter (e.g. `$1.85B`) bound to the chosen
 * reporting currency. Re-expresses each base-USD figure at the render boundary
 * (no-op when reporting === base).
 */
function makeMoney(rm: ReportingMoney) {
  return (value: number): string =>
    formatMoneyCompact(rm.convert(value), rm.currency, {
      maximumFractionDigits: 2,
    });
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

/** Colour band for a 0–100 composite score. */
function scoreTone(score: number): "up" | "down" | "default" {
  if (score >= 60) return "up";
  if (score < 40) return "down";
  return "default";
}

export interface ManagerScorecardPageProps {
  /** Roster of managers; defaults to the fixture set. */
  managers?: readonly Manager[];
  /** Optional precomputed view (mainly for tests). */
  view?: ScorecardView;
}

/**
 * Manager / fund due-diligence scorecard page.
 *
 * Ranks a roster of external managers on a transparent composite score and
 * drills into the selected one: net-of-fee vs. gross compounded growth against
 * the benchmark, fee drag, benchmark-relative KPIs and the score breakdown.
 * Pure, deterministic and offline — driven by the manager-scorecard engine.
 * READ-ONLY: it reports due-diligence metrics; it never moves money.
 */
export function ManagerScorecardPage({
  managers = MANAGERS,
  view,
}: ManagerScorecardPageProps) {
  if (!view && managers.length === 0) {
    throw new Error(
      "ManagerScorecardPage requires at least one manager when `view` is not provided.",
    );
  }

  // The selected manager is a deep-linkable sub-view stored on the route's hash
  // (`#/managers?m=<id>`), so a chosen manager is shareable and survives reload.
  // An empty param means "no explicit selection" — the engine then defaults to
  // the top-ranked manager. In controlled mode (a `view` prop, used by tests)
  // the URL is ignored so the page renders exactly the supplied view.
  const [hashId, setHashId] = useHashQueryParam("m", "");
  const controlled = Boolean(view);
  const selectedId = controlled
    ? view?.selectedId
    : hashId === ""
      ? undefined
      : hashId;

  const model = React.useMemo<ScorecardView>(() => {
    if (view) return view;
    return buildScorecardView({
      managers,
      selectedId,
      options: { periodsPerYear: PERIODS_PER_YEAR },
    });
  }, [view, managers, selectedId]);

  const { roster, detail } = model;

  // Re-express every base-USD AUM figure in the chosen reporting currency at the
  // render boundary (no-op when reporting === base). Scores, returns and growth
  // multiples are currency-invariant and pass through unchanged.
  const money = makeMoney(useReportingMoney());

  const excessTone = detail.excessReturn >= 0 ? "up" : "down";
  const irTone = detail.informationRatio >= 0 ? "up" : "down";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <h1 className="text-lg font-semibold tracking-tight">
            Manager &amp; fund scorecard
          </h1>
          <div className="flex items-center gap-4">
            <ExportMenu dataset={managersExport(model)} testId="managers-export" />
            <a
              href="#/"
              data-testid="managers-back"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Back to dashboard
            </a>
          </div>
        </div>
      </header>

      <main
        className="mx-auto max-w-6xl space-y-6 px-6 py-10"
        data-testid="managers-page"
      >
        {/* Ranked roster */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Due-diligence ranking</CardTitle>
            <CardDescription>
              External managers ranked by a composite score blending net excess
              return, information ratio, fee efficiency and consistency. Select a
              row to drill into its scorecard.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table
                className="w-full min-w-[720px] border-collapse text-sm"
                data-testid="roster-table"
              >
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">#</th>
                    <th className="py-2 px-3 font-medium">Manager</th>
                    <th className="py-2 px-3 font-medium">Strategy</th>
                    <th className="py-2 px-3 text-right font-medium">Vintage</th>
                    <th className="py-2 px-3 text-right font-medium">AUM</th>
                    <th className="py-2 px-3 text-right font-medium">Gross</th>
                    <th className="py-2 px-3 text-right font-medium">Net</th>
                    <th className="py-2 px-3 text-right font-medium">Excess</th>
                    <th className="py-2 px-3 text-right font-medium">Fee drag</th>
                    <th className="py-2 pl-3 text-right font-medium">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((r) => {
                    const selected = r.id === detail.id;
                    return (
                      <tr
                        key={r.id}
                        data-testid="roster-row"
                        data-manager={r.id}
                        data-selected={selected}
                        aria-selected={selected}
                        onClick={() => !controlled && setHashId(r.id)}
                        className={cn(
                          "border-b border-border/60 transition-colors",
                          !controlled && "cursor-pointer hover:bg-muted/50",
                          selected && "bg-muted/60",
                        )}
                      >
                        <td className="py-2 pr-3 font-medium tabular-nums text-muted-foreground">
                          {r.rank}
                        </td>
                        <td className="py-2 px-3 font-medium">{r.name}</td>
                        <td className="py-2 px-3 text-muted-foreground">
                          {r.strategy}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">
                          {r.vintage}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">
                          {money(r.aum)}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums">
                          {pct(r.grossTotal, { signed: true })}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums">
                          {pct(r.netTotal, { signed: true })}
                        </td>
                        <td
                          className={cn(
                            "py-2 px-3 text-right tabular-nums",
                            r.excessReturn < 0 &&
                              "text-[var(--color-chart-down)]",
                            r.excessReturn > 0 && "text-[var(--color-chart-up)]",
                          )}
                        >
                          {pct(r.excessReturn, { signed: true })}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">
                          {pct(r.feeDragShare)}
                        </td>
                        <td
                          className={cn(
                            "py-2 pl-3 text-right font-semibold tabular-nums",
                            scoreTone(r.score) === "up" &&
                              "text-[var(--color-chart-up)]",
                            scoreTone(r.score) === "down" &&
                              "text-[var(--color-chart-down)]",
                          )}
                          data-testid="roster-score"
                        >
                          {num(r.score, 1)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Selected manager header */}
        <div
          className="flex flex-wrap items-baseline justify-between gap-2"
          data-testid="detail-header"
        >
          <div>
            <h2 className="text-xl font-semibold tracking-tight">
              {detail.name}
            </h2>
            <p className="text-sm text-muted-foreground">
              {detail.strategy} · vintage {detail.vintage} ·{" "}
              <span data-testid="manager-aum">{money(detail.aum)}</span> AUM
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Composite score
            </p>
            <p
              className={cn(
                "text-3xl font-bold tabular-nums",
                scoreTone(detail.score.composite) === "up" &&
                  "text-[var(--color-chart-up)]",
                scoreTone(detail.score.composite) === "down" &&
                  "text-[var(--color-chart-down)]",
              )}
              data-testid="detail-score"
            >
              {num(detail.score.composite, 1)}
            </p>
          </div>
        </div>

        {/* KPIs */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            testId="kpi-net"
            label="Net return"
            value={pct(detail.netTotal, { signed: true })}
            hint={`gross ${pct(detail.grossTotal, { signed: true })}`}
            tone={detail.netTotal >= 0 ? "up" : "down"}
            icon={<TrendingUp className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-fee-drag"
            label="Fee drag"
            value={pct(detail.feeDrag)}
            hint={`${pct(detail.feeDragShare)} of gross profit`}
            tone="down"
            icon={<Coins className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-excess"
            label="Net excess"
            value={pct(detail.excessReturn, { signed: true })}
            hint="vs benchmark, net of fees"
            tone={excessTone}
            icon={
              detail.excessReturn >= 0 ? (
                <TrendingUp className="size-3.5" aria-hidden="true" />
              ) : (
                <TrendingDown className="size-3.5" aria-hidden="true" />
              )
            }
          />
          <Kpi
            testId="kpi-info-ratio"
            label="Information ratio"
            value={num(detail.informationRatio)}
            hint={`beta ${num(detail.beta)} · hit ${pct(detail.hitRate, { digits: 0 })}`}
            tone={irTone}
            icon={<Crosshair className="size-3.5" aria-hidden="true" />}
          />
        </section>

        {/* Net vs gross vs benchmark growth */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Growth of 1.00 — gross vs net vs benchmark
            </CardTitle>
            <CardDescription>
              Compounded growth of {detail.name} gross of fees, net of all fees,
              and the benchmark. Net ended at{" "}
              <span className="font-medium text-foreground tabular-nums">
                {detail.points[detail.points.length - 1].netGrowth.toFixed(3)}
              </span>{" "}
              vs gross{" "}
              <span className="font-medium text-foreground tabular-nums">
                {detail.points[detail.points.length - 1].grossGrowth.toFixed(3)}
              </span>
              .
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-3 rounded-sm bg-[var(--color-chart-1)]" />
                Gross
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-3 rounded-sm bg-[var(--color-chart-2)]" />
                Net of fees
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-3 rounded-sm bg-[var(--color-chart-3)]" />
                Benchmark
              </span>
            </div>
            <div className="w-full overflow-hidden" data-testid="growth-chart">
              <LineChart
                series={[
                  {
                    label: "Gross",
                    values: detail.points.map((p) => p.grossGrowth),
                  },
                  {
                    label: "Net of fees",
                    values: detail.points.map((p) => p.netGrowth),
                  },
                  {
                    label: "Benchmark",
                    values: detail.points.map((p) => p.benchmarkGrowth),
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

        {/* Score breakdown + fee terms */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Score breakdown</CardTitle>
              <CardDescription>
                The four 0–100 sub-scores that blend into the composite.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="w-full overflow-hidden" data-testid="score-chart">
                <BarChart
                  data={[
                    { label: "Excess", value: detail.score.excess },
                    { label: "Info ratio", value: detail.score.infoRatio },
                    { label: "Fee eff.", value: detail.score.feeEfficiency },
                    { label: "Consistency", value: detail.score.consistency },
                  ]}
                  width={520}
                  height={220}
                  colorByIndex
                  className="h-auto w-full"
                />
              </div>
              <dl
                className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm"
                data-testid="score-detail"
              >
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Excess</dt>
                  <dd className="tabular-nums">
                    {num(detail.score.excess, 0)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Info ratio</dt>
                  <dd className="tabular-nums">
                    {num(detail.score.infoRatio, 0)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Fee efficiency</dt>
                  <dd className="tabular-nums">
                    {num(detail.score.feeEfficiency, 0)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Consistency</dt>
                  <dd className="tabular-nums">
                    {num(detail.score.consistency, 0)}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Fee terms &amp; risk</CardTitle>
              <CardDescription>
                The schedule driving the net-of-fee result, with relative-risk
                statistics.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl
                className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm"
                data-testid="terms-detail"
              >
                <div className="flex items-center justify-between">
                  <dt className="flex items-center gap-1.5 text-muted-foreground">
                    <Coins className="size-3.5" aria-hidden="true" />
                    Management
                  </dt>
                  <dd className="tabular-nums">
                    {pct(detail.fees.managementFee)}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Fund expenses</dt>
                  <dd className="tabular-nums">
                    {pct(detail.fees.fundExpenses)}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="flex items-center gap-1.5 text-muted-foreground">
                    <Award className="size-3.5" aria-hidden="true" />
                    Carry
                  </dt>
                  <dd className="tabular-nums">{pct(detail.fees.carry)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Hurdle</dt>
                  <dd className="tabular-nums">
                    {pct(detail.fees.hurdle ?? 0)}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="flex items-center gap-1.5 text-muted-foreground">
                    <Gauge className="size-3.5" aria-hidden="true" />
                    Tracking error
                  </dt>
                  <dd className="tabular-nums">{pct(detail.trackingError)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="flex items-center gap-1.5 text-muted-foreground">
                    <Scale className="size-3.5" aria-hidden="true" />
                    Beta
                  </dt>
                  <dd className="tabular-nums">{num(detail.beta)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Hit rate</dt>
                  <dd className="tabular-nums">
                    {pct(detail.hitRate, { digits: 0 })}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Benchmark</dt>
                  <dd className="tabular-nums">
                    {pct(detail.benchmarkReturn, { signed: true })}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

export default ManagerScorecardPage;
