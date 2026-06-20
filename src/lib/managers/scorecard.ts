/**
 * Manager / fund due-diligence **scorecard** engine.
 *
 * This module is the *oracle* behind the m11-manager-scorecard page. It turns a
 * set of external manager / fund records — each with a periodic **gross** return
 * series, a fee schedule (management fee, fund expenses, carry over a hurdle),
 * AUM, vintage and a benchmark return series — into a deterministic, plain-data
 * scorecard:
 *
 *  - **Net-of-fee vs. gross** compounded return, per period and total. Fees are
 *    applied period-by-period: a pro-rated management + expense charge every
 *    period, plus carry on profit above the hurdle (a high-water-mark crystallised
 *    once a year, the standard hedge-fund / drawdown-fund convention).
 *  - **Fee drag** — the gap between gross and net compounded wealth, and the
 *    fraction of gross profit consumed by fees.
 *  - **Benchmark-relative** performance of the *net* series: excess return,
 *    tracking error, information ratio and beta (reusing the m9-benchmark
 *    relative-performance engine).
 *  - A **composite score** (0–100): a transparent weighted blend of net excess
 *    return, information ratio, fee efficiency and consistency (hit rate), so a
 *    family office can rank managers on one page.
 *
 * All money / return arithmetic that touches currency is exact {@link Decimal}
 * (see AGENTS.md: never floating-point currency). The engine is pure,
 * deterministic and offline — it *reports* due-diligence metrics; it is
 * READ-ONLY and never moves money or places trades.
 */

import { Decimal } from "decimal.js";

import {
  beta as benchmarkBeta,
  compoundReturn,
  informationRatio,
  trackingError,
} from "@/lib/benchmark";

/** Thrown when scorecard inputs are structurally invalid. */
export class ManagerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManagerError";
  }
}

/**
 * A manager / fund's fee terms. Rates are fractions: `0.02` = 2% management,
 * `0.20` = 20% carry, `0.08` = an 8%/yr hurdle.
 */
export interface FeeTerms {
  /** Annual management fee as a fraction of AUM (0.02 = 2%). */
  readonly managementFee: number;
  /** Fund operating expenses above the management fee, as a fraction of AUM. */
  readonly fundExpenses: number;
  /** Carry / performance fee as a fraction of profit above the hurdle (0.20 = 20%). */
  readonly carry: number;
  /** Annual hurdle the carry is charged above, as a fraction (0.08 = 8%). Default 0. */
  readonly hurdle?: number;
}

/** A single external manager / fund under due diligence. */
export interface Manager {
  /** Stable id. */
  readonly id: string;
  /** Display name. */
  readonly name: string;
  /** Strategy / asset-class bucket (free-form, used for grouping & display). */
  readonly strategy: string;
  /** Vintage year the mandate / fund was struck. */
  readonly vintage: number;
  /** Current assets under management, in currency units. */
  readonly aum: number;
  /** Fee terms. */
  readonly fees: FeeTerms;
  /** Periodic **gross** (pre-fee) simple returns (0.01 = +1%). */
  readonly grossReturns: readonly number[];
  /** Periodic benchmark simple returns, aligned to {@link grossReturns}. */
  readonly benchmarkReturns: readonly number[];
}

/**
 * How many return observations make up one year. Carry crystallises once per
 * this many periods (the high-water-mark reset cadence). Defaults to 12
 * (monthly observations).
 */
export interface ScorecardOptions {
  /** Observations per year. Default 12. */
  readonly periodsPerYear?: number;
  /** Per-period risk-free rate used nowhere yet but reserved for alpha. Default 0. */
  readonly riskFreeRate?: number;
  /** Weights for the composite score; see {@link DEFAULT_SCORE_WEIGHTS}. */
  readonly weights?: ScoreWeights;
}

/** Weights for the composite score components. Need not sum to 1; they are normalised. */
export interface ScoreWeights {
  /** Weight on net excess-return-vs-benchmark. */
  readonly excess: number;
  /** Weight on the information ratio. */
  readonly infoRatio: number;
  /** Weight on fee efficiency (low drag-share-of-profit scores high). */
  readonly feeEfficiency: number;
  /** Weight on consistency (hit rate: fraction of periods beating the benchmark). */
  readonly consistency: number;
}

