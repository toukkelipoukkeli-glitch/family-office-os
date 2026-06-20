/**
 * m14-export-precision — per-page export adapters for the remaining data-heavy
 * pages.
 *
 * Each `*Export` here turns one page's deterministic *engine* model (NOT the
 * collapsed float view-model) into an {@link ExportDataset}: a byte-stable
 * {@link CsvTable} mirroring the page's primary money table, plus a structured
 * JSON payload. Every monetary figure crosses the boundary as an **exact decimal
 * string** (`Decimal.toFixed()`), never a float — honouring AGENTS.md ("Money is
 * exact Decimal; number only at the render boundary").
 *
 * Currency correctness: every builder takes a {@link MoneyConverter} — the same
 * reporting-currency conversion the page applies on screen via
 * `useReportingMoney`. A `Money` figure is converted with `convertMoney` (exact
 * `Decimal` FX math); a plain base-currency `number` (already reduced from
 * `Decimal` in the engine's view layer) is converted with `convertDecimal`,
 * which divides in `Decimal` space and emits the exact `.toFixed()` string. So a
 * download reproduces *exactly* what the analyst sees, including after a currency
 * switch.
 *
 * Pure, deterministic and offline. READ-ONLY: it only serializes values the user
 * already sees.
 */

import type { CsvCell, CsvTable } from "./csv";
import type { ExportDataset } from "./tables";

import { Money } from "@/lib/money";
import { REPORTING_BASE_CURRENCY } from "@/lib/reporting-currency";

import type { GivingAnalysis } from "@/lib/giving";
import type { EstateAnalysis } from "@/lib/estate";
import type { FeeModel } from "@/lib/fees";
import type { CashflowModel } from "@/lib/cashflow";
import type { LiquidityModel } from "@/lib/liquidity";
import type { FundingSummary } from "@/lib/goals";
import type { InsuranceAnalysis } from "@/lib/insurance";
import type { PrivateMarketsModel } from "@/lib/privatemarkets";
import {
  assetClassLabel as lookThroughAssetClassLabel,
  type LookThroughReport,
} from "@/lib/lookthrough";
import type { ConsolidationReport } from "@/lib/consolidation";
import type { CockpitModel } from "@/lib/scenario/cockpit/cockpit";
import type { StressModel } from "@/lib/stress";

/* ------------------------------------------------------------------------- */
/* Currency-conversion boundary                                              */
/* ------------------------------------------------------------------------- */

/**
 * The slice of the reporting-currency hook an export adapter needs: the active
 * reporting currency plus the exact-Decimal `convertMoney`. The `ReportingMoney`
 * returned by `useReportingMoney()` structurally satisfies this, so a page passes
 * it directly; tests pass a tiny fake.
 */
export interface MoneyConverter {
  /** Active reporting-currency code (e.g. `"EUR"`). */
  readonly currency: string;
  /** Re-express a base-currency {@link Money} into the reporting currency. */
  convertMoney(money: Money): Money;
}

/** The identity converter (no FX) — base currency, exact pass-through. */
export function baseConverter(currency: string): MoneyConverter {
  return { currency, convertMoney: (m) => m };
}

/**
 * Convert a base-currency exact {@link Money} and return its exact decimal
 * *string* in the reporting currency. This is the value the page shows.
 */
function money(c: MoneyConverter, m: Money): string {
  return c.convertMoney(m).amount.toFixed();
}

/**
 * Convert a base-currency *number* (already reduced from `Decimal` in an engine
 * view layer) to an exact reporting-currency decimal string. The page renders
 * `convert(value)` then formats; we reproduce that conversion in `Decimal` space
 * (`value × rate`) so the export stays exact rather than re-introducing float
 * division error. We derive the rate once from the converter by converting a
 * unit of base money.
 */
/**
 * Convert a base-currency *number* model figure to an exact reporting-currency
 * decimal string. The figure is lifted into an exact base-currency {@link Money}
 * and run through the SAME `convertMoney` FX path as every `Money` field, so the
 * number and money columns share identical conversion math (no float drift, and
 * the divide-by-rate happens exactly once in `Decimal` space). This reproduces
 * the page's `convert(value)` boundary precisely.
 */
