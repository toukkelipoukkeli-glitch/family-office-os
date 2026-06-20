import { useMemo, useState } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { realizedVentureFund, sampleFund } from "@/lib/privatemarkets";
import { cn } from "@/lib/utils";

import { buildViewModel } from "./privatemarkets-view";

const FUNDS = [
  { id: "buyout", label: "Buyout IV", position: sampleFund },
  { id: "venture", label: "Ventures II", position: realizedVentureFund },
] as const;

type FundId = (typeof FUNDS)[number]["id"];

export function PrivateMarketsPage() {
  const [fundId, setFundId] = useState<FundId>("buyout");

  const position = useMemo(
    () => FUNDS.find((f) => f.id === fundId)!.position,
    [fundId],
  );
  const vm = useMemo(() => buildViewModel(position), [position]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <h1 className="text-lg font-semibold tracking-tight">
            Private markets
          </h1>
          <a
            href="#/"
            data-testid="pe-back"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Back to dashboard
          </a>
        </div>
      </header>

      <main
        className="mx-auto max-w-5xl space-y-6 px-6 py-10"
        data-testid="pe-page"
      >
        <Card>
          <CardHeader className="gap-3">
            <div>
              <CardTitle data-testid="pe-fund-name">{vm.fundName}</CardTitle>
              <CardDescription>
                {vm.vintageYear} vintage · {vm.currency} · commitment lifecycle.
                TVPI / DPI / RVPI multiples, unfunded commitment, PE IRR, and the
                J-curve pacing of capital calls and distributions.
              </CardDescription>
            </div>
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label="Fund"
              data-testid="fund-selector"
            >
              {FUNDS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  data-testid={`fund-${f.id}`}
                  aria-pressed={fundId === f.id}
                  onClick={() => setFundId(f.id)}
                  className={cn(
                    "inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors",
                    fundId === f.id
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-background hover:bg-muted",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </CardHeader>
        </Card>

        <section
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
          data-testid="pe-multiples"
        >
          <Metric
            testid="metric-tvpi"
            label="TVPI"
            value={vm.tvpi}
            highlight={vm.inProfit}
          />
          <Metric testid="metric-dpi" label="DPI" value={vm.dpi} />
          <Metric testid="metric-rvpi" label="RVPI" value={vm.rvpi} />
          <Metric testid="metric-irr" label="PE IRR" value={vm.irr} />
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric testid="metric-committed" label="Committed" value={vm.committed} />
          <Metric testid="metric-paidin" label="Paid-in" value={vm.paidIn} />
          <Metric
            testid="metric-distributed"
            label="Distributed"
            value={vm.distributed}
          />
          <Metric testid="metric-nav" label="Residual NAV" value={vm.nav} />
        </section>

        <Card data-testid="commitment-card">
          <CardHeader>
            <CardTitle className="text-base">Commitment drawdown</CardTitle>
            <CardDescription>
              {vm.calledPct} of the {vm.committed} commitment has been called.
              Unfunded (undrawn) commitment:{" "}
              <span data-testid="unfunded-amount" className="font-medium tabular-nums">
                {vm.unfunded}
              </span>
              .
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className="h-3 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={Math.round(vm.calledBarPct)}
              aria-valuemin={0}
              aria-valuemax={100}
              data-testid="called-bar"
            >
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${vm.calledBarPct}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <Card data-testid="jcurve-card">
          <CardHeader>
            <CardTitle className="text-base">J-curve pacing</CardTitle>
            <CardDescription>
              Cumulative net cashflow to the LP over the fund's life — negative as
              capital is called, recovering as distributions arrive. Trough{" "}
              <span className="tabular-nums">{vm.jCurve.troughLabel}</span> ·
              latest <span className="tabular-nums">{vm.jCurve.finalLabel}</span>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <svg
              data-testid="jcurve-chart"
              viewBox={`0 0 ${vm.jCurve.width} ${vm.jCurve.height}`}
              className="h-40 w-full"
              role="img"
              aria-label="J-curve cumulative net cashflow sparkline"
            >
              <line
                x1={0}
                x2={vm.jCurve.width}
                y1={vm.jCurve.zeroY}
                y2={vm.jCurve.zeroY}
                className="stroke-border"
                strokeDasharray="4 4"
                strokeWidth={1}
              />
              <path
                d={vm.jCurve.path}
                fill="none"
                className="stroke-primary"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {vm.jCurve.points.map((p) => (
                <circle
                  key={`${p.date}-${p.x}`}
                  data-testid="jcurve-point"
                  cx={p.x}
                  cy={p.y}
                  r={3}
                  className={cn(
                    p.net < 0
                      ? "fill-destructive"
                      : "fill-emerald-500 dark:fill-emerald-400",
                  )}
                />
              ))}
            </svg>
          </CardContent>
        </Card>

        <Card data-testid="ledger-card">
          <CardHeader>
            <CardTitle className="text-base">Cashflow ledger</CardTitle>
            <CardDescription>
              Dated capital calls and distributions, in chronological order.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="ledger-table">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-2 font-medium">Date</th>
                    <th className="py-2 pr-2 font-medium">Type</th>
                    <th className="py-2 pr-3 text-right font-medium">Amount</th>
                    <th className="py-2 font-medium">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {vm.ledger.map((r, i) => (
                    <tr
                      key={`${r.date}-${i}`}
                      data-testid="ledger-row"
                      data-kind={r.kind}
                      className="border-b border-border last:border-b-0"
                    >
                      <td className="py-2 pr-2 tabular-nums text-muted-foreground">
                        {r.date}
                      </td>
                      <td className="py-2 pr-2">
                        <span
                          className={cn(
                            "inline-block rounded-full px-2 py-0.5 text-xs",
                            r.kind === "distribution"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                              : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
                          )}
                        >
                          {r.kindLabel}
                        </span>
                      </td>
                      <td
                        className={cn(
                          "py-2 pr-3 text-right tabular-nums font-medium",
                          r.kind === "call"
                            ? "text-destructive"
                            : "text-emerald-600 dark:text-emerald-400",
                        )}
                      >
                        {r.amount}
                      </td>
                      <td className="py-2 text-muted-foreground">{r.note}</td>
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

function Metric({
  label,
  value,
  testid,
  highlight,
}: {
  label: string;
  value: string;
  testid: string;
  highlight?: boolean;
}) {
  return (
    <div data-testid={testid} className="rounded-lg border border-border p-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "mt-1 text-xl font-semibold tabular-nums",
          highlight && "text-emerald-600 dark:text-emerald-400",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

export default PrivateMarketsPage;