/** Default composite-score weights: rewards net alpha and consistency, penalises fee drag. */
export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  excess: 0.35,
  infoRatio: 0.25,
  feeEfficiency: 0.2,
  consistency: 0.2,
};

function num(value: number, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ManagerError(`${label} must be a finite number; got ${value}`);
  }
  return value;
}

function nonNegFraction(value: number, label: string): number {
  const v = num(value, label);
  if (v < 0) throw new ManagerError(`${label} must be non-negative; got ${v}`);
  return v;
}

/**
 * The fully-loaded **net** return for one period, given a per-period management
 * + expense charge and any carry crystallised this period.
 *
 * Net = gross − pro-rated (management + expenses) on the period, then carry is
 * deducted at year boundaries (handled by {@link netReturnSeries}). Returns the
 * net simple return for the period before carry.
 */
function netBeforeCarry(gross: number, periodFeeRate: number): number {
  // The management + expense charge accrues on assets through the period; the
  // standard approximation deducts it from the period's simple return.
  return gross - periodFeeRate;
}

/** Per-period and total net-vs-gross result for one manager. */
export interface NetGrossResult {
  /** Per-period gross simple returns (echoed input). */
  readonly grossReturns: readonly number[];
  /** Per-period net simple returns (after management, expenses and carry). */
  readonly netReturns: readonly number[];
  /** Total compounded gross return over the window. */
  readonly grossTotal: Decimal;
  /** Total compounded net return over the window. */
  readonly netTotal: Decimal;
  /** Per-period management + expense charge applied (fraction). */
  readonly periodFeeRate: number;
  /** Total carry crystallised over the window, as a fraction of starting capital. */
  readonly totalCarryFraction: Decimal;
}

/**
 * Build the net-of-fee return series for a manager.
 *
 * Each period the gross return is reduced by a pro-rated management + expense
 * charge (`(managementFee + fundExpenses) / periodsPerYear`). Carry is
 * crystallised at the end of every full year: the manager takes `carry` of the
 * gross profit of that year above the `hurdle`, charged against the year's net
 * compounded growth and amortised back into that year's final period. A simple
 * high-water-mark prevents charging carry until cumulative gross wealth exceeds
 * its prior peak.
 */
export function netGross(
  manager: Manager,
  options: ScorecardOptions = {},
): NetGrossResult {
  const periodsPerYear = options.periodsPerYear ?? 12;
  if (!Number.isInteger(periodsPerYear) || periodsPerYear < 1) {
    throw new ManagerError("periodsPerYear must be a positive integer");
  }
  const gross = manager.grossReturns.map((r, i) => num(r, `grossReturns[${i}]`));
  if (gross.length === 0) {
    throw new ManagerError("grossReturns must not be empty");
  }
  const mgmt = nonNegFraction(manager.fees.managementFee, "managementFee");
  const exp = nonNegFraction(manager.fees.fundExpenses, "fundExpenses");
  const carry = nonNegFraction(manager.fees.carry, "carry");
  const hurdle = nonNegFraction(manager.fees.hurdle ?? 0, "hurdle");

  const periodFeeRate = (mgmt + exp) / periodsPerYear;

  // First pass: net-of-management/expense series, and track gross & net wealth
  // so we can crystallise carry on profit at each year boundary.
  const net: number[] = new Array(gross.length);
  let grossWealth = new Decimal(1);
  let netWealth = new Decimal(1);
  let highWaterMark = new Decimal(1); // on gross wealth
  let yearStartGrossWealth = new Decimal(1);
  let totalCarry = new Decimal(0);

  for (let i = 0; i < gross.length; i++) {
    const g = gross[i];
    grossWealth = grossWealth.times(1 + g);
    const nbc = netBeforeCarry(g, periodFeeRate);
    netWealth = netWealth.times(1 + nbc);
    net[i] = nbc;

    const isYearEnd = (i + 1) % periodsPerYear === 0 || i === gross.length - 1;
    if (isYearEnd && carry > 0) {
      // Gross profit this year above the hurdle, only if above the high-water mark.
      const yearGrossGrowth = grossWealth.div(yearStartGrossWealth).minus(1);
      const periodsThisYear =
        i === gross.length - 1
          ? ((i % periodsPerYear) + 1)
          : periodsPerYear;
      const hurdleForYear = new Decimal(hurdle)
        .times(periodsThisYear)
        .div(periodsPerYear);
      const excessGrowth = yearGrossGrowth.minus(hurdleForYear);
      const aboveHwm = grossWealth.greaterThan(highWaterMark);
      if (excessGrowth.greaterThan(0) && aboveHwm) {
        // Carry charged on the year's excess gross profit, expressed against
        // net wealth and deducted from this (final) period's net return.
        const carryFraction = excessGrowth.times(carry);
        const carryAmount = netWealth.times(carryFraction);
        const newNetWealth = netWealth.minus(carryAmount);
        // Adjust this period's net return so compounding reflects the charge.
        const prevNetWealth = netWealth.div(1 + nbc);
        const adjustedNet = newNetWealth.div(prevNetWealth).minus(1);
        net[i] = adjustedNet.toNumber();
        netWealth = newNetWealth;
        totalCarry = totalCarry.plus(carryFraction);
        highWaterMark = grossWealth;
      } else if (aboveHwm) {
        highWaterMark = grossWealth;
      }
      yearStartGrossWealth = grossWealth;
    }
  }

  const grossTotal = grossWealth.minus(1);
  const netTotal = netWealth.minus(1);

  return {
    grossReturns: gross,
    netReturns: net,
    grossTotal,
    netTotal,
    periodFeeRate,
    totalCarryFraction: totalCarry,
  };
}

