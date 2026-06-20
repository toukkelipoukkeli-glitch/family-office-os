/**
 * Deterministic sample data for the charitable giving planner.
 *
 * A realistic family-office philanthropy scenario: a high-AGI principal who
 * "bunches" several years of giving into a donor-advised fund using highly
 * appreciated stock, then grants it out over the following years. The numbers
 * are chosen so the headline benefits are non-trivial and hand-checkable.
 */

import { Money } from "@/lib/money";

import type { GivingPlan, TaxProfile } from "./giving";

const USD = "USD";
const m = (v: string): Money => Money.of(v, USD);

/** Shared tax assumptions for the seeded plan. */
export const seededTaxProfile: TaxProfile = {
  currency: USD,
  agi: m("4000000"),
  ordinaryRate: 0.37,
  capitalGainsRate: 0.238, // 20% LTCG + 3.8% NIIT
  standardDeduction: m("29200"),
  otherItemized: m("100000"), // SALT cap + mortgage interest, etc.
  cashAgiLimit: 0.6,
  appreciatedAgiLimit: 0.3,
};

/**
 * A 4-year DAF "bunching" plan: a large appreciated-stock gift to a DAF in year
 * 1 (taking a big deduction now), modest cash top-ups, and direct gifts to
 * public charities in later years.
 */
export const seededGivingPlan: GivingPlan = {
  name: "Ursin Family — 4-year DAF bunching plan",
  profile: seededTaxProfile,
  carryforwardYears: 5,
  years: [
    {
      year: 2026,
      gifts: [
        {
          id: "g-2026-acme",
          label: "ACME Corp — long-term appreciated stock",
          kind: "appreciated",
          recipient: "daf",
          fairMarketValue: m("1200000"),
          costBasis: m("200000"),
        },
        {
          id: "g-2026-cash",
          label: "Year-end cash gift",
          kind: "cash",
          recipient: "public-charity",
          fairMarketValue: m("50000"),
        },
      ],
    },
    {
      year: 2027,
      gifts: [
        {
          id: "g-2027-fund",
          label: "Index-fund lots — appreciated",
          kind: "appreciated",
          recipient: "public-charity",
          fairMarketValue: m("300000"),
          costBasis: m("120000"),
        },
      ],
    },
    {
      year: 2028,
      gifts: [
        {
          id: "g-2028-cash",
          label: "Operating support — cash",
          kind: "cash",
          recipient: "public-charity",
          fairMarketValue: m("150000"),
        },
      ],
    },
    {
      year: 2029,
      gifts: [
        {
          id: "g-2029-found",
          label: "Family foundation endowment — appreciated",
          kind: "appreciated",
          recipient: "private-foundation",
          fairMarketValue: m("400000"),
          costBasis: m("250000"),
        },
      ],
    },
  ],
};
