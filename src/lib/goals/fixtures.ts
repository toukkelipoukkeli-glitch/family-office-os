/**
 * Deterministic, offline fixtures for the goal & liability funding engine.
 *
 * A single seeded {@link FundingPlan} for the Ursin family, pinned by exact
 * literals so a fixture change is a visible, intentional diff. The numbers are
 * hand-chosen so the engine produces a mix of funded, exactly-funded and
 * deliberately-short goals — exactly the spread the funding page exists to
 * surface.
 *
 *   Goal (USD target @ due)         dedicated now  growth  → at due      status
 *   --------------------------------------------------------------------------
 *   Hospital wing pledge   5,000,000 @ 3y   4,200,000  4%/yr → 4,724,608  SHORT
 *   School fees (twins)    1,200,000 @ 2y   1,200,000  0%/yr → 1,200,000  FUNDED
 *   Estate-tax reserve    12,000,000 @ 8y   6,000,000  5%/yr → 8,864,937  SHORT
 *   Spending floor        20,000,000 @ 1y  22,000,000  0%/yr →22,000,000  SURPLUS
 *   University endowment   3,000,000 @ 5y   2,000,000  6%/yr → 2,676,451  SHORT
 *
 * The spending floor is over-funded; everything else is short or exact, so the
 * portfolio has a real aggregate shortfall *and* a goal whose surplus must NOT
 * paper over the others (the capped-covered logic). READ-ONLY: this only
 * describes hypothetical obligations.
 */

import { Money } from "@/lib/money";

import type { FundingPlan } from "./goals";

const usd = (amount: string) => Money.of(amount, "USD");

/** The seeded Ursin family funding plan (base USD). */
export const seededFundingPlan: FundingPlan = {
  id: "funding-ursin-2026",
  name: "Ursin Family — 2026 goal funding",
  currency: "USD",
  goals: [
    {
      id: "g-pledge",
      name: "Hospital wing pledge",
      category: "philanthropy",
      target: usd("5000000"),
      dueYears: 3,
      priority: 2,
      dedicated: [
        {
          id: "d-pledge-escrow",
          name: "Pledge escrow account",
          value: usd("3200000"),
          growthRate: 0.04,
        },
        {
          id: "d-pledge-bonds",
          name: "Muni bond ladder",
          value: usd("1000000"),
          growthRate: 0.04,
        },
      ],
    },
    {
      id: "g-school",
      name: "School fees (twins)",
      category: "education",
      target: usd("1200000"),
      dueYears: 2,
      priority: 3,
      dedicated: [
        {
          id: "d-school-cash",
          name: "529 cash reserve",
          value: usd("1200000"),
          growthRate: 0,
        },
      ],
    },
    {
      id: "g-estate-tax",
      name: "Estate-tax reserve",
      category: "estate-tax",
      target: usd("12000000"),
      dueYears: 8,
      priority: 1,
      dedicated: [
        {
          id: "d-estate-life",
          name: "ILIT life-insurance sleeve",
          value: usd("4000000"),
          growthRate: 0.05,
        },
        {
          id: "d-estate-bonds",
          name: "Long-duration treasuries",
          value: usd("2000000"),
          growthRate: 0.05,
        },
      ],
    },
    {
      id: "g-spending",
      name: "Annual spending floor",
      category: "spending-floor",
      target: usd("20000000"),
      dueYears: 1,
      priority: 1,
      dedicated: [
        {
          id: "d-spending-tbills",
          name: "T-bill liquidity ladder",
          value: usd("22000000"),
          growthRate: 0,
        },
      ],
    },
    {
      id: "g-endowment",
      name: "University endowment gift",
      category: "philanthropy",
      target: usd("3000000"),
      dueYears: 5,
      priority: 4,
      dedicated: [
        {
          id: "d-endow-equity",
          name: "Donor-advised fund equity",
          value: usd("2000000"),
          growthRate: 0.06,
        },
      ],
    },
  ],
};