/** Fee-drag summary for one manager over the observed window. */
export interface FeeDragResult {
  /** Total compounded gross return. */
  readonly grossTotal: Decimal;
  /** Total compounded net return. */
  readonly netTotal: Decimal;
  /** Gross − net, in total-return points (the headline fee drag). */
  readonly drag: Decimal;
  /** Fraction of gross profit consumed by fees (0 when no gross profit). */
  readonly dragShareOfProfit: Decimal;
  /** Annual all-in management + expense rate (fraction). */
  readonly annualFeeRate: number;
}

/** Compute the fee drag for one manager from its net-vs-gross result. */
export function feeDrag(
  manager: Manager,
  options: ScorecardOptions = {},
): FeeDragResult {
  const ng = netGross(manager, options);
  const drag = ng.grossTotal.minus(ng.netTotal);
  const grossProfit = ng.grossTotal;
  const dragShareOfProfit = grossProfit.greaterThan(0)
    ? drag.div(grossProfit)
    : new Decimal(0);
  const annualFeeRate =
    nonNegFraction(manager.fees.managementFee, "managementFee") +
    nonNegFraction(manager.fees.fundExpenses, "fundExpenses");
  return {
    grossTotal: ng.grossTotal,
    netTotal: ng.netTotal,
    drag,
    dragShareOfProfit,
    annualFeeRate,
  };
}

/** Benchmark-relative metrics of a manager's **net** series. */
export interface RelativeResult {
  /** Compounded net portfolio return. */
  readonly netReturn: number;
  /** Compounded benchmark return. */
  readonly benchmarkReturn: number;
  /** Geometric excess (net − benchmark). */
  readonly excessReturn: number;
  /** Annualized tracking error of the active series. */
  readonly trackingError: number;
  /** Annualized information ratio. */
  readonly informationRatio: number;
  /** Beta of the net series to the benchmark. */
  readonly beta: number;
  /** Fraction of periods the net series beat the benchmark (hit rate). */
  readonly hitRate: number;
}

/** Compute benchmark-relative metrics for a manager's net series. */
export function relative(
  manager: Manager,
  options: ScorecardOptions = {},
): RelativeResult {
  const periodsPerYear = options.periodsPerYear ?? 12;
  const ng = netGross(manager, options);
  const net = ng.netReturns;
  const bench = manager.benchmarkReturns.map((r, i) =>
    num(r, `benchmarkReturns[${i}]`),
  );
  if (bench.length !== net.length) {
    throw new ManagerError(
      `benchmarkReturns must align with grossReturns; got ${bench.length} vs ${net.length}`,
    );
  }

  const netReturn = compoundReturn(net);
  const benchmarkReturn = compoundReturn(bench);
  const excessReturn = netReturn - benchmarkReturn;
  const te = trackingError(net, bench, { periodsPerYear });
  // Information ratio is undefined when tracking error is zero; report 0 then.
  let ir = 0;
  try {
    ir = informationRatio(net, bench, { periodsPerYear });
  } catch {
    ir = 0;
  }
  let b = 0;
  try {
    b = benchmarkBeta(net, bench);
  } catch {
    b = 0;
  }
  let beats = 0;
  for (let i = 0; i < net.length; i++) {
    if (net[i] > bench[i]) beats += 1;
  }
  const hitRate = net.length === 0 ? 0 : beats / net.length;

  return {
    netReturn,
    benchmarkReturn,
    excessReturn,
    trackingError: te,
    informationRatio: ir,
    beta: b,
    hitRate,
  };
}

