import { Decimal } from "decimal.js";

import {
  alertsPortfolio,
  alertsRateTable,
  defaultAlertRules,
  evaluateAlerts,
} from "@/lib/alerts";
import { seededCashflowModel, type CashflowModel } from "@/lib/cashflow";
import {
  evaluatePolicy,
  ipsPortfolio,
  ipsRateTable,
  sampleIps,
} from "@/lib/ips";
import { Money } from "@/lib/money";
import {
  seededNetWorth,
  type NetWorthDashboardModel,
} from "@/lib/networth";
import {
  evaluateRiskCockpit,
  RISK_ENTITIES,
  RISK_HOLDINGS,
  RISK_ROOT_ID,
  sampleReturns,
  sampleReturnsPeriodsPerYear,
  sampleRiskFreeRate,
  sampleRiskLimits,
} from "@/lib/riskcockpit";

/**
 * Executive home overview (unit m10-home).
 *
 * Composes the headline KPIs of every other module — net worth + window TWR
 * (m0-networth), annualized volatility + max drawdown (m9-risk-limits), IPS /
 * mandate compliance (m7-ips), the alert engine's open breaches (m7-alerts),
 * and the household's liquidity runway (m9-cashflow) — into one deterministic
 * at-a-glance cockpit model.
 *
 * Everything here is a pure roll-up over fixture-derived module reports. It is
 * offline (no live feed), deterministic (stable across runs), and strictly
 * READ-ONLY: it only *reports* the family's headline state for a human to act
 * on — nothing moves money, places trades, or sends anything.
 */

/** Traffic-light status shared by every status-bearing KPI tile. */
export type OverviewStatus = "ok" | "warning" | "critical";

/** A single headline KPI tile on the executive home. */
export interface OverviewKpi {
  /** Stable id, used as the tile `data-kpi` attribute and React key. */
  readonly id: string;
  /** Short human label. */
  readonly label: string;
  /** Display-ready primary value (already formatted). */
  readonly value: string;
  /** Optional supporting line under the value. */
  readonly detail: string;
  /** Traffic-light status; drives the tile accent and the `data-status` attr. */
  readonly status: OverviewStatus;
  /** Hash route the tile links into (e.g. `#/risk`). */
  readonly href: string;
  /** The module the tile drills into, for the "open module" affordance. */
  readonly module: string;
}

/** The full executive-home view model: headline KPIs + an alert summary. */
export interface OverviewModel {
  /** Reporting base currency. */
  readonly baseCurrency: string;
  /** Headline KPI tiles, in cockpit reading order. */
  readonly kpis: readonly OverviewKpi[];
  /** Total count of open governance breaches across IPS + alerts + risk. */
  readonly openBreaches: number;
  /** The single worst status across every KPI (drives the page-level banner). */
  readonly worstStatus: OverviewStatus;
}

/** Severity-count shape shared by the IPS / alerts / risk reports. */
interface SeverityCounts {
  readonly critical: number;
  readonly warning: number;
}

/** Rank of a status for "worst-of" reductions (critical is worst). */
const STATUS_RANK: Record<OverviewStatus, number> = {
  ok: 0,
  warning: 1,
  critical: 2,
};

/** The worse (higher-rank) of two statuses. */
function worseStatus(a: OverviewStatus, b: OverviewStatus): OverviewStatus {
  return STATUS_RANK[a] >= STATUS_RANK[b] ? a : b;
}

/** Map a breach severity-count to a traffic-light status. */
function statusFromCounts(counts: SeverityCounts): OverviewStatus {
  if (counts.critical > 0) return "critical";
  if (counts.warning > 0) return "warning";
  return "ok";
}

/** Format a Decimal fraction (0.0123) as a signed percent string (+1.23%). */
function formatSignedPct(fraction: Decimal, dp = 2): string {
  const pct = fraction.times(100);
  const sign = pct.isNegative() ? "" : "+";
  return `${sign}${pct.toFixed(dp)}%`;
}

/** Format a number fraction (0.068) as an unsigned percent string (6.80%). */
function formatPct(fraction: number, dp = 2): string {
  return `${(fraction * 100).toFixed(dp)}%`;
}

/**
 * Compact currency formatting kept in {@link Money} / Decimal until the final
 * step (AGENTS.md money rule: never float-divide currency for display). Mirrors
 * the look-through / risk-cockpit formatter so every page reads alike.
 */
export function formatMoneyCompact(money: Money): string {
  const n = money.amount;
  const abs = n.abs();
  const tiers: { div: number; dp: number; suffix: string }[] = [
    { div: 1_000_000_000, dp: 2, suffix: "B" },
    { div: 1_000_000, dp: 2, suffix: "M" },
    { div: 1_000, dp: 1, suffix: "K" },
  ];
  let compact: string | undefined;
  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i];
    if (!abs.gte(t.div)) continue;
    compact = `${n.div(t.div).toFixed(t.dp)}${t.suffix}`;
    break;
  }
  if (compact === undefined) compact = n.toFixed(0);
  compact = compact
    .replace(/\.00([BMK])$/, "$1")
    .replace(/(\.\d)0([BMK])$/, "$1$2")
    .replace(/\.0([BMK])$/, "$1");
  const symbol = money.currency === "USD" ? "$" : `${money.currency} `;
  return `${symbol}${compact}`;
}

/** Inputs to {@link buildOverview}; each defaults to its seeded module report. */
export interface OverviewInput {
  readonly netWorth?: NetWorthDashboardModel;
  readonly cashflow?: CashflowModel;
}

/**
 * Liquidity runway, in whole months, from a cashflow model.
 *
 * Runway is how long the opening cash position covers the household's net cash
 * burn at the projection's average monthly net-outflow rate. When the household
 * is net cash-positive (no burn), runway is unbounded and reported as `null`.
 *
 * Pure arithmetic over the model's KPIs — deterministic and offline.
 */
