import * as React from "react";

import { DonutChart, type DonutDatum } from "@/components/charts/donut-chart";
import { seriesColor } from "@/components/charts/palette";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { EntityHoldings } from "@/lib/lookthrough";
import type { Entity } from "@/lib/org";
import {
  evaluateRiskCockpit,
  RISK_ENTITIES,
  RISK_HOLDINGS,
  RISK_ROOT_ID,
  sampleReturns,
  sampleReturnsPeriodsPerYear,
  sampleRiskFreeRate,
  sampleRiskLimits,
  type ConcentrationLine,
  type LimitCheck,
  type LiquidityTier,
  type RiskCockpitReport,
  type RiskLimitSet,
} from "@/lib/riskcockpit";

import { formatMoneyCompact, formatPct } from "./format";

export interface RiskCockpitViewProps {
  entities?: readonly Entity[];
  holdings?: readonly EntityHoldings[];
  limitSet?: RiskLimitSet;
  returns?: readonly number[];
  /** Initial reporting root entity id; defaults to the fixture trust. */
  rootId?: string;
}

/** A small severity pill. */
function SeverityPill({ severity }: { severity: "warning" | "critical" }) {
  const critical = severity === "critical";
  return (
    <span
      data-testid="risk-severity"
      data-severity={severity}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        critical
          ? "bg-red-500/15 text-red-600 dark:text-red-400"
          : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
      }`}
    >
      {critical ? "Critical" : "Warning"}
    </span>
  );
}

/** Stat tile. */
function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "danger" | "warn" | "ok";
}) {
  const toneClass =
    tone === "danger"
      ? "text-red-600 dark:text-red-400"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "ok"
          ? "text-emerald-600 dark:text-emerald-400"
          : "";
  return (
    <div className="rounded-lg border border-border p-4" data-testid="risk-stat">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

/**
 * A horizontal concentration bar with a limit marker. The filled portion is the
 * look-through weight; the dashed line is the concentration cap. The bar turns
 * red when the weight breaches the cap.
 */
function ConcentrationBar({ line }: { line: ConcentrationLine }) {
  // Scale the bar so the fuller of (weight, limit) reaches ~92% of the track,
  // keeping both the fill and the marker visible.
  const denom = Math.max(line.weight, line.limit ?? 0, 0.0001);
  const scale = 0.92 / denom;
  const fillPct = Math.min(100, line.weight * scale * 100);
  const limitPct =
    line.limit !== null ? Math.min(100, line.limit * scale * 100) : null;
  const breached = line.breached;

  return (
    <div
      className="space-y-1"
      data-testid="risk-conc-row"
      data-asset-class={line.assetClass}
      data-breached={breached ? "true" : "false"}
    >
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 truncate">
          <span className="truncate font-medium">{line.label}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {line.liquidityTier === "liquid"
              ? "Liquid"
              : line.liquidityTier === "semi_liquid"
                ? "Semi-liquid"
                : "Illiquid"}
          </span>
        </span>
        <span className="shrink-0 tabular-nums">
          <span
            className={`font-semibold ${
              breached ? "text-red-600 dark:text-red-400" : ""
            }`}
            data-testid="risk-conc-weight"
          >
            {formatPct(line.weight)}
          </span>
          {line.limit !== null && (
            <span className="text-muted-foreground">
              {" "}
              / {formatPct(line.limit)} cap
            </span>
          )}
        </span>
      </div>
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${
            breached ? "bg-red-500" : "bg-[var(--color-chart-1)]"
          }`}
          style={{ width: `${fillPct}%` }}
          data-testid="risk-conc-fill"
        />
        {limitPct !== null && (
          <div
            aria-hidden
            className="absolute top-[-2px] h-[calc(100%+4px)] w-0.5 bg-foreground"
            style={{ left: `${limitPct}%` }}
            data-testid="risk-conc-limit-marker"
          />
        )}
      </div>
    </div>
  );
}

/** One breach row in the breach list. */
function BreachRow({ check }: { check: LimitCheck }) {
  const overUnder =
    check.bound === "max"
      ? `${formatPct(check.exceedance)} over the ${formatPct(check.threshold)} cap`
      : `${formatPct(check.exceedance)} below the ${formatPct(check.threshold)} floor`;
  return (
    <li
      data-testid="risk-breach-row"
      data-limit-id={check.limit.id}
      data-severity={check.severity}
      className="flex items-start justify-between gap-3 rounded-md border border-border p-3 text-sm"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{check.limit.label}</span>
          <SeverityPill severity={check.severity} />
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {check.subject} at{" "}
          <span className="font-medium text-foreground tabular-nums">
            {formatPct(check.weight)}
          </span>{" "}
          — {overUnder}
        </p>
      </div>
      <span
        className="shrink-0 tabular-nums text-xs text-muted-foreground"
        data-testid="risk-breach-value"
      >
        {formatMoneyCompact(check.value)}
      </span>
    </li>
  );
}

/**
 * The risk-limits cockpit: composes the family's look-through concentration,
 * liquidity tiers, risk metrics and governed limits into one cross-asset risk
 * picture. Pure and deterministic; fed by offline fixtures.
 */
