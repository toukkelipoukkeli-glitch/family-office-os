/**
 * Deterministic, offline household cashflow fixtures for m9-cashflow.
 *
 * A realistic single-family-office household: salaried earner plus an investment
 * portfolio throwing off dividends, bond coupons and rental income, against
 * living expenses, quarterly estimated taxes and an annual advisory fee — laid
 * over a private-markets capital-call / distribution schedule expressed as an
 * m9-pe-lifecycle {@link Commitment} whose dated ledger lands inside the horizon.
 * Amounts are exact literals (USD) chosen so the headline projection is
 * hand-computable in the tests. Fixed literals only — no live API. READ-ONLY:
 * it projects cash, it moves nothing.
 */

import type { Commitment } from "@/lib/privatemarkets";

import type { CashflowInput, RecurringFlow } from "./engine";
import { peScheduleFlows } from "./pe-schedule";

/** First projected month of the household horizon. */
export const HOUSEHOLD_START_PERIOD = "2024-07";

/** Length of the household horizon (24 months → 2024-07 … 2026-06). */
export const HOUSEHOLD_HORIZON = 24;

/**
 * Recurring household flows. Monthly figures are net of withholding; the
 * quarterly tax line and annual advisory fee model the lumpier outflows the
 * household must keep cash on hand for.
 */
export const householdRecurring: readonly RecurringFlow[] = [
  // — Inflows —
  {
    id: "salary",
    label: "Salary (net)",
    category: "salary",
    direction: "inflow",
    amount: "45000",
    frequency: "monthly",
  },
  {
    id: "rent",
    label: "Rental income",
    category: "rent",
    direction: "inflow",
    amount: "12000",
    frequency: "monthly",
  },
  {
    id: "dividends",
    label: "Equity dividends",
    category: "dividends",
    direction: "inflow",
    amount: "30000",
    frequency: "quarterly",
  },
  {
    id: "coupons",
    label: "Bond coupons",
    category: "coupons",
    direction: "inflow",
    amount: "18000",
    frequency: "quarterly",
  },
  // — Outflows —
  {
    id: "living",
    label: "Living expenses",
    category: "living",
    direction: "outflow",
    amount: "38000",
    frequency: "monthly",
  },
  {
    id: "tax",
    label: "Estimated taxes",
    category: "tax",
    direction: "outflow",
    amount: "55000",
    frequency: "quarterly",
  },
  {
    id: "advisory-fee",
    label: "Advisory fee",
    category: "fees",
    direction: "outflow",
    amount: "60000",
    frequency: "annual",
  },
];

/**
 * The household's active private-markets commitment, vintage 2024 — still in its
 * drawdown phase over the projection window with one early distribution. Three
 * capital calls land inside the horizon (2024-09, 2025-03, 2025-12) and one
 * distribution (2026-03), so the schedule materially shapes household liquidity.
 *
 *   Calls in window:  1,000,000 + 1,500,000 + 1,200,000 = 3,700,000 (outflows)
 *   Dists in window:    800,000                                     (inflow)
 */
export const householdCommitment: Commitment = {
  id: "pe-household-2024",
  name: "Meridian Private Equity Fund I",
  strategy: "Buyout",
  committed: "6000000",
  vintageYear: 2024,
  currency: "USD",
  nav: "3900000",
  navDate: "2026-03-31",
  ledger: [
    { date: "2024-09-15", kind: "call", amount: "1000000", label: "Call #1" },
    { date: "2025-03-20", kind: "call", amount: "1500000", label: "Call #2" },
    { date: "2025-12-10", kind: "call", amount: "1200000", label: "Call #3" },
    {
      date: "2026-03-15",
      kind: "distribution",
      amount: "800000",
      label: "Early realization",
    },
  ],
};

/**
 * The PE call/distribution schedule for the household horizon, mapped onto the
 * projection's month grid from {@link householdCommitment}.
 */
export const householdPeFlows = peScheduleFlows(householdCommitment, {
  startPeriod: HOUSEHOLD_START_PERIOD,
  horizonMonths: HOUSEHOLD_HORIZON,
});

/** The seeded household cashflow projection input. */
export const seededCashflowInput: CashflowInput = {
  openingBalance: "4000000",
  horizonMonths: HOUSEHOLD_HORIZON,
  currency: "USD",
  startPeriod: HOUSEHOLD_START_PERIOD,
  recurring: householdRecurring,
  oneOff: householdPeFlows,
};
