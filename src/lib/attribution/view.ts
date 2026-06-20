import { attribute, type AttributionInput, type AttributionResult } from "./attribution";

/**
 * Presentation view-model for the attribution page: flattens the {@link Decimal}
 * engine result into plain numbers (basis-points-friendly) for charting and
 * tabular display. Pure and deterministic — derived entirely from
 * {@link attribute}.
 */

export interface SegmentRow {
  id: string;
  label: string;
  portfolioWeight: number;
  benchmarkWeight: number;
  activeWeight: number;
  portfolioReturn: number;
  benchmarkReturn: number;
  allocation: number;
  selection: number;
  interaction: number;
  total: number;
}

export interface AttributionView {
  method: AttributionResult["method"];
  portfolioReturn: number;
  benchmarkReturn: number;
  activeReturn: number;
  totalAllocation: number;
  totalSelection: number;
  totalInteraction: number;
  totalEffect: number;
  segments: SegmentRow[];
}

/** Build the plain-number view-model from a single-period attribution input. */
export function buildAttributionView(input: AttributionInput): AttributionView {
  const r = attribute(input);
  return {
    method: r.method,
    portfolioReturn: r.portfolioReturn.toNumber(),
    benchmarkReturn: r.benchmarkReturn.toNumber(),
    activeReturn: r.activeReturn.toNumber(),
    totalAllocation: r.totalAllocation.toNumber(),
    totalSelection: r.totalSelection.toNumber(),
    totalInteraction: r.totalInteraction.toNumber(),
    totalEffect: r.totalEffect.toNumber(),
    segments: r.segments.map((s) => ({
      id: s.id,
      label: s.label,
      portfolioWeight: s.portfolioWeight.toNumber(),
      benchmarkWeight: s.benchmarkWeight.toNumber(),
      activeWeight: s.activeWeight.toNumber(),
      portfolioReturn: s.portfolioReturn.toNumber(),
      benchmarkReturn: s.benchmarkReturn.toNumber(),
      allocation: s.allocation.toNumber(),
      selection: s.selection.toNumber(),
      interaction: s.interaction.toNumber(),
      total: s.total.toNumber(),
    })),
  };
}