function num(conv: MoneyConverter, value: number): string {
  return conv.convertMoney(Money.of(value, REPORTING_BASE_CURRENCY)).amount.toFixed();
}

/* ------------------------------------------------------------------------- */
/* Giving                                                                    */
/* ------------------------------------------------------------------------- */

/**
 * Charitable-giving planner → per-year plan table + full analysis JSON.
 * The CSV mirrors the multi-year plan table the page renders; every figure is
 * re-expressed in the reporting currency exactly as the page shows it.
 */
export function givingExport(
  analysis: GivingAnalysis,
  conv: MoneyConverter,
): ExportDataset {
  const cur = conv.currency;
  const rows: CsvCell[][] = analysis.yearResults.map((y) => [
    y.year,
    money(conv, y.gifted),
    money(conv, y.deductionUsed),
    money(conv, y.carriedForward),
    money(conv, y.capitalGainsAvoided),
    money(conv, y.incomeTaxSaved),
    money(conv, y.totalBenefit),
  ]);

  const table: CsvTable = {
    columns: [
      "year",
      `gifted (${cur})`,
      `deductionUsed (${cur})`,
      `carriedForward (${cur})`,
      `capitalGainsAvoided (${cur})`,
      `incomeTaxSaved (${cur})`,
      `totalBenefit (${cur})`,
    ],
    rows,
  };

  const json = {
    currency: cur,
    totals: {
      gifted: money(conv, analysis.totalGifted),
      capitalGainsAvoided: money(conv, analysis.totalCapitalGainsAvoided),
      incomeTaxSaved: money(conv, analysis.totalIncomeTaxSaved),
      totalBenefit: money(conv, analysis.totalBenefit),
      netCost: money(conv, analysis.netCost),
    },
    years: analysis.yearResults.map((y) => ({
      year: y.year,
      gifted: money(conv, y.gifted),
      deductionUsed: money(conv, y.deductionUsed),
      carriedForward: money(conv, y.carriedForward),
      capitalGainsAvoided: money(conv, y.capitalGainsAvoided),
      incomeTaxSaved: money(conv, y.incomeTaxSaved),
      totalBenefit: money(conv, y.totalBenefit),
    })),
    gifts: analysis.giftBenefits.map((g) => ({
      giftId: g.giftId,
      label: g.label,
      kind: g.kind,
      recipient: g.recipient,
      fairMarketValue: money(conv, g.fairMarketValue),
      embeddedGain: money(conv, g.embeddedGain),
      capitalGainsAvoided: money(conv, g.capitalGainsAvoided),
      deductibleAmount: money(conv, g.deductibleAmount),
    })),
  };

  return { name: "giving-plan", table, json };
}

/* ------------------------------------------------------------------------- */
/* Estate                                                                    */
/* ------------------------------------------------------------------------- */

/**
 * Estate planner → settlement funding-waterfall table + full analysis JSON
 * (estate-tax build-up, beneficiary shares, coverage), all in the reporting
 * currency.
 */
export function estateExport(
  analysis: EstateAnalysis,
  conv: MoneyConverter,
): ExportDataset {
  const cur = conv.currency;
  const rows: CsvCell[][] = analysis.fundingWaterfall.map((s) => [
    s.cls,
    s.label,
    money(conv, s.grossUsed),
    money(conv, s.netUsed),
  ]);

  const table: CsvTable = {
    columns: ["tier", "label", `grossUsed (${cur})`, `netUsed (${cur})`],
    rows,
  };

  const json = {
    currency: cur,
    grossEstate: money(conv, analysis.grossEstate),
    totalDebts: money(conv, analysis.totalDebts),
    adminCost: money(conv, analysis.adminCost),
    exemptBequests: money(conv, analysis.exemptBequests),
    netEstate: money(conv, analysis.netEstate),
    exemptionApplied: money(conv, analysis.exemptionApplied),
    taxableEstate: money(conv, analysis.taxableEstate),
    estateTax: money(conv, analysis.estateTax),
    settlementNeed: money(conv, analysis.settlementNeed),
    liquidAvailable: money(conv, analysis.liquidAvailable),
    shortfall: money(conv, analysis.shortfall),
    coverageRatio: analysis.coverageRatio.toNumber(),
    covered: analysis.covered,
    waterfall: analysis.fundingWaterfall.map((s) => ({
      cls: s.cls,
      label: s.label,
      grossUsed: money(conv, s.grossUsed),
      netUsed: money(conv, s.netUsed),
    })),
    beneficiaries: analysis.beneficiaryShares.map((b) => ({
      beneficiaryId: b.beneficiaryId,
      name: b.name,
      relation: b.relation,
      tax: money(conv, b.tax),
      net: money(conv, b.net),
    })),
  };

  return { name: "estate-plan", table, json };
}

