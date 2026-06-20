/**
 * m9-reporting — Board-grade reporting composition.
 *
 * Composes the family-office engines into a single dated, plain-`number`
 * **board report** object: net-worth & TWR, allocation vs. policy (IPS
 * compliance), benchmark-relative performance, Brinson attribution, fees / TCO,
 * and private-markets (PE) metrics. Every section is derived from the existing
 * deterministic engines and their seeded fixtures, so the composed report is
 * fully reproducible and offline.
 *
 * READ-ONLY product: this module only *reports* what the book is and how it has
 * performed. Nothing here moves money, places a trade, or sends anything.
 */

import { buildNetWorthDashboard } from "@/lib/networth";
import { networthRateTable } from "@/lib/networth/fixtures";
import {
  evaluatePolicy,
  ipsPortfolio,
  ipsRateTable,
  sampleIps,
  type ComplianceReport,
} from "@/lib/ips";
import { buildBenchmarkView } from "@/lib/benchmark/view";
import { PORTFOLIO_RETURNS, POLICY_BENCHMARK } from "@/lib/benchmark/fixtures";
import { buildAttributionView } from "@/lib/attribution/view";
import { FAMILY_OFFICE_ATTRIBUTION } from "@/lib/attribution/fixtures";
import { buildFeeModel } from "@/lib/fees";
import { buildPrivateMarketsModel } from "@/lib/privatemarkets";
import { assetClassLabel } from "@/lib/model/asset-class";

/**
 * Default "as of" date for the seeded report. Fixed (never the wall clock) so
 * the composed report — and its snapshot — is deterministic.
 */
export const DEFAULT_REPORT_DATE = "2026-06-30";

/** Base reporting currency for the composed report. */
export const REPORT_CURRENCY = "USD";

/** Per-period frequency used to annualize benchmark statistics (monthly data). */
const PERIODS_PER_YEAR = 12;

/** One headline KPI surfaced at the top of the board report. */
export interface ReportKpi {
  /** Stable key for testids / lookups. */
  readonly key: string;
  /** Human-readable label. */
  readonly label: string;
  /** Pre-formatted display value (currency / percent / ratio). */
  readonly display: string;
  /** Raw numeric value behind the display, for machine checks. */
  readonly raw: number;
}

/** Net-worth & TWR section. */
export interface NetWorthSection {
  readonly baseCurrency: string;
  /** Opening net worth at the start of the window (base currency, units). */
  readonly opening: number;
  /** Current consolidated net worth (base currency, units). */
  readonly current: number;
  /** Cumulative time-weighted return over the window (0.18 = +18%). */
  readonly totalReturn: number;
  /** Number of monthly observations in the window. */
  readonly months: number;
  /** Per-asset-class current value + weight, descending by value. */
  readonly byAssetClass: ReadonlyArray<{
    readonly assetClass: string;
    readonly label: string;
    readonly value: number;
    readonly weight: number;
  }>;
  /** Consolidated monthly net-worth series (oldest first), base currency. */
  readonly series: ReadonlyArray<{ readonly date: string; readonly value: number }>;
}

/** Allocation-vs-policy (IPS compliance) section. */
export interface PolicySection {
  /** True when no IPS constraint is breached. */
  readonly compliant: boolean;
  /** Total breaches across the policy. */
  readonly breachCount: number;
  /** Breaches by severity. */
  readonly criticalBreaches: number;
  readonly warningBreaches: number;
  /** Portfolio total the policy weights are measured against (base units). */
  readonly total: number;
  /** Every breached check, most severe first. */
  readonly breaches: ReadonlyArray<{
    readonly subject: string;
    readonly kind: string;
    readonly bound: string;
    readonly severity: string;
    /** Current weight in [0,1]. */
    readonly weight: number;
    /** Policy limit weight in [0,1]. */
    readonly limit: number;
    /** Base-currency amount over/under the limit. */
    readonly exceedanceAmount: number;
  }>;
}

/** Benchmark-relative performance section. */
export interface BenchmarkSection {
  readonly benchmarkId: string;
  readonly benchmarkLabel: string;
  /** Compounded portfolio total return over the window. */
  readonly portfolioReturn: number;
  /** Compounded benchmark total return over the window. */
  readonly benchmarkReturn: number;
  /** Geometric excess (active) return. */
  readonly excessReturn: number;
  /** Annualized tracking error. */
  readonly trackingError: number;
  /** Annualized information ratio. */
  readonly informationRatio: number;
  readonly beta: number;
  readonly alpha: number;
}

