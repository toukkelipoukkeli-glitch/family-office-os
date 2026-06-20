import type { AttributionInput } from "./attribution";
import type { MultiPeriodInput } from "./multiperiod";

/**
 * Deterministic, offline fixtures for performance attribution.
 *
 * A stylised family-office book split into five segments, benchmarked against a
 * static strategic policy mix. Hand-chosen so the active return, allocation,
 * selection and interaction effects are all non-trivial and individually
 * signed — the kind of book a CIO would actually want decomposed. Used by the
 * attribution engine tests (oracle) and the charted view.
 */

/** Single-period (one quarter) family-office attribution fixture. */
export const FAMILY_OFFICE_ATTRIBUTION: AttributionInput = {
  method: "BF",
  segments: [
    {
      id: "public-equity",
      label: "Public equity",
      portfolioWeight: 0.4,
      benchmarkWeight: 0.35,
      portfolioReturn: 0.06,
      benchmarkReturn: 0.05,
    },
    {
      id: "fixed-income",
      label: "Fixed income",
      portfolioWeight: 0.15,
      benchmarkWeight: 0.25,
      portfolioReturn: 0.01,
      benchmarkReturn: 0.015,
    },
    {
      id: "private-equity",
      label: "Private equity",
      portfolioWeight: 0.2,
      benchmarkWeight: 0.15,
      portfolioReturn: 0.08,
      benchmarkReturn: 0.07,
    },
    {
      id: "real-assets",
      label: "Real assets",
      portfolioWeight: 0.15,
      benchmarkWeight: 0.15,
      portfolioReturn: 0.03,
      benchmarkReturn: 0.04,
    },
    {
      id: "cash",
      label: "Cash & equivalents",
      portfolioWeight: 0.1,
      benchmarkWeight: 0.1,
      portfolioReturn: 0.011,
      benchmarkReturn: 0.011,
    },
  ],
};

/**
 * A four-quarter horizon over the same five segments, so the multi-period
 * Carino linking can be exercised. Weights drift quarter to quarter as the book
 * is (notionally) rebalanced; returns vary in sign so the smoothing matters.
 */
export const FAMILY_OFFICE_MULTI_PERIOD: MultiPeriodInput = {
  method: "BF",
  periods: [
    {
      segments: [
        { id: "public-equity", label: "Public equity", portfolioWeight: 0.4, benchmarkWeight: 0.35, portfolioReturn: 0.06, benchmarkReturn: 0.05 },
        { id: "fixed-income", label: "Fixed income", portfolioWeight: 0.15, benchmarkWeight: 0.25, portfolioReturn: 0.01, benchmarkReturn: 0.015 },
        { id: "private-equity", label: "Private equity", portfolioWeight: 0.2, benchmarkWeight: 0.15, portfolioReturn: 0.08, benchmarkReturn: 0.07 },
        { id: "real-assets", label: "Real assets", portfolioWeight: 0.15, benchmarkWeight: 0.15, portfolioReturn: 0.03, benchmarkReturn: 0.04 },
        { id: "cash", label: "Cash & equivalents", portfolioWeight: 0.1, benchmarkWeight: 0.1, portfolioReturn: 0.011, benchmarkReturn: 0.011 },
      ],
    },
    {
      segments: [
        { id: "public-equity", label: "Public equity", portfolioWeight: 0.38, benchmarkWeight: 0.35, portfolioReturn: -0.04, benchmarkReturn: -0.03 },
        { id: "fixed-income", label: "Fixed income", portfolioWeight: 0.17, benchmarkWeight: 0.25, portfolioReturn: 0.02, benchmarkReturn: 0.018 },
        { id: "private-equity", label: "Private equity", portfolioWeight: 0.2, benchmarkWeight: 0.15, portfolioReturn: 0.01, benchmarkReturn: 0.005 },
        { id: "real-assets", label: "Real assets", portfolioWeight: 0.15, benchmarkWeight: 0.15, portfolioReturn: 0.025, benchmarkReturn: 0.02 },
        { id: "cash", label: "Cash & equivalents", portfolioWeight: 0.1, benchmarkWeight: 0.1, portfolioReturn: 0.012, benchmarkReturn: 0.012 },
      ],
    },
    {
      segments: [
        { id: "public-equity", label: "Public equity", portfolioWeight: 0.42, benchmarkWeight: 0.35, portfolioReturn: 0.09, benchmarkReturn: 0.08 },
        { id: "fixed-income", label: "Fixed income", portfolioWeight: 0.13, benchmarkWeight: 0.25, portfolioReturn: 0.005, benchmarkReturn: 0.01 },
        { id: "private-equity", label: "Private equity", portfolioWeight: 0.2, benchmarkWeight: 0.15, portfolioReturn: 0.06, benchmarkReturn: 0.055 },
        { id: "real-assets", label: "Real assets", portfolioWeight: 0.15, benchmarkWeight: 0.15, portfolioReturn: 0.04, benchmarkReturn: 0.045 },
        { id: "cash", label: "Cash & equivalents", portfolioWeight: 0.1, benchmarkWeight: 0.1, portfolioReturn: 0.013, benchmarkReturn: 0.013 },
      ],
    },
    {
      segments: [
        { id: "public-equity", label: "Public equity", portfolioWeight: 0.4, benchmarkWeight: 0.35, portfolioReturn: 0.02, benchmarkReturn: 0.025 },
        { id: "fixed-income", label: "Fixed income", portfolioWeight: 0.15, benchmarkWeight: 0.25, portfolioReturn: 0.015, benchmarkReturn: 0.012 },
        { id: "private-equity", label: "Private equity", portfolioWeight: 0.2, benchmarkWeight: 0.15, portfolioReturn: 0.03, benchmarkReturn: 0.04 },
        { id: "real-assets", label: "Real assets", portfolioWeight: 0.15, benchmarkWeight: 0.15, portfolioReturn: 0.05, benchmarkReturn: 0.03 },
        { id: "cash", label: "Cash & equivalents", portfolioWeight: 0.1, benchmarkWeight: 0.1, portfolioReturn: 0.012, benchmarkReturn: 0.012 },
      ],
    },
  ],
};