/* ------------------------------------------------------------------------- */
/* Fees                                                                      */
/* ------------------------------------------------------------------------- */

/**
 * Fee engine → per-fund cost table + full model JSON. The fee view-model holds
 * plain base-currency numbers, so figures convert via {@link num} (exact Decimal
 * `value × rate`), reproducing the page's `convert(value)` without float error.
 */
export function feesExport(model: FeeModel, conv: MoneyConverter): ExportDataset {
  const cur = conv.currency;
  const rows: CsvCell[][] = model.funds.map((f) => [
    f.id,
    f.name,
    f.category,
    num(conv, f.managementCost),
    num(conv, f.fundExpenseCost),
    num(conv, f.performanceCost),
    num(conv, f.totalCost),
    f.effectiveRate,
  ]);

  const table: CsvTable = {
    columns: [
      "id",
      "fund",
      "category",
      `managementCost (${cur})`,
      `fundExpenseCost (${cur})`,
      `performanceCost (${cur})`,
      `totalCost (${cur})`,
      "effectiveRate",
    ],
    rows,
  };

  const json = {
    currency: cur,
    kpis: {
      totalInvested: num(conv, model.kpis.totalInvested),
      totalAnnualCost: num(conv, model.kpis.totalAnnualCost),
      blendedRate: model.kpis.blendedRate,
      dragShareOfProfit: model.kpis.dragShareOfProfit,
    },
    terminalDrag: num(conv, model.terminalDrag),
    horizonYears: model.horizonYears,
    funds: model.funds.map((f) => ({
      id: f.id,
      name: f.name,
      category: f.category,
      invested: num(conv, f.invested),
      managementCost: num(conv, f.managementCost),
      fundExpenseCost: num(conv, f.fundExpenseCost),
      performanceCost: num(conv, f.performanceCost),
      totalCost: num(conv, f.totalCost),
      effectiveRate: f.effectiveRate,
    })),
    composition: model.composition.map((s) => ({
      key: s.key,
      label: s.label,
      value: num(conv, s.value),
    })),
  };

  return { name: "fees", table, json };
}

/* ------------------------------------------------------------------------- */
/* Cashflow                                                                  */
/* ------------------------------------------------------------------------- */

/**
 * Cashflow projection → per-month balance table + full model JSON. The view
 * model holds plain numbers, so figures convert via {@link num} (exact Decimal).
 */
export function cashflowExport(
  model: CashflowModel,
  conv: MoneyConverter,
): ExportDataset {
  const cur = conv.currency;
  const rows: CsvCell[][] = model.months.map((m) => [
    m.period,
    num(conv, m.openingBalance),
    num(conv, m.inflows),
    num(conv, m.outflows),
    num(conv, m.netFlow),
    num(conv, m.closingBalance),
  ]);

  const table: CsvTable = {
    columns: [
      "period",
      `openingBalance (${cur})`,
      `inflows (${cur})`,
      `outflows (${cur})`,
      `netFlow (${cur})`,
      `closingBalance (${cur})`,
    ],
    rows,
  };

  const json = {
    currency: cur,
    kpis: {
      openingBalance: num(conv, model.kpis.openingBalance),
      endingBalance: num(conv, model.kpis.endingBalance),
      minBalance: num(conv, model.kpis.minBalance),
      minBalancePeriod: model.kpis.minBalancePeriod,
      totalInflows: num(conv, model.kpis.totalInflows),
      totalOutflows: num(conv, model.kpis.totalOutflows),
      netFlow: num(conv, model.kpis.netFlow),
      firstShortfallPeriod: model.kpis.firstShortfallPeriod,
    },
    months: model.months.map((m) => ({
      period: m.period,
      openingBalance: num(conv, m.openingBalance),
      inflows: num(conv, m.inflows),
      outflows: num(conv, m.outflows),
      netFlow: num(conv, m.netFlow),
      closingBalance: num(conv, m.closingBalance),
    })),
    categories: model.categories.map((c) => ({
      category: c.category,
      direction: c.direction,
      total: num(conv, c.total),
    })),
  };

  return { name: "cashflow", table, json };
}

