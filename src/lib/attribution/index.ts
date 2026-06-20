/**
 * Performance attribution engine for a read-only family office OS.
 *
 *  - {@link attribute} — single-period Brinson attribution (allocation,
 *    selection, interaction) reconciling exactly to the active return. Supports
 *    Brinson-Hood-Beebower (BHB) and Brinson-Fachler (BF) conventions.
 *  - {@link multiPeriodAttribution} — Carino log-linking of single-period
 *    effects so they sum to the compounded active return.
 *
 * All amounts are {@link Decimal} values; nothing here moves money or trades.
 */
export {
  attribute,
  AttributionError,
  type AttributionMethod,
  type AttributionSegment,
  type AttributionInput,
  type SegmentEffect,
  type AttributionResult,
} from "./attribution";
export {
  multiPeriodAttribution,
  type MultiPeriodInput,
  type LinkedSegmentEffect,
  type MultiPeriodResult,
} from "./multiperiod";
export {
  FAMILY_OFFICE_ATTRIBUTION,
  FAMILY_OFFICE_MULTI_PERIOD,
} from "./fixtures";
