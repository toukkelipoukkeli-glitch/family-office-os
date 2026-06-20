/**
 * Deterministic, offline fixtures for m11-liquidity-coverage.
 *
 * A realistic single-family-office balance sheet under liquidity stress: three
 * tiers of liquid reserves (operating cash, a T-bill ladder, marketable
 * equities — each with its own stress haircut and settlement availability), a
 * household net-burn schedule, and an active private-markets sleeve still in its
 * drawdown phase whose committed-but-uncalled capital calls land inside the
 * horizon. Amounts are exact literals (USD) chosen so the headline coverage is
 * hand-computable in the tests. Fixed literals only — no live API. READ-ONLY: it
 * measures coverage, it moves nothing.
 */

import type { Commitment } from "@/lib/privatemarkets";

import type { LiquidityInput, ReserveTier } from "./engine";
import { callObligations, householdBurnObligations } from "./schedule";

/** First projected month of the coverage horizon. */
export const LIQUIDITY_START_PERIOD = "2024-07";

/** Length of the coverage horizon (24 months → 2024-07 … 2026-06). */
export const LIQUIDITY_HORIZON = 24;

/** Reserve currency for the seeded family. */
export const LIQUIDITY_CURRENCY = "USD";

/**
 * Liquid reserve tiers, deepest-quality first. Each carries a stress haircut
 * (value lost in a forced sale) and an availability month (settlement lag).
 *
 *   Operating cash:     2,000,000 × (1 − 0.00) = 2,000,000  (month 0)
 *   T-bill ladder:      3,000,000 × (1 − 0.02) = 2,940,000  (month 0)
 *   Marketable equity:  5,000,000 × (1 − 0.15) = 4,250,000  (month 1, T+settle)
 *   ─────────────────────────────────────────────────────────────────────
 *   Total deployable:                            9,190,000
 */
export const seededReserves: readonly ReserveTier[] = [
  {
    id: "cash",
    label: "Operating cash",
    balance: "2000000",
    haircut: "0",
    availableFromMonth: 0,
  },
  {
    id: "tbills",
    label: "T-bill ladder",
    balance: "3000000",
    haircut: "0.02",
    availableFromMonth: 0,
  },
  {
    id: "equities",
    label: "Marketable equities",
    balance: "5000000",
    haircut: "0.15",
    availableFromMonth: 1,
  },
];

/**
 * The household's active private-markets commitment, vintage 2024 — still in its
 * drawdown phase over the projection window. Three capital calls land inside the
 * horizon (2024-09, 2025-03, 2025-12) and one distribution (2026-03):
 *
 *   Calls in window:  1,000,000 + 1,500,000 + 1,200,000 = 3,700,000 (obligations)
 *   Dists in window:    800,000 (2026-03, no same-month call → not netted)
 */
export const seededCommitment: Commitment = {
  id: "pe-coverage-2024",
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

/** All commitments in the family's private-markets sleeve. */
export const seededCommitments: readonly Commitment[] = [seededCommitment];

/**
 * Household burn. A modest structural deficit: 70,000/mo of living + fixed
 * outflows against 55,000/mo of net recurring inflows leaves 15,000/mo of net
 * burn the family funds from reserves, plus a lumpy 250,000 annual outflow.
 */
const householdRecurringFlows = [
  {
    id: "income",
    label: "Net recurring income",
    category: "income",
    direction: "inflow" as const,
    amount: "55000",
    frequency: "monthly" as const,
  },
  {
    id: "living",
    label: "Living + fixed costs",
    category: "living",
    direction: "outflow" as const,
    amount: "70000",
    frequency: "monthly" as const,
  },
  {
    id: "annual-tax",
    label: "Annual tax true-up",
    category: "tax",
    direction: "outflow" as const,
    amount: "250000",
    frequency: "annual" as const,
    startMonth: 9,
  },
];

/** Per-month household net-burn obligations (PE flows excluded). */
export const seededBurnObligations = householdBurnObligations({
  openingBalance: 0,
  horizonMonths: LIQUIDITY_HORIZON,
  currency: LIQUIDITY_CURRENCY,
  startPeriod: LIQUIDITY_START_PERIOD,
  recurring: householdRecurringFlows,
});

/** Per-month PE capital-call obligations (same-month distributions netted). */
export const seededCallObligations = callObligations(seededCommitments, {
  startPeriod: LIQUIDITY_START_PERIOD,
  horizonMonths: LIQUIDITY_HORIZON,
});

/** The seeded liquidity-coverage projection input. */
export const seededLiquidityInput: LiquidityInput = {
  horizonMonths: LIQUIDITY_HORIZON,
  currency: LIQUIDITY_CURRENCY,
  startPeriod: LIQUIDITY_START_PERIOD,
  reserves: seededReserves,
  obligations: [...seededCallObligations, ...seededBurnObligations],
};