/* ------------------------------------------------------------------------- */
/* Liquidity                                                                 */
/* ------------------------------------------------------------------------- */

/** Liquidity coverage → per-month coverage table + full model JSON. */
export function liquidityExport(
  model: LiquidityModel,
  conv: MoneyConverter,
): ExportDataset {
  const cur = conv.currency;
  const rows: CsvCell[][] = model.months.map((m) => [
    m.period,
    num(conv, m.availableLiquidity),
    num(conv, m.obligation),
    num(conv, m.shortfall),
    num(conv, m.closingLiquidity),
    m.coverageRatio,
    m.covered,
  ]);

  const table: CsvTable = {
    columns: [
      "period",
      `availableLiquidity (${cur})`,
      `obligation (${cur})`,
      `shortfall (${cur})`,
      `closingLiquidity (${cur})`,
      "coverageRatio",
      "covered",
    ],
    rows,
  };

  const json = {
    currency: cur,
    kpis: {
      totalLiquidity: num(conv, model.kpis.totalLiquidity),
      grossLiquidity: num(conv, model.kpis.grossLiquidity),
      totalObligations: num(conv, model.kpis.totalObligations),
      totalShortfall: num(conv, model.kpis.totalShortfall),
      coverageRatio: model.kpis.coverageRatio,
      fullyCovered: model.kpis.fullyCovered,
    },
    reserves: model.reserves.map((r) => ({
      id: r.id,
      label: r.label,
      gross: num(conv, r.gross),
      deployable: num(conv, r.deployable),
      haircut: r.haircut,
      availableFromMonth: r.availableFromMonth,
    })),
    months: model.months.map((m) => ({
      period: m.period,
      availableLiquidity: num(conv, m.availableLiquidity),
      obligation: num(conv, m.obligation),
      shortfall: num(conv, m.shortfall),
      closingLiquidity: num(conv, m.closingLiquidity),
      coverageRatio: m.coverageRatio,
      covered: m.covered,
    })),
  };

  return { name: "liquidity", table, json };
}

/* ------------------------------------------------------------------------- */
/* Goals                                                                     */
/* ------------------------------------------------------------------------- */

/** Goal-funding summary → per-goal table + full summary JSON. */
export function goalsExport(
  summary: FundingSummary,
  conv: MoneyConverter,
): ExportDataset {
  const cur = conv.currency;
  const rows: CsvCell[][] = summary.goals.map((g) => [
    g.goal.id,
    g.goal.name,
    g.goal.category,
    money(conv, g.target),
    money(conv, g.dedicatedNow),
    money(conv, g.dedicatedAtDue),
    money(conv, g.gap),
    money(conv, g.surplus),
    g.fundedRatio.toNumber(),
    g.funded,
  ]);

  const table: CsvTable = {
    columns: [
      "id",
      "name",
      "category",
      `target (${cur})`,
      `dedicatedNow (${cur})`,
      `dedicatedAtDue (${cur})`,
      `gap (${cur})`,
      `surplus (${cur})`,
      "fundedRatio",
      "funded",
    ],
    rows,
  };

  const json = {
    currency: cur,
    totals: {
      totalTarget: money(conv, summary.totalTarget),
      totalDedicatedNow: money(conv, summary.totalDedicatedNow),
      totalDedicatedAtDue: money(conv, summary.totalDedicatedAtDue),
      dedicatedCovered: money(conv, summary.dedicatedCovered),
      totalGap: money(conv, summary.totalGap),
      fundedRatio: summary.fundedRatio.toNumber(),
      fundedCount: summary.fundedCount,
      shortfallCount: summary.shortfallCount,
    },
    goals: summary.goals.map((g) => ({
      id: g.goal.id,
      name: g.goal.name,
      category: g.goal.category,
      dueYears: g.goal.dueYears,
      priority: g.goal.priority,
      target: money(conv, g.target),
      dedicatedNow: money(conv, g.dedicatedNow),
      dedicatedAtDue: money(conv, g.dedicatedAtDue),
      gap: money(conv, g.gap),
      surplus: money(conv, g.surplus),
      fundedRatio: g.fundedRatio.toNumber(),
      funded: g.funded,
    })),
  };

  return { name: "goal-funding", table, json };
}

