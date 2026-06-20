/**
 * Deterministic, offline fixtures for the cashflow / liquidity-runway forecast.
 *
 * A realistic-but-synthetic family-office schedule: a liquid cash buffer, two
 * private-equity commitments drawing down over the year, recurring fund
 * distributions and property rent coming in, and the standing operating burn
 * (staff, office, advisory fees). The numbers are chosen so the runway is
 * non-trivial — the office dips toward (but in the base case survives) a tight
 * spot mid-year — which makes the chart and the runway KPI worth showing.
 */

import { Money } from "@/lib/money";
import type { CashflowForecastInput, FlowItem } from "./cashflow";

const USD = "USD";
const m = (major: string): Money => Money.of(major, USD);

/** The standing 12-month schedule for the family office. */
export const SAMPLE_FLOW_ITEMS: readonly FlowItem[] = [
  // --- Commitments (capital calls / drawdowns) ---
  {
    id: "pe-growth-iii",
    label: "Growth Fund III drawdown",
    kind: "commitment",
    frequency: "quarterly",
    amount: m("1200000"),
    start: 1,
  },
  {
    id: "re-opportunity-fund",
    label: "Real-estate Opportunity Fund call",
    kind: "commitment",
    frequency: "once",
    amount: m("2500000"),
    start: 4,
  },
  // --- Distributions (cash coming in) ---
  {
    id: "buyout-fund-ii-dist",
    label: "Buyout Fund II distribution",
    kind: "distribution",
    frequency: "quarterly",
    amount: m("900000"),
    start: 2,
  },
  {
    id: "property-rent",
    label: "Net property rent roll",
    kind: "distribution",
    frequency: "monthly",
    amount: m("180000"),
    start: 0,
  },
  {
    id: "bond-coupons",
    label: "Muni bond coupons",
    kind: "distribution",
    frequency: "annual",
    amount: m("420000"),
    start: 6,
  },
  // --- Operating expenses (burn) ---
  {
    id: "office-opex",
    label: "Office & staff operating cost",
    kind: "expense",
    frequency: "monthly",
    amount: m("260000"),
    start: 0,
  },
  {
    id: "advisory-fees",
    label: "Advisory & management fees",
    kind: "expense",
    frequency: "quarterly",
    amount: m("310000"),
    start: 0,
  },
];

/** The flagship base-case forecast input: 12 monthly periods, USD. */
export const SAMPLE_FORECAST_INPUT: CashflowForecastInput = {
  baseCurrency: USD,
  openingCash: m("8000000"),
  periods: 12,
  items: SAMPLE_FLOW_ITEMS,
};

/**
 * A deliberately tight scenario that *does* run out of runway: same schedule,
 * but a much thinner opening cash buffer. Used to exercise the depletion path
 * (runway exhausted, depletion period set).
 */
export const TIGHT_FORECAST_INPUT: CashflowForecastInput = {
  baseCurrency: USD,
  openingCash: m("900000"),
  periods: 12,
  items: SAMPLE_FLOW_ITEMS,
};
