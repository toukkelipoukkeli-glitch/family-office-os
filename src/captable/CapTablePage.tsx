import { TrendingDown } from "lucide-react";
import { useMemo, useState } from "react";

import { DonutChart, seriesColor } from "@/components/charts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { sampleCapTable, sampleRound } from "@/lib/captable";
import { cn } from "@/lib/utils";

import {
  buildViewModel,
  formatDelta,
  formatMoney,
  formatPercent,
  formatShares,
  SECURITY_CLASS_LABEL,
} from "./captable-view";

export function CapTablePage() {
  const [showRound, setShowRound] = useState(false);

  const vm = useMemo(
    () => buildViewModel(sampleCapTable, showRound ? sampleRound : undefined),
    [showRound],
  );

  const donutData = vm.byClass.map((c, i) => ({
    label: SECURITY_CLASS_LABEL[c.securityClass],
    value: c.percent,
    color: seriesColor(i),
  }));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <h1 className="text-lg font-semibold tracking-tight">Cap table</h1>
          <a
            href="#/"
            data-testid="captable-back"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Back to dashboard
          </a>
        </div>
      </header>

      <main
        className="mx-auto max-w-5xl space-y-6 px-6 py-10"
        data-testid="captable-page"
      >
        <Card>
          <CardHeader className="gap-2 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
            <div>
              <CardTitle data-testid="captable-company">
                {vm.companyName}
              </CardTitle>
              <CardDescription>
                Fully diluted ownership ·{" "}
                <span data-testid="captable-total" className="tabular-nums">
                  {formatShares(vm.totalShares)}
                </span>{" "}
                shares outstanding
                {vm.round && (
                  <>
                    {" "}
                    <span className="font-medium text-foreground">
                      after {vm.round.name}
                    </span>
                  </>
                )}
              </CardDescription>
            </div>
            <button
              type="button"
              data-testid="toggle-round"
              aria-pressed={showRound}
              onClick={() => setShowRound((v) => !v)}
              className={cn(
                "inline-flex h-9 shrink-0 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors",
                showRound
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-background hover:bg-muted",
              )}
            >
              {showRound ? `Showing ${sampleRound.name}` : `Model ${sampleRound.name}`}
            </button>
          </CardHeader>
        </Card>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="text-base">By security class</CardTitle>
              <CardDescription>
                Share of fully diluted ownership.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4">
              <DonutChart
                data={donutData}
                size={200}
                thickness={0.42}
                centerLabel="100%"
              />
              <ul className="w-full space-y-1.5" data-testid="class-legend">
                {vm.byClass.map((c, i) => (
                  <li
                    key={c.securityClass}
                    data-testid="class-legend-row"
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="inline-block size-3 rounded-sm"
                        style={{ background: seriesColor(i) }}
                      />
                      {SECURITY_CLASS_LABEL[c.securityClass]}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {formatPercent(c.percent)}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="text-base">Ownership by holder</CardTitle>
              <CardDescription>
                Each holder&apos;s stake of the fully diluted cap table.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm" data-testid="captable-table">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 font-medium">Holder</th>
                    <th className="py-2 font-medium">Class</th>
                    <th className="py-2 pr-3 text-right font-medium">Shares</th>
                    <th className="py-2 text-right font-medium">%</th>
                  </tr>
                </thead>
                <tbody>
                  {vm.rows.map((r) => (
                    <tr
                      key={r.id}
                      data-testid="captable-row"
                      data-holder={r.holder}
                      className="border-b border-border last:border-b-0"
                    >
                      <td className="py-2 pr-2 font-medium">{r.holder}</td>
                      <td className="py-2 pr-2 text-muted-foreground">
                        {SECURITY_CLASS_LABEL[r.securityClass]}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {formatShares(r.shares)}
                      </td>
                      <td className="py-2 text-right tabular-nums font-medium">
                        {formatPercent(r.percent)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </section>

        {vm.round && (
          <Card data-testid="round-detail">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingDown className="size-4 text-muted-foreground" aria-hidden="true" />
                {vm.round.name} dilution
              </CardTitle>
              <CardDescription>
                {formatMoney(vm.round.investment, vm.currency)} raised at{" "}
                {formatMoney(vm.round.preMoney, vm.currency)} pre-money (
                {formatMoney(vm.round.postMoney, vm.currency)} post-money).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Metric
                  testid="metric-price"
                  label="Price / share"
                  value={`${vm.currency} ${vm.round.pricePerShare}`}
                />
                <Metric
                  testid="metric-investor-shares"
                  label="New investor shares"
                  value={formatShares(vm.round.investorShares)}
                />
                <Metric
                  testid="metric-investor-percent"
                  label="Investor ownership"
                  value={formatPercent(vm.round.investorPercent)}
                />
                <Metric
                  testid="metric-pool-shares"
                  label="New pool shares"
                  value={formatShares(vm.round.newPoolShares)}
                />
              </dl>

              <div>
                <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                  Existing holder dilution
                </h3>
                <ul className="space-y-2" data-testid="dilution-list">
                  {vm.round.dilution.map((d) => (
                    <li
                      key={d.holder}
                      data-testid="dilution-row"
                      data-holder={d.holder}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {d.holder}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {formatPercent(d.beforePercent)} →{" "}
                        {formatPercent(d.afterPercent)}
                      </span>
                      <span
                        className={cn(
                          "w-20 shrink-0 text-right tabular-nums font-medium",
                          d.deltaPercent < 0
                            ? "text-destructive"
                            : "text-muted-foreground",
                        )}
                      >
                        {formatDelta(d.deltaPercent)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

function Metric({
  label,
  value,
  testid,
}: {
  label: string;
  value: string;
  testid: string;
}) {
  return (
    <div
      data-testid={testid}
      className="rounded-lg border border-border p-3"
    >
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

export default CapTablePage;