/* ------------------------------------------------------------------------- */
/* Insurance                                                                 */
/* ------------------------------------------------------------------------- */

/** Insurance book → per-category coverage table + full analysis JSON. */
export function insuranceExport(
  analysis: InsuranceAnalysis,
  conv: MoneyConverter,
): ExportDataset {
  const cur = conv.currency;
  const rows: CsvCell[][] = analysis.categories.map((c) => [
    c.kind,
    c.label,
    money(conv, c.activeCoverage),
    money(conv, c.annualPremium),
    money(conv, c.exposure),
    c.activeCount,
    c.inactiveCount,
    c.coverageRatio ? c.coverageRatio.toNumber() : null,
  ]);

  const table: CsvTable = {
    columns: [
      "kind",
      "label",
      `activeCoverage (${cur})`,
      `annualPremium (${cur})`,
      `exposure (${cur})`,
      "activeCount",
      "inactiveCount",
      "coverageRatio",
    ],
    rows,
  };

  const json = {
    currency: cur,
    totals: {
      totalActiveCoverage: money(conv, analysis.totalActiveCoverage),
      totalAnnualPremium: money(conv, analysis.totalAnnualPremium),
      liabilityTowerCoverage: money(conv, analysis.liabilityTowerCoverage),
      activePolicyCount: analysis.activePolicyCount,
      liabilityCoverageRatio: analysis.liabilityCoverageRatio
        ? analysis.liabilityCoverageRatio.toNumber()
        : null,
    },
    categories: analysis.categories.map((c) => ({
      kind: c.kind,
      label: c.label,
      activeCoverage: money(conv, c.activeCoverage),
      annualPremium: money(conv, c.annualPremium),
      exposure: money(conv, c.exposure),
      activeCount: c.activeCount,
      inactiveCount: c.inactiveCount,
      coverageRatio: c.coverageRatio ? c.coverageRatio.toNumber() : null,
    })),
    gaps: analysis.gaps.map((g) => ({
      id: g.id,
      scope: g.scope,
      severity: g.severity,
      title: g.title,
      detail: g.detail,
      shortfall: g.shortfall ? money(conv, g.shortfall) : null,
    })),
  };

  return { name: "insurance", table, json };
}

/* ------------------------------------------------------------------------- */
/* Private markets                                                           */
/* ------------------------------------------------------------------------- */