/** Performance-attribution (Brinson) section. */
export interface AttributionSection {
  readonly method: string;
  readonly activeReturn: number;
  readonly totalAllocation: number;
  readonly totalSelection: number;
  readonly totalInteraction: number;
  readonly totalEffect: number;
  readonly segments: ReadonlyArray<{
    readonly id: string;
    readonly label: string;
    readonly allocation: number;
    readonly selection: number;
    readonly interaction: number;
    readonly total: number;
  }>;
}

/** Fees & total-cost-of-ownership section. */
export interface FeesSection {
  readonly totalInvested: number;
  readonly totalAnnualCost: number;
  readonly blendedRate: number;
  readonly dragShareOfProfit: number;
  readonly horizonYears: number;
  readonly terminalDrag: number;
}

/** Private-markets (PE) metrics section. */
export interface PrivateMarketsSection {
  readonly committed: number;
  readonly paidIn: number;
  readonly distributed: number;
  readonly nav: number;
  readonly unfunded: number;
  readonly tvpi: number;
  readonly dpi: number;
  readonly rvpi: number;
  /** Pooled IRR as a fraction, or null when undefined. */
  readonly irr: number | null;
}

/** The full board-grade report: a dated composition of every section. */
export interface BoardReport {
  /** Report "as of" date, `YYYY-MM-DD`. */
  readonly asOf: string;
  /** Base reporting currency. */
  readonly currency: string;
  /** Headline KPI strip. */
  readonly kpis: ReadonlyArray<ReportKpi>;
  readonly netWorth: NetWorthSection;
  readonly policy: PolicySection;
  readonly benchmark: BenchmarkSection;
  readonly attribution: AttributionSection;
  readonly fees: FeesSection;
  readonly privateMarkets: PrivateMarketsSection;
}

/** Options for {@link buildBoardReport}. */
export interface BuildBoardReportInput {
  /** Override the "as of" date. Default {@link DEFAULT_REPORT_DATE}. */
  readonly asOf?: string;
}

/** Round to `dp` decimal places, killing `-0` so snapshots are stable. */
function round(value: number, dp = 6): number {
  const f = 10 ** dp;
  const r = Math.round(value * f) / f;
  return r === 0 ? 0 : r;
}

function fmtCurrency(value: number, currency = REPORT_CURRENCY): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function fmtPercent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

function fmtRatio(value: number, digits = 2): string {
  return value.toFixed(digits);
}

function fmtMultiple(value: number, digits = 2): string {
  return `${value.toFixed(digits)}×`;
}

/** Net-worth & TWR section from the seeded net-worth dashboard. */
function buildNetWorthSection(): NetWorthSection {
  const nw = buildNetWorthDashboard(ipsPortfolio, networthRateTable);
  return {
    baseCurrency: nw.baseCurrency,
    opening: round(nw.opening.amount.toNumber(), 2),
    current: round(nw.current.amount.toNumber(), 2),
    totalReturn: round(nw.totalReturn.toNumber()),
    months: nw.total.points.length,
    byAssetClass: nw.byAssetClass.map((d) => ({
      assetClass: d.assetClass,
      label: assetClassLabel(d.assetClass),
      value: round(d.value.amount.toNumber(), 2),
      weight: round(d.weight.toNumber()),
    })),
    series: nw.total.points.map((p) => ({
      date: p.date,
      value: round(p.value.amount.toNumber(), 2),
    })),
  };
}

/** Allocation-vs-policy (IPS) section from the seeded compliance report. */
function buildPolicySection(): PolicySection {
  const report: ComplianceReport = evaluatePolicy(
    ipsPortfolio,
    sampleIps,
    ipsRateTable,
  );
  return {
    compliant: report.compliant,
    breachCount: report.breaches.length,
    criticalBreaches: report.counts.critical,
    warningBreaches: report.counts.warning,
    total: round(report.total.amount.toNumber(), 2),
    breaches: report.breaches.map((b) => ({
      subject: b.subject,
      kind: b.kind,
      bound: b.bound,
      severity: b.severity,
      weight: round(b.weight.toNumber()),
      limit: round(b.limit.toNumber()),
      exceedanceAmount: round(b.exceedanceAmount.amount.toNumber(), 2),
    })),
  };
}

/** Benchmark-relative performance section. */
function buildBenchmarkSection(): BenchmarkSection {
  const view = buildBenchmarkView({
    portfolio: PORTFOLIO_RETURNS,
    benchmark: POLICY_BENCHMARK,
    periodsPerYear: PERIODS_PER_YEAR,
  });
  const p = view.performance;
  return {
    benchmarkId: view.benchmarkId,
    benchmarkLabel: view.benchmarkLabel,
    portfolioReturn: round(p.portfolioReturn),
    benchmarkReturn: round(p.benchmarkReturn),
    excessReturn: round(p.excessReturn),
    trackingError: round(p.trackingError),
    informationRatio: round(p.informationRatio),
    beta: round(p.beta),
    alpha: round(p.alpha),
  };
}