export function liquidityRunwayMonths(model: CashflowModel): number | null {
  const months = model.months.length;
  if (months === 0) return null;
  const netFlow = new Decimal(model.kpis.netFlow);
  // Net cash-positive (or flat): the position never runs down — unbounded.
  if (!netFlow.isNegative()) return null;
  const monthlyBurn = netFlow.abs().div(months);
  if (monthlyBurn.isZero()) return null;
  const opening = new Decimal(model.kpis.openingBalance);
  if (opening.lessThanOrEqualTo(0)) return 0;
  return opening.div(monthlyBurn).floor().toNumber();
}

/**
 * Build the executive-home overview model from the module reports.
 *
 * Each KPI is derived from the same fixture-backed engine the dedicated module
 * page uses, so the home numbers always reconcile with the page you drill into.
 */
export function buildOverview(input: OverviewInput = {}): OverviewModel {
  const netWorth = input.netWorth ?? seededNetWorth;
  const cashflow = input.cashflow ?? seededCashflowModel;

  const ips = evaluatePolicy(ipsPortfolio, sampleIps, ipsRateTable);
  const alerts = evaluateAlerts(alertsPortfolio, defaultAlertRules, alertsRateTable);
  const risk = evaluateRiskCockpit(
    RISK_ENTITIES,
    RISK_HOLDINGS,
    RISK_ROOT_ID,
    sampleRiskLimits,
    sampleReturns,
    {
      periodsPerYear: sampleReturnsPeriodsPerYear,
      riskFreeRate: sampleRiskFreeRate,
    },
  );

  // 1) Net worth.
  const netWorthKpi: OverviewKpi = {
    id: "net-worth",
    label: "Net worth",
    value: formatMoneyCompact(netWorth.current),
    detail: `from ${formatMoneyCompact(netWorth.opening)} opening`,
    status: "ok",
    href: "#/",
    module: "Net worth",
  };

  // 2) Time-weighted return over the net-worth window.
  const twrStatus: OverviewStatus = netWorth.totalReturn.isNegative()
    ? "warning"
    : "ok";
  const twrKpi: OverviewKpi = {
    id: "twr",
    label: "TWR (window)",
    value: formatSignedPct(netWorth.totalReturn),
    detail: `${netWorth.total.points.length}-mo time-weighted return`,
    status: twrStatus,
    href: "#/benchmark",
    module: "Benchmark",
  };

  // 3) Volatility + max drawdown (risk).
  const volPct = formatPct(risk.metrics.volatility);
  const ddPct = formatPct(risk.metrics.maxDrawdown.maxDrawdown);
  const volatilityKpi: OverviewKpi = {
    id: "volatility",
    label: "Volatility / drawdown",
    value: `${volPct} ann.`,
    detail: `max drawdown ${ddPct} · Sharpe ${risk.metrics.sharpe.toFixed(2)}`,
    status: "ok",
    href: "#/risk",
    module: "Risk",
  };

  // 4) IPS / mandate compliance.
  const ipsStatus = statusFromCounts(ips.counts);
  const ipsKpi: OverviewKpi = {
    id: "ips",
    label: "IPS compliance",
    value: ips.compliant ? "Compliant" : `${ips.breaches.length} breaches`,
    detail: ips.compliant
      ? "within every mandate band"
      : `${ips.counts.critical} critical · ${ips.counts.warning} warning`,
    status: ipsStatus,
    href: "#/ips",
    module: "IPS",
  };

  // 5) Liquidity runway (cashflow).
  const runway = liquidityRunwayMonths(cashflow);
  const minBalance = Money.of(
    new Decimal(cashflow.kpis.minBalance),
    cashflow.currency,
  );
  const runwayStatus: OverviewStatus =
    cashflow.kpis.firstShortfallPeriod !== null
      ? "critical"
      : runway !== null && runway < 12
        ? "warning"
        : "ok";
  const runwayKpi: OverviewKpi = {
    id: "liquidity",
    label: "Liquidity runway",
    value:
      cashflow.kpis.firstShortfallPeriod !== null
        ? `shortfall ${cashflow.kpis.firstShortfallPeriod}`
        : runway === null
          ? "Cash-positive"
          : `${runway} mo`,
    detail: `min balance ${formatMoneyCompact(minBalance)} in ${cashflow.kpis.minBalancePeriod}`,
    status: runwayStatus,
    href: "#/cashflow",
    module: "Cashflow",
  };

  // 6) Open alerts (concentration / limit-breach engine).
  const alertsStatus = statusFromCounts(alerts.counts);
  const alertsKpi: OverviewKpi = {
    id: "alerts",
    label: "Open alerts",
    value: alerts.breaches.length === 0 ? "All clear" : `${alerts.breaches.length} open`,
    detail:
      alerts.breaches.length === 0
        ? "no limits breached"
        : `${alerts.counts.critical} critical · ${alerts.counts.warning} warning`,
    status: alertsStatus,
    href: "#/alerts",
    module: "Alerts",
  };

  const kpis: OverviewKpi[] = [
    netWorthKpi,
    twrKpi,
    volatilityKpi,
    ipsKpi,
    runwayKpi,
    alertsKpi,
  ];

  const openBreaches =
    ips.breaches.length + alerts.breaches.length + risk.breaches.length;

  const worstStatus = kpis.reduce<OverviewStatus>(
    (worst, kpi) => worseStatus(worst, kpi.status),
    "ok",
  );

  return {
    baseCurrency: netWorth.baseCurrency,
    kpis,
    openBreaches,
    worstStatus,
  };
}

/** The executive-home overview built from the seeded module reports. */
export const seededOverview: OverviewModel = buildOverview();