/** Private-markets commitments → per-fund lifecycle table + full model JSON. */
export function privateMarketsExport(
  model: PrivateMarketsModel,
  conv: MoneyConverter,
): ExportDataset {
  const cur = conv.currency;
  const rows: CsvCell[][] = model.commitments.map((c) => [
    c.id,
    c.name,
    c.strategy,
    c.vintageYear,
    num(conv, c.committed),
    num(conv, c.paidIn),
    num(conv, c.distributed),
    num(conv, c.nav),
    num(conv, c.unfunded),
    c.tvpi,
    c.dpi,
    c.rvpi,
    c.irr,
  ]);

  const table: CsvTable = {
    columns: [
      "id",
      "name",
      "strategy",
      "vintageYear",
      `committed (${cur})`,
      `paidIn (${cur})`,
      `distributed (${cur})`,
      `nav (${cur})`,
      `unfunded (${cur})`,
      "tvpi",
      "dpi",
      "rvpi",
      "irr",
    ],
    rows,
  };

  const json = {
    currency: cur,
    kpis: {
      committed: num(conv, model.kpis.committed),
      paidIn: num(conv, model.kpis.paidIn),
      distributed: num(conv, model.kpis.distributed),
      nav: num(conv, model.kpis.nav),
      unfunded: num(conv, model.kpis.unfunded),
      tvpi: model.kpis.tvpi,
      dpi: model.kpis.dpi,
      rvpi: model.kpis.rvpi,
      irr: model.kpis.irr,
    },
    commitments: model.commitments.map((c) => ({
      id: c.id,
      name: c.name,
      strategy: c.strategy,
      vintageYear: c.vintageYear,
      committed: num(conv, c.committed),
      paidIn: num(conv, c.paidIn),
      distributed: num(conv, c.distributed),
      nav: num(conv, c.nav),
      unfunded: num(conv, c.unfunded),
      tvpi: c.tvpi,
      dpi: c.dpi,
      rvpi: c.rvpi,
      moic: c.moic,
      irr: c.irr,
    })),
  };

  return { name: "private-markets", table, json };
}

/* ------------------------------------------------------------------------- */
/* Look-through                                                              */
/* ------------------------------------------------------------------------- */

/** Look-through report → per-asset-class exposure table + full report JSON. */
export function lookThroughExport(
  report: LookThroughReport,
  conv: MoneyConverter,
): ExportDataset {
  const cur = conv.currency;
  const rows: CsvCell[][] = report.lines.map((l) => [
    l.assetClass,
    lookThroughAssetClassLabel(l.assetClass),
    money(conv, l.value),
    l.weight,
  ]);

  const table: CsvTable = {
    columns: ["assetClass", "label", `value (${cur})`, "weight"],
    rows,
  };

  const json = {
    rootId: report.rootId,
    rootName: report.rootName,
    currency: cur,
    total: money(conv, report.total),
    lines: report.lines.map((l) => ({
      assetClass: l.assetClass,
      label: lookThroughAssetClassLabel(l.assetClass),
      value: money(conv, l.value),
      weight: l.weight,
      contributions: l.contributions.map((ctr) => ({
        entityId: ctr.entityId,
        entityName: ctr.entityName,
        effectivePct: ctr.effectivePct,
        gross: money(conv, ctr.gross),
        attributed: money(conv, ctr.attributed),
      })),
    })),
  };

  return { name: "look-through", table, json };
}

/* ------------------------------------------------------------------------- */
/* Consolidation                                                             */
/* ------------------------------------------------------------------------- */

/** Consolidation statement → per-entity NAV table + full report JSON. */
export function consolidationExport(
  report: ConsolidationReport,
  conv: MoneyConverter,
): ExportDataset {
  const cur = conv.currency;
  const rows: CsvCell[][] = report.entities.map((e) => [
    e.entityId,
    e.entityName,
    e.kind,
    e.effectivePct,
    money(conv, e.standaloneNav),
    money(conv, e.ownedNav),
    money(conv, e.minorityInterest),
    money(conv, e.intercompanyHeld),
  ]);

  const table: CsvTable = {
    columns: [
      "entityId",
      "entityName",
      "kind",
      "effectivePct",
      `standaloneNav (${cur})`,
      `ownedNav (${cur})`,
      `minorityInterest (${cur})`,
      `intercompanyHeld (${cur})`,
    ],
    rows,
  };

  const json = {
    rootId: report.rootId,
    rootName: report.rootName,
    currency: cur,
    grossNav: money(conv, report.grossNav),
    intercompanyEliminations: money(conv, report.intercompanyEliminations),
    minorityInterest: money(conv, report.minorityInterest),
    consolidatedNetWorth: money(conv, report.consolidatedNetWorth),
    entities: report.entities.map((e) => ({
      entityId: e.entityId,
      entityName: e.entityName,
      kind: e.kind,
      effectivePct: e.effectivePct,
      standaloneNav: money(conv, e.standaloneNav),
      ownedNav: money(conv, e.ownedNav),
      minorityInterest: money(conv, e.minorityInterest),
      intercompanyHeld: money(conv, e.intercompanyHeld),
    })),
    eliminations: report.eliminations.map((el) => ({
      holderId: el.holderId,
      holderName: el.holderName,
      investeeId: el.investeeId,
      investeeName: el.investeeName,
      carryingValue: money(conv, el.carryingValue),
      holderEffectivePct: el.holderEffectivePct,
      eliminated: money(conv, el.eliminated),
    })),
  };

  return { name: "consolidation", table, json };
}