export function RiskCockpitView({
  entities = RISK_ENTITIES,
  holdings = RISK_HOLDINGS,
  limitSet = sampleRiskLimits,
  returns = sampleReturns,
  rootId = RISK_ROOT_ID,
}: RiskCockpitViewProps) {
  const [selectedRoot, setSelectedRoot] = React.useState(rootId);
  React.useEffect(() => setSelectedRoot(rootId), [rootId]);

  const report: RiskCockpitReport = React.useMemo(
    () =>
      evaluateRiskCockpit(entities, holdings, selectedRoot, limitSet, returns, {
        periodsPerYear: sampleReturnsPeriodsPerYear,
        riskFreeRate: sampleRiskFreeRate,
      }),
    [entities, holdings, selectedRoot, limitSet, returns],
  );

  // Color each tier by its stable position in the canonical tier order so the
  // donut slice and its legend swatch always agree, even when a tier is zero
  // (filtered out of the donut). Reindexing after the filter would desync the
  // donut colors from the unfiltered legend below.
  const tierColor = (tier: LiquidityTier): string =>
    seriesColor(report.liquidityTiers.findIndex((t) => t.tier === tier));

  const tierDonut: DonutDatum[] = report.liquidityTiers
    .filter((t) => t.value.amount.greaterThan(0))
    .map((t) => ({
      label: t.label,
      value: t.value.amount.toNumber(),
      color: tierColor(t.tier),
    }));

  const totalBreaches = report.breaches.length;
  const mdd = report.metrics.maxDrawdown.maxDrawdown;

  return (
    <div className="space-y-6" data-testid="risk-cockpit-view">
      {/* Root selector */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            Consolidate from
          </span>
          <select
            data-testid="risk-root-select"
            value={selectedRoot}
            onChange={(e) => setSelectedRoot(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm sm:w-72"
          >
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Status banner */}
      <div
        data-testid="risk-status-banner"
        data-compliant={report.compliant ? "true" : "false"}
        className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 ${
          report.compliant
            ? "border-emerald-500/30 bg-emerald-500/10"
            : "border-red-500/30 bg-red-500/10"
        }`}
      >
        <div>
          <p className="text-sm font-semibold">
            {report.compliant
              ? "Within all risk limits"
              : `${totalBreaches} limit ${
                  totalBreaches === 1 ? "breach" : "breaches"
                }`}
          </p>
          <p className="text-xs text-muted-foreground">
            {report.compliant
              ? "The consolidated look-through book complies with every governed limit."
              : `${report.counts.critical} critical · ${report.counts.warning} warning across the look-through book of ${report.rootName}.`}
          </p>
        </div>
        <span className="text-2xl font-bold tabular-nums">
          {report.compliant ? "OK" : totalBreaches}
        </span>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Look-through value"
          value={formatMoneyCompact(report.total)}
          sub={`owned by ${report.rootName}`}
        />
        <Stat
          label="Top concentration"
          value={
            report.topConcentration
              ? formatPct(report.topConcentration.weight)
              : "—"
          }
          sub={report.topConcentration?.label}
          tone={report.topConcentration?.breached ? "danger" : undefined}
        />
        <Stat
          label="Annualized volatility"
          value={formatPct(report.metrics.volatility)}
          sub={`max drawdown ${formatPct(mdd)}`}
        />
        <Stat
          label="Limit breaches"
          value={totalBreaches.toString()}
          sub={`${report.counts.critical} critical`}
          tone={
            report.counts.critical > 0
              ? "danger"
              : totalBreaches > 0
                ? "warn"
                : "ok"
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="space-y-6">
          {/* Concentration vs limits */}
          <Card data-testid="risk-conc-card">
            <CardHeader>
              <CardTitle className="text-base">
                Look-through concentration vs limits
              </CardTitle>
              <CardDescription>
                True underlying weight of each asset class, seen through every
                ownership stake, against its concentration cap (the marker).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4" data-testid="risk-conc-list">
                {report.concentration.map((line) => (
                  <ConcentrationBar key={line.assetClass} line={line} />
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Risk metrics */}
          <Card data-testid="risk-metrics-card">
            <CardHeader>
              <CardTitle className="text-base">Portfolio risk metrics</CardTitle>
              <CardDescription>
                Annualized from {report.metrics.periods} monthly return periods.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Stat
                  label="Volatility (ann.)"
                  value={formatPct(report.metrics.volatility)}
                />
                <Stat label="Max drawdown" value={formatPct(mdd)} />
                <Stat
                  label="Sharpe ratio"
                  value={report.metrics.sharpe.toFixed(2)}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Liquidity tiers + breaches */}
        <div className="space-y-6">
          <Card data-testid="risk-liquidity-card">
            <CardHeader>
              <CardTitle className="text-base">Liquidity tiers</CardTitle>
              <CardDescription>How fast the book can be realised.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center gap-4">
                {tierDonut.length > 0 ? (
                  <DonutChart
                    data={tierDonut}
                    size={180}
                    thickness={0.42}
                    centerLabel={formatMoneyCompact(report.total)}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">No exposure.</p>
                )}
                <ul
                  className="w-full space-y-1.5"
                  data-testid="risk-liquidity-legend"
                >
                  {report.liquidityTiers.map((t) => (
                    <li
                      key={t.tier}
                      className="flex items-center justify-between gap-3 text-sm"
                      data-testid="risk-liquidity-row"
                      data-tier={t.tier}
                    >
                      <span className="flex items-center gap-2 truncate">
                        <span
                          aria-hidden
                          className="inline-block h-3 w-3 shrink-0 rounded-sm"
                          style={{ background: tierColor(t.tier) }}
                        />
                        <span className="truncate">{t.label}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {formatPct(t.weight)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="risk-breaches-card">
            <CardHeader>
              <CardTitle className="text-base">Limit breaches</CardTitle>
              <CardDescription>
                Governance signals for a human to review.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {report.breaches.length > 0 ? (
                <ul className="space-y-2" data-testid="risk-breach-list">
                  {report.breaches.map((b) => (
                    <BreachRow
                      key={`${b.limit.id}-${b.subject}`}
                      check={b}
                    />
                  ))}
                </ul>
              ) : (
                <p
                  className="text-sm text-muted-foreground"
                  data-testid="risk-all-clear"
                >
                  No limit breaches — the book is within mandate.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
