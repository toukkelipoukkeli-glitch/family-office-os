import * as React from "react";
import {
  Banknote,
  Coins,
  Layers,
  TrendingUp,
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
import {
  buildPrivateMarketsModel,
  type PrivateMarketsModel,
} from "@/lib/privatemarkets";
import {
  formatMoneyCompact,
  formatMoneyWhole,
  formatMultiple,
} from "@/lib/format";
import { cn } from "@/lib/utils";

const CURRENCY = "USD";

/** Compact currency, e.g. `$12.5M`. */
function compact(value: number): string {
  return formatMoneyCompact(value, CURRENCY);
}

/** Full currency with no fractional cents, e.g. `$1,250,000`. */
function whole(value: number): string {
  return formatMoneyWhole(value, CURRENCY);
}

/** Multiple, e.g. `1.72x`. */
function multiple(value: number): string {
  return formatMultiple(value);
}

/** Percent, e.g. `12.0%`, or an em-dash for an undefined IRR. */
function percent(value: number | null, digits = 1): string {
  if (value === null) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

interface KpiProps {
  testId: string;
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "up";
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
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export interface PrivateMarketsPageProps {
  /** Optional precomputed model (mainly for tests); defaults to the fixture. */
  model?: PrivateMarketsModel;
}

/**
 * Private-markets commitment lifecycle page.
 *
 * Headline portfolio KPIs (committed, paid-in, distributed, NAV, unfunded,
 * TVPI, pooled IRR), a per-fund capital-deployment bar chart (paid-in vs.
 * distributed vs. NAV), a combined **J-curve** of cumulative net cashflow and
 * total value over time, and a per-commitment metrics table (DPI / RVPI / TVPI /
 * IRR / unfunded) — all driven by the deterministic engine via
 * {@link buildPrivateMarketsModel}. Pure and offline; READ-ONLY: it reports on
 * commitments, never moves money.
 */
export function PrivateMarketsPage({ model }: PrivateMarketsPageProps) {
  const pm = React.useMemo(() => model ?? buildPrivateMarketsModel(), [model]);
  const { kpis, commitments, jcurves } = pm;

  // Per-fund deployment bars: total value (distributed + NAV) per fund.
  const barData = commitments.map((c) => ({
    label: c.name,
    value: c.distributed + c.nav,
  }));

  // Combined J-curve: sum each fund's series by date for the whole sleeve.
  const sleeveJCurve = React.useMemo(() => buildSleeveJCurve(jcurves), [jcurves]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <h1 className="text-lg font-semibold tracking-tight">
            Private-markets commitments
          </h1>
          <a
            href="#/"
            data-testid="privatemarkets-back"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Back to dashboard
          </a>
        </div>
      </header>

      <main
        className="mx-auto max-w-6xl space-y-6 px-6 py-10"
        data-testid="privatemarkets-page"
      >
        {/* KPIs */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi
            testId="kpi-committed"
            label="Committed"
            value={compact(kpis.committed)}
            hint="total LP commitment"
            icon={<Wallet className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-paidin"
            label="Paid in"
            value={compact(kpis.paidIn)}
            hint="capital called"
            icon={<Coins className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-distributed"
            label="Distributed"
            value={compact(kpis.distributed)}
            hint="capital returned"
            tone="up"
            icon={<Banknote className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-unfunded"
            label="Unfunded"
            value={compact(kpis.unfunded)}
            hint="committed − called"
            icon={<Layers className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-tvpi"
            label="TVPI"
            value={multiple(kpis.tvpi)}
            hint={`DPI ${multiple(kpis.dpi)} · RVPI ${multiple(kpis.rvpi)}`}
            icon={<Layers className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-irr"
            label="Pooled IRR"
            value={percent(kpis.irr)}
            hint="dated-cashflow XIRR"
            tone="up"
            icon={<TrendingUp className="size-3.5" aria-hidden="true" />}
          />
        </section>

        {/* J-curve */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              J-curve: cumulative net cashflow vs. total value
            </CardTitle>
            <CardDescription>
              The sleeve&rsquo;s cumulative net cashflow (distributions − calls)
              over time dips negative as capital is drawn, then climbs back as
              distributions land — the classic J. The upper line layers each
              fund&rsquo;s residual NAV on top as the unrealised cushion.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="w-full overflow-hidden">
              <LineChart
                series={[
                  {
                    label: "Total value (net + NAV)",
                    values: sleeveJCurve.totalValue,
                    color: "var(--color-chart-up)",
                  },
                  {
                    label: "Net cashflow",
                    values: sleeveJCurve.cumulativeNet,
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
              data-testid="jcurve-summary"
            >
              <span className="flex flex-wrap items-center gap-4">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-0.5 w-4 bg-[var(--color-chart-up)]" />
                  Total value (net + NAV)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-0.5 w-4 bg-[var(--color-chart-1)]" />
                  Net cashflow
                </span>
              </span>
              <span>
                Deepest drawdown:{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {compact(sleeveJCurve.trough)}
                </span>
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Per-fund capital deployed bar chart */}
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="text-base">Total value by fund</CardTitle>
            <CardDescription>
              Realised distributions plus residual NAV per commitment, most
              valuable first.
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

        {/* Per-commitment detail table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Commitment detail</CardTitle>
            <CardDescription>
              Vintage, capital deployment and the standard LP multiples for every
              commitment in the sleeve.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table
                className="w-full text-sm"
                data-testid="privatemarkets-table"
              >
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Fund</th>
                    <th className="py-2 px-3 font-medium">Strategy</th>
                    <th className="py-2 px-3 text-right font-medium">Vintage</th>
                    <th className="py-2 px-3 text-right font-medium">
                      Committed
                    </th>
                    <th className="py-2 px-3 text-right font-medium">Paid in</th>
                    <th className="py-2 px-3 text-right font-medium">
                      Unfunded
                    </th>
                    <th className="py-2 px-3 text-right font-medium">Dist.</th>
                    <th className="py-2 px-3 text-right font-medium">NAV</th>
                    <th className="py-2 px-3 text-right font-medium">DPI</th>
                    <th className="py-2 px-3 text-right font-medium">RVPI</th>
                    <th className="py-2 px-3 text-right font-medium">TVPI</th>
                    <th className="py-2 pl-3 text-right font-medium">IRR</th>
                  </tr>
                </thead>
                <tbody>
                  {commitments.map((c) => (
                    <tr
                      key={c.id}
                      data-testid="privatemarkets-row"
                      data-fund={c.id}
                      className="border-b border-border/60 last:border-0"
                    >
                      <td className="py-2 pr-3 font-medium">{c.name}</td>
                      <td className="py-2 px-3 text-muted-foreground">
                        {c.strategy}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        {c.vintageYear}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        {whole(c.committed)}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        {whole(c.paidIn)}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        {whole(c.unfunded)}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        {whole(c.distributed)}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        {whole(c.nav)}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        {multiple(c.dpi)}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        {multiple(c.rvpi)}
                      </td>
                      <td className="py-2 px-3 text-right font-medium tabular-nums">
                        {multiple(c.tvpi)}
                      </td>
                      <td className="py-2 pl-3 text-right tabular-nums text-[var(--color-chart-up)]">
                        {percent(c.irr)}
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

interface SleeveJCurve {
  cumulativeNet: number[];
  totalValue: number[];
  trough: number;
}

/**
 * Merge per-fund J-curve series into one sleeve-level series. Each fund's value
 * is a step function: at any date it contributes its most recent point's value
 * (and zero before its first cashflow). Summing those step functions across the
 * union of all dates gives the sleeve's cumulative position over time.
 */
function buildSleeveJCurve(
  jcurves: PrivateMarketsModel["jcurves"],
): SleeveJCurve {
  const dates = Array.from(
    new Set(jcurves.flatMap((j) => j.points.map((p) => p.date))),
  ).sort();

  const cumulativeNet: number[] = [];
  const totalValue: number[] = [];
  let trough = 0;

  for (const date of dates) {
    let net = 0;
    let total = 0;
    for (const fund of jcurves) {
      // Most recent point at or before `date`; zero before the fund's first.
      let netVal = 0;
      let totalVal = 0;
      for (const p of fund.points) {
        if (p.date <= date) {
          netVal = p.cumulativeNet;
          totalVal = p.totalValue;
        } else {
          break;
        }
      }
      net += netVal;
      total += totalVal;
    }
    cumulativeNet.push(net);
    totalValue.push(total);
    if (net < trough) trough = net;
  }

  return { cumulativeNet, totalValue, trough };
}

export default PrivateMarketsPage;