/* ------------------------------------------------------------------------- */
/* Scenarios (cockpit)                                                       */
/* ------------------------------------------------------------------------- */

/** Scenario cockpit → driver tornado table + KPI/fan JSON. */
export function scenarioExport(
  model: CockpitModel,
  conv: MoneyConverter,
): ExportDataset {
  const cur = conv.currency;
  const rows: CsvCell[][] = model.tornado.bars.map((b) => [
    b.scenarioId,
    b.scenarioName,
    num(conv, b.meanDelta),
    num(conv, b.initialDelta),
    num(conv, b.varDelta),
  ]);

  const table: CsvTable = {
    columns: [
      "scenarioId",
      "scenarioName",
      `meanDelta (${cur})`,
      `initialDelta (${cur})`,
      `varDelta (${cur})`,
    ],
    rows,
  };

  const json = {
    currency: cur,
    horizonYears: model.horizonYears,
    kpis: {
      initialNetWorth: num(conv, model.kpis.initialNetWorth),
      expectedTerminal: num(conv, model.kpis.expectedTerminal),
      medianTerminal: num(conv, model.kpis.medianTerminal),
      valueAtRisk95: num(conv, model.kpis.valueAtRisk95),
      probabilityOfLoss: model.kpis.probabilityOfLoss,
    },
    tornado: model.tornado.bars.map((b) => ({
      scenarioId: b.scenarioId,
      scenarioName: b.scenarioName,
      meanDelta: num(conv, b.meanDelta),
      initialDelta: num(conv, b.initialDelta),
      varDelta: num(conv, b.varDelta),
    })),
    fan: model.fan.points.map((p) => ({
      year: p.year,
      p5: num(conv, p.p5),
      p25: num(conv, p.p25),
      p50: num(conv, p.p50),
      p75: num(conv, p.p75),
      p95: num(conv, p.p95),
    })),
  };

  return { name: "scenario-cockpit", table, json };
}

/* ------------------------------------------------------------------------- */
/* Stress tests                                                              */
/* ------------------------------------------------------------------------- */

/** Stress-test library → per-episode impact table + full model JSON. */
export function stressExport(
  model: StressModel,
  conv: MoneyConverter,
): ExportDataset {
  const cur = conv.currency;
  const rows: CsvCell[][] = model.results.map((r) => [
    r.scenario.id,
    r.scenario.name,
    num(conv, r.netWorthBefore),
    num(conv, r.netWorthAfter),
    num(conv, r.drawdown),
    r.drawdownPct,
    num(conv, r.forward.varDelta),
    r.forward.probabilityOfLoss,
  ]);

  const table: CsvTable = {
    columns: [
      "id",
      "name",
      `netWorthBefore (${cur})`,
      `netWorthAfter (${cur})`,
      `drawdown (${cur})`,
      "drawdownPct",
      `varDelta (${cur})`,
      "probabilityOfLoss",
    ],
    rows,
  };

  const json = {
    currency: cur,
    netWorthToday: num(conv, model.netWorthToday),
    horizonYears: model.horizonYears,
    results: model.results.map((r) => ({
      id: r.scenario.id,
      name: r.scenario.name,
      netWorthBefore: num(conv, r.netWorthBefore),
      netWorthAfter: num(conv, r.netWorthAfter),
      drawdown: num(conv, r.drawdown),
      drawdownPct: r.drawdownPct,
      forward: {
        meanDelta: num(conv, r.forward.meanDelta),
        medianDelta: num(conv, r.forward.medianDelta),
        p5Delta: num(conv, r.forward.p5Delta),
        varDelta: num(conv, r.forward.varDelta),
        probabilityOfLoss: r.forward.probabilityOfLoss,
      },
    })),
  };

  return { name: "stress-tests", table, json };
}
