/**
 * Fee & TCO **view model**: turns a book of positions into the small,
 * fully-deterministic, plain-`number` model the React page renders as KPIs, a
 * cost-by-fund bar chart, a fee-composition donut, and a fee-drag line chart.
 *
 * Keeping every derivation here (and out of the components) gives the visuals a
 * machine-checkable test surface. Pure, deterministic, offline, READ-ONLY.
 */

import {
  portfolioCost,
  projectFeeDrag,
  type PortfolioCost,
  type Position,
} from "./fees";
import {
  SEEDED_DRAG_GROSS_RETURN,
  SEEDED_DRAG_HORIZON,
  seededPositions,
} from "./fixtures";

/** Headline KPIs for the fee page (currency + fractions as plain numbers). */
export interface FeeKpis {
  /** Total capital invested across the book. */
  readonly totalInvested: number;
  /** Total all-in annual cost in currency. */
  readonly totalAnnualCost: number;
  /** Blended all-in expense ratio (fraction of invested). */
  readonly blendedRate: number;
  /** Fraction of long-run gross profit consumed by fees over the horizon. */
  readonly dragShareOfProfit: number;
}

/** A row in the per-fund cost table / bar chart. */
export interface FundCostRow {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly invested: number;
  readonly managementCost: number;
  readonly fundExpenseCost: number;
  readonly performanceCost: number;
  readonly totalCost: number;
  /** Effective all-in expense ratio for this fund (fraction). */
  readonly effectiveRate: number;
}

/** One slice of the fee-composition donut. */
export interface FeeCompositionSlice {
  readonly key: "management" | "fundExpenses" | "performance";
  readonly label: string;
  readonly value: number;
}

/** One point on the fee-drag line chart. */
export interface DragPoint {
  readonly year: number;
  readonly gross: number;
  readonly net: number;
  readonly drag: number;
}

/** The full plain-data model the fee page renders. */
export interface FeeModel {
  readonly kpis: FeeKpis;
  /** Per-fund cost rows, most expensive (by total cost) first. */
  readonly funds: readonly FundCostRow[];
  /** Fee composition by type, for the donut. */
  readonly composition: readonly FeeCompositionSlice[];
  /** Fee-drag projection series. */
  readonly drag: readonly DragPoint[];
  /** Horizon (years) of the drag projection. */
  readonly horizonYears: number;
  /** Terminal wealth lost to fees over the horizon, in currency. */
  readonly terminalDrag: number;
}

/** Inputs to {@link buildFeeModel}; everything has a seeded default. */
export interface FeeModelInput {
  readonly positions?: readonly Position[];
  readonly dragInitial?: number;
  readonly dragGrossReturn?: string | number;
  readonly horizonYears?: number;
}

function rowsFromCost(cost: PortfolioCost): FundCostRow[] {
  return cost.positions
    .map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      invested: p.invested.toNumber(),
      managementCost: p.managementCost.toNumber(),
      fundExpenseCost: p.fundExpenseCost.toNumber(),
      performanceCost: p.performanceCost.toNumber(),
      totalCost: p.totalCost.toNumber(),
      effectiveRate: p.effectiveRate.toNumber(),
    }))
    .sort((a, b) => b.totalCost - a.totalCost);
}

/**
 * Build the {@link FeeModel} from a book of positions and a drag projection.
 *
 * The fee-drag line uses the *blended* all-in rate of the whole book as the
 * annual fee, so the chart answers "what does my actual cost structure do to
 * compounded wealth over the horizon". Defaults to the seeded fixtures.
 */
export function buildFeeModel(input: FeeModelInput = {}): FeeModel {
  const positions = input.positions ?? seededPositions;
  const horizonYears = input.horizonYears ?? SEEDED_DRAG_HORIZON;
  const cost = portfolioCost(positions);

  const dragInitial = input.dragInitial ?? cost.totalInvested.toNumber();
  const dragGrossReturn = input.dragGrossReturn ?? SEEDED_DRAG_GROSS_RETURN;

  const drag = projectFeeDrag(
    dragInitial,
    dragGrossReturn,
    cost.blendedRate,
    horizonYears,
  );

  const kpis: FeeKpis = {
    totalInvested: cost.totalInvested.toNumber(),
    totalAnnualCost: cost.totalCost.toNumber(),
    blendedRate: cost.blendedRate.toNumber(),
    dragShareOfProfit: drag.dragShareOfProfit.toNumber(),
  };

  const composition: FeeCompositionSlice[] = [
    {
      key: "management",
      label: "Management",
      value: cost.totalManagement.toNumber(),
    },
    {
      key: "fundExpenses",
      label: "Fund expenses",
      value: cost.totalFundExpenses.toNumber(),
    },
    {
      key: "performance",
      label: "Performance / carry",
      value: cost.totalPerformance.toNumber(),
    },
  ];

  const dragPoints: DragPoint[] = drag.points.map((p) => ({
    year: p.year,
    gross: p.gross.toNumber(),
    net: p.net.toNumber(),
    drag: p.drag.toNumber(),
  }));

  return {
    kpis,
    funds: rowsFromCost(cost),
    composition,
    drag: dragPoints,
    horizonYears,
    terminalDrag: drag.totalDrag.toNumber(),
  };
}

/** The seeded fee model used by the page and its tests. */
export const seededFeeModel: FeeModel = buildFeeModel();
