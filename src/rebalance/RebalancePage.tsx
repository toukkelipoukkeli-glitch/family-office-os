import {
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Scale,
  TrendingDown,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  proposeRebalance,
  rebalanceAsOf,
  rebalancePortfolio,
  rebalancePrices,
  rebalanceRateTable,
  rebalanceSchedule,
  rebalanceTargets,
  rebalanceYear,
} from "@/lib/rebalance";
import { LOT_METHOD_LABEL, type LotMethod } from "@/lib/taxlots";
import { cn } from "@/lib/utils";

import {
  buildRebalanceViewModel,
  type AssetClassRow,
  type TradeRow,
} from "./rebalance-view";
import { ExportMenu } from "@/components/ExportMenu";
import { tableExport } from "@/lib/export";

/** The lot-selection methods the user can toggle between. */
const METHODS: LotMethod[] = ["hifo", "fifo", "lifo"];

export function RebalancePage() {
  const [method, setMethod] = useState<LotMethod>("hifo");

  const vm = useMemo(() => {
    const proposal = proposeRebalance({
      portfolio: rebalancePortfolio,
      targets: rebalanceTargets,
      prices: rebalancePrices,
      fxTable: rebalanceRateTable,
      schedule: rebalanceSchedule,
      asOf: rebalanceAsOf,
      year: rebalanceYear,
      method,
    });
    return buildRebalanceViewModel(proposal);
  }, [method]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <h1 className="text-lg font-semibold tracking-tight">
            Rebalancing proposal
          </h1>
          <div className="flex items-center gap-4">
            <ExportMenu
              dataset={tableExport(
                "rebalance",
                [
                  "assetClass",
                  "label",
                  "currentWeight",
                  "targetWeight",
                  "projectedWeight",
                  "drift",
                  "action",
                  "tradeAmount",
                ],
                vm.assetClasses.map((a) => [
                  a.assetClass,
                  a.label,
                  a.currentWeightLabel,
                  a.targetWeightLabel,
                  a.projectedWeightLabel,
                  a.driftLabel,
                  a.action,
                  a.tradeAmountLabel,
                ]),
                vm,
              )}
              testId="rebalance-export"
            />
            <a
              href="#/"
              data-testid="rebalance-back"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Back to dashboard
            </a>
          </div>
        </div>
      </header>

      <main
        className="mx-auto max-w-5xl space-y-6 px-6 py-10"
        data-testid="rebalance-page"
      >
        <p className="text-sm text-muted-foreground" data-testid="rebalance-intro">
          A read-only, tax-aware proposal to move the {vm.totalLabel}{" "}
          {vm.baseCurrency} book toward its IPS target allocation while
          minimizing realized tax. Nothing here executes a trade.
        </p>

        {/* Summary cards */}
        <section
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
          data-testid="rebalance-summary"
        >
          <SummaryCard
            testid="summary-sold"
            icon={<ArrowDownRight className="size-5" aria-hidden="true" />}
            tone="sell"
            value={vm.totalSoldLabel}
            label={`To sell (${vm.sellCount})`}
          />
          <SummaryCard
            testid="summary-bought"
            icon={<ArrowUpRight className="size-5" aria-hidden="true" />}
            tone="buy"
            value={vm.totalBoughtLabel}
            label={`To buy (${vm.buyCount})`}
          />
          <SummaryCard
            testid="summary-tax"
            icon={<Scale className="size-5" aria-hidden="true" />}
            tone="neutral"
            value={vm.estimatedTaxLabel}
            label="Estimated tax"
          />
          <SummaryCard
            testid="summary-saved"
            icon={<TrendingDown className="size-5" aria-hidden="true" />}
            tone={vm.hasTaxSaving ? "ok" : "neutral"}
            value={vm.taxSavedLabel}
            label="Tax saved vs FIFO"
          />
        </section>

        {/* Method toggle */}
        <Card>
          <CardHeader className="gap-2 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
            <div>
              <CardTitle className="text-base">Lot-selection method</CardTitle>
              <CardDescription>
                Sells draw from{" "}
                <span data-testid="rebalance-method" className="font-medium">
                  {vm.methodLabel}
                </span>{" "}
                lots. {vm.methodBlurb}
              </CardDescription>
            </div>
            <div
              className="inline-flex shrink-0 rounded-md border border-border p-0.5"
              role="group"
              aria-label="Lot-selection method"
            >
              {METHODS.map((m) => (
                <MethodButton
                  key={m}
                  testid={`method-${m}`}
                  active={method === m}
                  onClick={() => setMethod(m)}
                >
                  {LOT_METHOD_LABEL[m]}
                </MethodButton>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            <div
              className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm"
              data-testid="realized-summary"
            >
              <RealizedStat
                label="Realized gain"
                value={vm.realizedGainLabel}
                tone={vm.realizedIsLoss ? "loss" : "gain"}
                testid="realized-gain"
              />
              <RealizedStat
                label="Short-term"
                value={vm.realizedShortTermLabel}
                testid="realized-short"
              />
              <RealizedStat
                label="Long-term"
                value={vm.realizedLongTermLabel}
                testid="realized-long"
              />
            </div>
          </CardContent>
        </Card>

        {/* Allocation plan */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Allocation vs target</CardTitle>
            <CardDescription>
              Current mix against the IPS target. Bars show current (filled) vs
              target (outline). Tolerance band {vm.bandLabel}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3" data-testid="allocation-list">
              {vm.assetClasses.map((row) => (
                <AllocationRow key={row.assetClass} row={row} />
              ))}
            </ul>
            <div
              className="mt-4 flex items-center gap-2 rounded-lg border border-dashed border-border p-3 text-sm"
              data-testid="reconcile-status"
              data-reconciles={vm.reconciles}
            >
              <CheckCircle2
                className={cn(
                  "size-4",
                  vm.reconciles ? "text-emerald-600 dark:text-emerald-500" : "text-muted-foreground",
                )}
                aria-hidden="true"
              />
              <span>
                {vm.reconciles
                  ? `Projected allocation reconciles to target within the ${vm.bandLabel} band.`
                  : `Projected allocation does not fully reconcile within the ${vm.bandLabel} band.`}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Trades */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Proposed trades</CardTitle>
            <CardDescription>
              {vm.sellCount} sell{vm.sellCount === 1 ? "" : "s"} and {vm.buyCount}{" "}
              buy{vm.buyCount === 1 ? "" : "s"}. Sells show the realized gain the
              chosen lots would trigger.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {vm.trades.length === 0 ? (
              <div
                data-testid="no-trades"
                className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-12 text-center"
              >
                <CheckCircle2
                  className="size-8 text-muted-foreground"
                  aria-hidden="true"
                />
                <p className="text-sm font-medium">No trades needed</p>
                <p className="text-sm text-muted-foreground">
                  Every asset class is within the tolerance band.
                </p>
              </div>
            ) : (
              <ul className="space-y-3" data-testid="trade-list">
                {vm.trades.map((row) => (
                  <TradeItem key={row.id} row={row} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function SummaryCard({
  icon,
  value,
  label,
  tone,
  testid,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  tone: "sell" | "buy" | "ok" | "neutral";
  testid: string;
}) {
  return (
    <Card data-testid={testid}>
      <CardContent className="flex items-center gap-3 p-5">
        <span
          aria-hidden="true"
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-lg",
            tone === "sell" && "bg-rose-500/10 text-rose-600 dark:text-rose-500",
            tone === "buy" && "bg-sky-500/10 text-sky-600 dark:text-sky-400",
            tone === "ok" &&
              "bg-emerald-500/10 text-emerald-600 dark:text-emerald-500",
            tone === "neutral" && "bg-muted text-muted-foreground",
          )}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <div
            data-testid={`${testid}-value`}
            className="truncate text-xl font-semibold tabular-nums"
          >
            {value}
          </div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function MethodButton({
  active,
  onClick,
  children,
  testid,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  testid: string;
}) {
  return (
    <button
      type="button"
      data-testid={testid}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function RealizedStat({
  label,
  value,
  tone,
  testid,
}: {
  label: string;
  value: string;
  tone?: "gain" | "loss";
  testid: string;
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        data-testid={testid}
        className={cn(
          "text-base font-semibold tabular-nums",
          tone === "loss" && "text-rose-600 dark:text-rose-500",
          tone === "gain" && "text-emerald-600 dark:text-emerald-500",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function AllocationRow({ row }: { row: AssetClassRow }) {
  return (
    <li
      data-testid="allocation-row"
      data-asset-class={row.assetClass}
      data-action={row.action}
      className="rounded-lg border border-border p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium" data-testid="allocation-label">
              {row.label}
            </span>
            <span
              data-testid="allocation-action"
              className={cn(
                "rounded px-1.5 py-0.5 text-xs font-medium",
                row.action === "Sell" &&
                  "bg-rose-500/10 text-rose-600 dark:text-rose-500",
                row.action === "Buy" &&
                  "bg-sky-500/10 text-sky-600 dark:text-sky-400",
                row.action === "Hold" && "bg-muted text-muted-foreground",
              )}
            >
              {row.action}
              {row.action !== "Hold" ? ` ${row.tradeAmountLabel}` : ""}
            </span>
          </div>
          <div className="text-sm text-muted-foreground tabular-nums">
            current {row.currentWeightLabel} → target {row.targetWeightLabel} ·
            projected {row.projectedWeightLabel}
          </div>
        </div>
        <div
          data-testid="allocation-drift"
          className={cn(
            "text-right text-sm font-semibold tabular-nums",
            row.traded
              ? row.overweight
                ? "text-rose-600 dark:text-rose-500"
                : "text-sky-600 dark:text-sky-400"
              : "text-muted-foreground",
          )}
        >
          {row.driftLabel}
        </div>
      </div>

      {/* Current (filled) vs target (marker) bar */}
      <div
        className="relative mt-3 h-2 w-full overflow-hidden rounded-full bg-muted"
        role="presentation"
      >
        <div
          data-testid="allocation-bar"
          className={cn(
            "h-full rounded-full",
            row.overweight ? "bg-rose-500/70" : "bg-primary/60",
          )}
          style={{ width: `${row.currentFill.toFixed(1)}%` }}
        />
        <div
          data-testid="allocation-target-marker"
          className="absolute top-[-2px] h-3 w-0.5 bg-foreground"
          style={{ left: `${row.targetFill.toFixed(1)}%` }}
          aria-hidden="true"
        />
      </div>
    </li>
  );
}

function TradeItem({ row }: { row: TradeRow }) {
  const isSell = row.side === "sell";
  return (
    <li
      data-testid="trade-row"
      data-side={row.side}
      className={cn(
        "rounded-lg border p-4",
        isSell ? "border-rose-500/30 bg-rose-500/5" : "border-sky-500/30 bg-sky-500/5",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              data-testid="trade-side"
              className={cn(
                "rounded px-1.5 py-0.5 text-xs font-semibold uppercase",
                isSell
                  ? "bg-rose-500/15 text-rose-600 dark:text-rose-500"
                  : "bg-sky-500/15 text-sky-600 dark:text-sky-400",
              )}
            >
              {row.sideLabel}
            </span>
            <span className="font-medium" data-testid="trade-name">
              {row.holdingName}
            </span>
            {row.symbol ? (
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                {row.symbol}
              </span>
            ) : null}
          </div>
          <div className="text-sm text-muted-foreground tabular-nums">
            {row.quantityLabel ? `${row.quantityLabel} units · ` : ""}
            {row.amountLabel}
            {row.gainSplitLabel ? ` · ${row.gainSplitLabel}` : ""}
          </div>
        </div>
        {row.realizedGainLabel ? (
          <div className="text-right">
            <div
              data-testid="trade-gain"
              className={cn(
                "text-base font-semibold tabular-nums",
                row.isLoss
                  ? "text-rose-600 dark:text-rose-500"
                  : "text-emerald-600 dark:text-emerald-500",
              )}
            >
              {row.realizedGainLabel}
            </div>
            <div className="text-xs text-muted-foreground">realized gain</div>
          </div>
        ) : null}
      </div>
    </li>
  );
}

export default RebalancePage;