/** Brinson attribution section. */
function buildAttributionSection(): AttributionSection {
  const view = buildAttributionView(FAMILY_OFFICE_ATTRIBUTION);
  return {
    method: view.method,
    activeReturn: round(view.activeReturn),
    totalAllocation: round(view.totalAllocation),
    totalSelection: round(view.totalSelection),
    totalInteraction: round(view.totalInteraction),
    totalEffect: round(view.totalEffect),
    segments: view.segments.map((s) => ({
      id: s.id,
      label: s.label,
      allocation: round(s.allocation),
      selection: round(s.selection),
      interaction: round(s.interaction),
      total: round(s.total),
    })),
  };
}

/** Fees & TCO section. */
function buildFeesSection(): FeesSection {
  const model = buildFeeModel();
  return {
    totalInvested: round(model.kpis.totalInvested, 2),
    totalAnnualCost: round(model.kpis.totalAnnualCost, 2),
    blendedRate: round(model.kpis.blendedRate),
    dragShareOfProfit: round(model.kpis.dragShareOfProfit),
    horizonYears: model.horizonYears,
    terminalDrag: round(model.terminalDrag, 2),
  };
}

/** Private-markets (PE) metrics section. */
function buildPrivateMarketsSection(): PrivateMarketsSection {
  const model = buildPrivateMarketsModel();
  const k = model.kpis;
  return {
    committed: round(k.committed, 2),
    paidIn: round(k.paidIn, 2),
    distributed: round(k.distributed, 2),
    nav: round(k.nav, 2),
    unfunded: round(k.unfunded, 2),
    tvpi: round(k.tvpi),
    dpi: round(k.dpi),
    rvpi: round(k.rvpi),
    irr: k.irr === null ? null : round(k.irr),
  };
}

/** Build the headline KPI strip from the composed sections. */
function buildKpis(
  netWorth: NetWorthSection,
  benchmark: BenchmarkSection,
  policy: PolicySection,
  fees: FeesSection,
  pe: PrivateMarketsSection,
): ReportKpi[] {
  return [
    {
      key: "net-worth",
      label: "Net worth",
      display: fmtCurrency(netWorth.current, netWorth.baseCurrency),
      raw: netWorth.current,
    },
    {
      key: "twr",
      label: "Window TWR",
      display: fmtPercent(netWorth.totalReturn),
      raw: netWorth.totalReturn,
    },
    {
      key: "excess-return",
      label: "Excess vs. policy",
      display: fmtPercent(benchmark.excessReturn),
      raw: benchmark.excessReturn,
    },
    {
      key: "info-ratio",
      label: "Information ratio",
      display: fmtRatio(benchmark.informationRatio),
      raw: benchmark.informationRatio,
    },
    {
      key: "policy-breaches",
      label: "IPS breaches",
      display: String(policy.breachCount),
      raw: policy.breachCount,
    },
    {
      key: "fee-rate",
      label: "Blended fee",
      display: fmtPercent(fees.blendedRate, 2),
      raw: fees.blendedRate,
    },
    {
      key: "pe-tvpi",
      label: "PE TVPI",
      display: fmtMultiple(pe.tvpi),
      raw: pe.tvpi,
    },
  ];
}

/**
 * Compose the full board-grade {@link BoardReport} from every engine.
 *
 * Pure, deterministic and offline: each section is derived from the engines'
 * seeded fixtures, so calling this with the same `asOf` always yields an
 * identical object — which is what the snapshot test pins.
 */
export function buildBoardReport(
  input: BuildBoardReportInput = {},
): BoardReport {
  const asOf = input.asOf ?? DEFAULT_REPORT_DATE;

  const netWorth = buildNetWorthSection();
  const policy = buildPolicySection();
  const benchmark = buildBenchmarkSection();
  const attribution = buildAttributionSection();
  const fees = buildFeesSection();
  const privateMarkets = buildPrivateMarketsSection();

  const kpis = buildKpis(netWorth, benchmark, policy, fees, privateMarkets);

  return {
    asOf,
    currency: REPORT_CURRENCY,
    kpis,
    netWorth,
    policy,
    benchmark,
    attribution,
    fees,
    privateMarkets,
  };
}

/** The seeded board report, built once for the default date. */
export const seededBoardReport: BoardReport = buildBoardReport();
