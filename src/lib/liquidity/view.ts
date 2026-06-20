/**
 * Liquidity-coverage **view model**: turns a {@link LiquidityInput} into the
 * small, fully-deterministic, plain-`number` model the React page renders — a
 * monthly available-liquidity-vs-obligation series for the chart, a per-tier
 * reserve breakdown, headline coverage KPIs and a per-month table.
 *
 * Keeping every derivation here (and out of the components) gives the visuals a
 * machine-checkable test surface. Pure, deterministic, offline, READ-ONLY.
 */

import {
  deployableValue,
  projectLiquidityCoverage,
  type LiquidityInput,
} from "./engine";
import { seededLiquidityInput } from "./fixtures";

/** Headline coverage KPIs for the page (plain numbers). */
export interface LiquidityKpis {
  /** Total deployable (haircut) reserve value. */
  readonly totalLiquidity: number;
  /** Total gross reserve value (pre-haircut). */
  readonly grossLiquidity: number;
  /** Total obligations over the horizon. */
  readonly totalObligations: number;
  /** Total PE capital calls. */
  readonly totalCalls: number;
  /** Total net household burn. */
  readonly totalBurn: number;
  /** Horizon coverage ratio (deployable ÷ obligations), or null if no obligations. */
  readonly coverageRatio: number | null;
  /** Worst monthly coverage ratio, or null. */
  readonly worstCoverageRatio: number | null;
  /** ISO `YYYY-MM` of the worst-coverage month, or null. */
  readonly worstPeriod: string | null;
  /** ISO `YYYY-MM` of the first shortfall month, or null if always covered. */
  readonly firstShortfallPeriod: string | null;
  /** Total shortfall over the horizon. */
  readonly totalShortfall: number;
  /** True when every obligation is fully funded from reserves. */
  readonly fullyCovered: boolean;
}

/** One point on the monthly coverage chart / table. */
export interface LiquidityMonthView {
  readonly index: number;
  readonly period: string;
  readonly availableLiquidity: number;
  readonly obligation: number;
  /** Coverage ratio, or null when no obligation that month. */
  readonly coverageRatio: number | null;
  readonly shortfall: number;
  readonly closingLiquidity: number;
  readonly covered: boolean;
}

/** A per-tier reserve roll-up for the breakdown chart. */
export interface ReserveTierView {
  readonly id: string;
  readonly label: string;
  readonly gross: number;
  readonly deployable: number;
  /** Fractional haircut, in `[0, 1)`. */
  readonly haircut: number;
  /** 0-based month the tier becomes deployable. */
  readonly availableFromMonth: number;
}

/** The full plain-data model the liquidity page renders. */
export interface LiquidityModel {
  readonly currency: string;
  readonly kpis: LiquidityKpis;
  readonly months: readonly LiquidityMonthView[];
  readonly reserves: readonly ReserveTierView[];
}

/** Inputs to {@link buildLiquidityModel}; defaults to the seeded family. */
export interface LiquidityModelInput {
  readonly input?: LiquidityInput;
}

/**
 * Build the {@link LiquidityModel} from a coverage input. Defaults to the
 * seeded family. All money is reduced to plain `number` at the view edge.
 */
export function buildLiquidityModel(
  modelInput: LiquidityModelInput = {},
): LiquidityModel {
  const input = modelInput.input ?? seededLiquidityInput;
  const projection = projectLiquidityCoverage(input);
  const { months, summary } = projection;

  const worstPeriod =
    summary.worstMonth === null ? null : (months[summary.worstMonth]?.period ?? null);
  const firstShortfallPeriod =
    summary.firstShortfallMonth === null
      ? null
      : (months[summary.firstShortfallMonth]?.period ?? null);

  const kpis: LiquidityKpis = {
    totalLiquidity: summary.totalLiquidity.toNumber(),
    grossLiquidity: summary.grossLiquidity.toNumber(),
    totalObligations: summary.totalObligations.toNumber(),
    totalCalls: summary.totalCalls.toNumber(),
    totalBurn: summary.totalBurn.toNumber(),
    coverageRatio: summary.coverageRatio?.toNumber() ?? null,
    worstCoverageRatio: summary.worstCoverageRatio?.toNumber() ?? null,
    worstPeriod,
    firstShortfallPeriod,
    totalShortfall: summary.totalShortfall.toNumber(),
    fullyCovered: summary.fullyCovered,
  };

  const monthViews: LiquidityMonthView[] = months.map((m) => ({
    index: m.index,
    period: m.period,
    availableLiquidity: m.availableLiquidity.toNumber(),
    obligation: m.obligation.toNumber(),
    coverageRatio: m.coverageRatio?.toNumber() ?? null,
    shortfall: m.shortfall.toNumber(),
    closingLiquidity: m.closingLiquidity.toNumber(),
    covered: m.covered,
  }));

  const reserves: ReserveTierView[] = input.reserves.map((tier) => ({
    id: tier.id,
    label: tier.label,
    gross: Number(tier.balance),
    deployable: deployableValue(tier).toNumber(),
    haircut: tier.haircut === undefined ? 0 : Number(tier.haircut),
    availableFromMonth: tier.availableFromMonth ?? 0,
  }));

  return { currency: input.currency, kpis, months: monthViews, reserves };
}

/** The seeded liquidity model used by the page and its tests. */
export const seededLiquidityModel: LiquidityModel = buildLiquidityModel();