/** The breakdown of how a composite score was assembled. */
export interface ScoreBreakdown {
  /** 0–100 sub-score for net excess return. */
  readonly excess: number;
  /** 0–100 sub-score for information ratio. */
  readonly infoRatio: number;
  /** 0–100 sub-score for fee efficiency. */
  readonly feeEfficiency: number;
  /** 0–100 sub-score for consistency (hit rate). */
  readonly consistency: number;
  /** Final weighted composite, 0–100. */
  readonly composite: number;
}

function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

/**
 * Map raw due-diligence metrics to a 0–100 composite score.
 *
 * Each sub-metric is squashed onto 0–100 with a transparent, monotone mapping
 * (no opaque ML), then blended by {@link ScoreWeights}. The mappings are chosen
 * so a "good" manager — beats benchmark net of fees, positive information
 * ratio, low fee drag, consistent — scores well above 50, and a poor one well
 * below.
 */
export function compositeScore(
  rel: RelativeResult,
  drag: FeeDragResult,
  weights: ScoreWeights = DEFAULT_SCORE_WEIGHTS,
): ScoreBreakdown {
  // Excess return: map [-20%, +20%] net excess linearly onto [0, 100].
  const excess = clamp01((rel.excessReturn + 0.2) / 0.4) * 100;
  // Information ratio: map [-1, +2] onto [0, 100] (IR of 1 ≈ 67, very strong).
  const infoRatio = clamp01((rel.informationRatio + 1) / 3) * 100;
  // Fee efficiency: 0% of profit lost to fees → 100; 50%+ lost → 0.
  const feeEfficiency =
    clamp01(1 - drag.dragShareOfProfit.toNumber() / 0.5) * 100;
  // Consistency: hit rate directly is already 0–1.
  const consistency = clamp01(rel.hitRate) * 100;

  const wSum =
    weights.excess +
    weights.infoRatio +
    weights.feeEfficiency +
    weights.consistency;
  if (wSum <= 0) {
    throw new ManagerError("score weights must sum to a positive number");
  }
  const composite =
    (excess * weights.excess +
      infoRatio * weights.infoRatio +
      feeEfficiency * weights.feeEfficiency +
      consistency * weights.consistency) /
    wSum;

  return { excess, infoRatio, feeEfficiency, consistency, composite };
}

/** The full scorecard for one manager. */
export interface ManagerScorecard {
  readonly id: string;
  readonly name: string;
  readonly strategy: string;
  readonly vintage: number;
  readonly aum: number;
  readonly fees: FeeTerms;
  /** Benchmark simple returns aligned to the return series (echoed for charting). */
  readonly benchmarkReturns: readonly number[];
  readonly netGross: NetGrossResult;
  readonly feeDrag: FeeDragResult;
  readonly relative: RelativeResult;
  readonly score: ScoreBreakdown;
}

/** Build the complete scorecard for a single manager. */
export function scoreManager(
  manager: Manager,
  options: ScorecardOptions = {},
): ManagerScorecard {
  const ng = netGross(manager, options);
  const fd = feeDrag(manager, options);
  const rel = relative(manager, options);
  const score = compositeScore(rel, fd, options.weights);
  return {
    id: manager.id,
    name: manager.name,
    strategy: manager.strategy,
    vintage: manager.vintage,
    aum: manager.aum,
    fees: manager.fees,
    benchmarkReturns: manager.benchmarkReturns,
    netGross: ng,
    feeDrag: fd,
    relative: rel,
    score,
  };
}

/** Score a roster of managers and return them ranked best-composite-first. */
export function scoreRoster(
  managers: readonly Manager[],
  options: ScorecardOptions = {},
): ManagerScorecard[] {
  const cards = managers.map((m) => scoreManager(m, options));
  return cards
    .slice()
    .sort((a, b) => b.score.composite - a.score.composite);
}
