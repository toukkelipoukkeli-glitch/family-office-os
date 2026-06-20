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
  WASH_SALE_WINDOW_DAYS,
} from "@/lib/harvest";
import { LOT_METHOD_LABEL, type LotMethod } from "@/lib/taxlots";
import { cn } from "@/lib/utils";

import { HARVEST_METHODS, buildHarvestViewModel } from "./harvest-view";

/**
 * m7-harvest — the tax-loss-harvesting finder view.
 *
 * Surfaces every still-open lot that is underwater (market value < cost basis)
 * as a harvest candidate, sorted by the largest harvestable loss, and flags any
 * candidate whose loss would be disallowed by the wash-sale rule because the
 * same symbol was bought within ±30 days of the harvest date.
 *
 * READ-ONLY: this only finds and explains opportunities; it never sells.
 */
export function HarvestPage() {
  const [method, setMethod] = useState<LotMethod>("fifo");

  const vm = useMemo(
    () =>
      buildHarvestViewModel(sampleLedger, {
        prices: samplePrices,
        asOf: sampleAsOf,
        method,
      }),
    [method],
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <h1 className="text-lg font-semibold tracking-tight">
            Tax-loss harvesting
          </h1>
          <a
            href="#/"
            data-testid="harvest-back"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Back to dashboard
          </a>
        </div>
      </header>

      <main
        className="mx-auto max-w-5xl space-y-6 px-6 py-10"
        data-testid="harvest-page"
      >
        <Card>
          <CardHeader className="gap-3">
            <div>
              <CardTitle>Harvest finder</CardTitle>
              <CardDescription>
                Open lots worth less than their cost basis as of {vm.asOf}, valued
                in {vm.currency}. Selling a loss can offset realized gains — but a
                purchase of the same symbol within {WASH_SALE_WINDOW_DAYS} days
                before or after the sale trips the{" "}
                <strong>wash-sale rule</strong> and disallows the loss. Flagged
                lots below are at risk.
              </CardDescription>
            </div>
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label="Lot selection method"
              data-testid="method-selector"
            >
              {HARVEST_METHODS.map((m) => (
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
          </CardHeader>
        </Card>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            testid="metric-candidates"
            label="Candidates"
            value={String(vm.totals.candidates)}
            tone="neutral"
          />
          <Metric
            testid="metric-clean"
            label="Clean harvestable loss"
            value={vm.totals.clean}
            tone="good"
          />
          <Metric
            testid="metric-flagged"
            label="Flagged (wash-sale)"
            value={String(vm.totals.flagged)}
            tone={vm.totals.flagged > 0 ? "warn" : "neutral"}
          />
          <Metric
            testid="metric-blocked"
            label="Blocked loss"
            value={vm.totals.blocked}
            tone={vm.totals.flagged > 0 ? "warn" : "neutral"}
          />
        </section>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Harvest candidates</CardTitle>
            <CardDescription>
              Underwater lots after applying {vm.methodLabel}, worst loss first.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {vm.empty ? (
              <p
                className="text-sm text-muted-foreground"
                data-testid="no-candidates"
              >
                No harvestable losses — every open lot is at or above its cost
                basis.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table
                  className="w-full text-sm"
                  data-testid="candidates-table"
                >
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-2 font-medium">Lot</th>
                      <th className="py-2 pr-2 font-medium">Acquired</th>
                      <th className="py-2 pr-3 text-right font-medium">Qty</th>
                      <th className="py-2 pr-3 text-right font-medium">Basis</th>
                      <th className="py-2 pr-3 text-right font-medium">Value</th>
                      <th className="py-2 pr-3 text-right font-medium">
                        Harvestable loss
                      </th>
                      <th className="py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vm.rows.map((r) => (
                      <tr
                        key={r.lotId}
                        data-testid="candidate-row"
                        data-lot={r.lotId}
                        data-washsale={r.washSaleRisk ? "true" : "false"}
                        className="border-b border-border align-top last:border-b-0"
                      >
                        <td className="py-3 pr-2 font-medium">
                          {r.symbol}
                          <span className="block text-xs text-muted-foreground">
                            {r.lotId} · {r.holdingPeriodLabel}
                          </span>
                        </td>
                        <td className="py-3 pr-2 tabular-nums text-muted-foreground">
                          {r.acquiredOn}
                        </td>
                        <td className="py-3 pr-3 text-right tabular-nums">
                          {r.quantity}
                        </td>
                        <td className="py-3 pr-3 text-right tabular-nums">
                          {r.basis}
                        </td>
                        <td className="py-3 pr-3 text-right tabular-nums">
                          {r.marketValue}
                        </td>
                        <td className="py-3 pr-3 text-right font-semibold tabular-nums text-destructive">
                          {r.harvestableLoss}
                        </td>
                        <td className="py-3">
                          <span
                            data-testid="status-pill"
                            className={cn(
                              "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
                              r.washSaleRisk
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                                : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
                            )}
                          >
                            {r.statusLabel}
                          </span>
                          {r.washSaleRisk && (
                            <ul
                              className="mt-1.5 space-y-0.5"
                              data-testid="conflict-list"
                            >
                              {r.conflicts.map((w, i) => (
                                <li
                                  key={`${w.lotId}-${i}`}
                                  data-testid="conflict-row"
                                  className="text-xs text-muted-foreground"
                                >
                                  Bought {w.quantity} on {w.date} ({w.timing})
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-wrap items-baseline justify-between gap-3 py-4 text-sm">
            <span className="text-muted-foreground">
              Total harvestable loss across all candidates
            </span>
            <span
              className="text-lg font-semibold tabular-nums text-destructive"
              data-testid="total-loss"
            >
              {vm.totals.total}
            </span>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
  testid,
}: {
  label: string;
  value: string;
  tone: "neutral" | "good" | "warn";
  testid: string;
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : "text-foreground";
  return (
    <div data-testid={testid} className="rounded-lg border border-border p-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("mt-1 text-xl font-semibold tabular-nums", toneClass)}>
        {value}
      </dd>
    </div>
  );
}

export default HarvestPage;
