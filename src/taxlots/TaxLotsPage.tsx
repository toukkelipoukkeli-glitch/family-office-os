import { useMemo, useState } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  sampleAsOf,
  sampleLedger,
  samplePrices,
  type LotMethod,
} from "@/lib/taxlots";
import { cn } from "@/lib/utils";

import {
  LOT_METHODS,
  LOT_METHOD_LABEL,
  buildViewModel,
  formatHoldingPeriod,
  type Sign,
} from "./taxlots-view";
import { ExportMenu } from "@/components/ExportMenu";
import { tableExport } from "@/lib/export";

function gainClass(sign: Sign): string {
  if (sign === "negative") return "text-destructive";
  if (sign === "positive") return "text-emerald-600 dark:text-emerald-400";
  return "text-muted-foreground";
}

export function TaxLotsPage() {
  const [method, setMethod] = useState<LotMethod>("fifo");

  const vm = useMemo(
    () =>
      buildViewModel(sampleLedger, method, {
        prices: samplePrices,
        asOf: sampleAsOf,
      }),
    [method],
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <h1 className="text-lg font-semibold tracking-tight">Tax lots</h1>
          <div className="flex items-center gap-4">
            <ExportMenu
              dataset={tableExport(
                "tax-lots",
                [
                  "lotId",
                  "symbol",
                  "acquiredOn",
                  "quantity",
                  "basis",
                  "marketValue",
                  "unrealizedGain",
                  "holdingPeriod",
                ],
                vm.rows.map((r) => [
                  r.lotId,
                  r.symbol,
                  r.acquiredOn,
                  r.quantity,
                  r.basis,
                  r.marketValue,
                  r.unrealizedGain,
                  r.holdingPeriod,
                ]),
                vm,
              )}
              testId="taxlots-export"
            />
            <a
              href="#/"
              data-testid="taxlots-back"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Back to dashboard
            </a>
          </div>
        </div>
      </header>

      <main
        className="mx-auto max-w-5xl space-y-6 px-6 py-10"
        data-testid="taxlots-page"
      >
        <Card>
          <CardHeader className="gap-3">
            <div>
              <CardTitle>Tax lot explorer</CardTitle>
              <CardDescription>
                Realized &amp; unrealized gains on AAPL ({vm.currency}), valued
                as of {sampleAsOf}. Switch the lot-selection method to see how it
                changes which lots are sold and the short/long split.
              </CardDescription>
            </div>
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label="Lot selection method"
              data-testid="method-selector"
            >
              {LOT_METHODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  data-testid={`method-${m}`}
                  aria-pressed={method === m}
                  onClick={() => setMethod(m)}
                  className={cn(
                    "inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors",
                    method === m
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-background hover:bg-muted",
                  )}
                >
                  {LOT_METHOD_LABEL[m]}
                </button>
              ))}
            </div>
            <p className="text-sm text-muted-foreground" data-testid="method-blurb">
              {vm.methodBlurb}
            </p>
          </CardHeader>
        </Card>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric testid="metric-realized" label="Realized gain" value={vm.realized.gain} sign={vm.realized.gainSign} />
          <Metric
            testid="metric-short"
            label="Short-term"
            value={vm.realized.shortTermGain}
            sign={vm.realized.shortTermSign}
          />
          <Metric
            testid="metric-long"
            label="Long-term"
            value={vm.realized.longTermGain}
            sign={vm.realized.longTermSign}
          />
          <Metric
            testid="metric-unrealized"
            label="Unrealized gain"
            value={vm.unrealizedGain}
            sign={vm.unrealizedSign}
          />
        </section>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Open lots</CardTitle>
            <CardDescription>
              Lots still held after applying {vm.methodLabel}, with cost basis,
              market value, and unrealized gain.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {vm.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground" data-testid="no-open-lots">
                No open lots remaining.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="lots-table">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-2 font-medium">Lot</th>
                      <th className="py-2 pr-2 font-medium">Acquired</th>
                      <th className="py-2 pr-3 text-right font-medium">Qty</th>
                      <th className="py-2 pr-3 text-right font-medium">Basis</th>
                      <th className="py-2 pr-3 text-right font-medium">Value</th>
                      <th className="py-2 pr-3 text-right font-medium">Unrealized</th>
                      <th className="py-2 text-right font-medium">Term</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vm.rows.map((r) => (
                      <tr
                        key={r.lotId}
                        data-testid="lot-row"
                        data-lot={r.lotId}
                        className="border-b border-border last:border-b-0"
                      >
                        <td className="py-2 pr-2 font-medium">{r.lotId}</td>
                        <td className="py-2 pr-2 tabular-nums text-muted-foreground">
                          {r.acquiredOn}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">{r.quantity}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{r.basis}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{r.marketValue}</td>
                        <td
                          className={cn(
                            "py-2 pr-3 text-right tabular-nums font-medium",
                            gainClass(r.unrealizedGainSign),
                          )}
                        >
                          {r.unrealizedGain}
                        </td>
                        <td className="py-2 text-right">
                          <span
                            className={cn(
                              "inline-block rounded-full px-2 py-0.5 text-xs",
                              r.holdingPeriod === "long"
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
                            )}
                          >
                            {formatHoldingPeriod(r.holdingPeriod)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="disposals-card">
          <CardHeader>
            <CardTitle className="text-base">Realized disposals</CardTitle>
            <CardDescription>
              Each sale matched against the lots {vm.methodLabel} selects.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {vm.disposals.map((d) => (
              <div
                key={d.id}
                data-testid="disposal-row"
                data-disposal={d.id}
                className="rounded-lg border border-border p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="font-medium">
                    Sold {d.quantity} {d.symbol}{" "}
                    <span className="text-muted-foreground">on {d.disposedOn}</span>
                  </div>
                  <div className={cn("tabular-nums font-semibold", gainClass(d.gainSign))}>
                    {d.gain}
                  </div>
                </div>
                <div className="mt-1 text-sm text-muted-foreground tabular-nums">
                  {d.proceeds} proceeds − {d.basis} basis
                </div>
                <ul className="mt-3 space-y-1.5" data-testid="slice-list">
                  {d.slices.map((s, i) => (
                    <li
                      key={`${s.lotId}-${i}`}
                      data-testid="slice-row"
                      data-lot={s.lotId}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span className="flex items-center gap-2">
                        <span className="font-medium">{s.lotId}</span>
                        <span className="text-muted-foreground">
                          {s.quantity} units · acq {s.acquiredOn}
                        </span>
                        <span
                          className={cn(
                            "inline-block rounded-full px-2 py-0.5 text-xs",
                            s.holdingPeriod === "long"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                              : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
                          )}
                        >
                          {formatHoldingPeriod(s.holdingPeriod)}
                        </span>
                      </span>
                      <span className={cn("tabular-nums", gainClass(s.gainSign))}>
                        {s.gain}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function Metric({
  label,
  value,
  sign,
  testid,
}: {
  label: string;
  value: string;
  sign: Sign;
  testid: string;
}) {
  return (
    <div data-testid={testid} className="rounded-lg border border-border p-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("mt-1 text-xl font-semibold tabular-nums", gainClass(sign))}>
        {value}
      </dd>
    </div>
  );
}

export default TaxLotsPage;
