/**
 * Deterministic, offline fee fixtures for the m7-fees TCO engine.
 *
 * A realistic slice of what a family office actually pays across its book:
 * cheap index ETFs at the low end, an active equity fund, a hedge fund and a
 * private-equity fund with full "2-and-20" carry at the expensive end. Rates
 * are annual fractions (0.01 = 1%); carry is a fraction of profit above the
 * hurdle. Fixed literals — no live API. READ-ONLY: describes cost, moves
 * nothing.
 */

import type { FeeSchedule, Position } from "./fees";

/** Vanguard-style total-market index ETF: near-zero all-in cost, no carry. */
export const indexEtfSchedule: FeeSchedule = {
  id: "fee-index-etf",
  name: "Global Index ETF",
  category: "Passive equity",
  managementFee: "0.0003",
  fundExpenses: "0.0004",
  carry: "0",
};

/** Active large-cap equity mutual fund: a classic ~0.75% management fee. */
export const activeEquitySchedule: FeeSchedule = {
  id: "fee-active-equity",
  name: "Active Large-Cap Fund",
  category: "Active equity",
  managementFee: "0.0075",
  fundExpenses: "0.0015",
  carry: "0",
};

/** Core bond fund: low management fee, modest fund expenses. */
export const coreBondSchedule: FeeSchedule = {
  id: "fee-core-bond",
  name: "Core Bond Fund",
  category: "Fixed income",
  managementFee: "0.0035",
  fundExpenses: "0.0010",
  carry: "0",
};

/** Hedge fund: classic 1.5-and-15 with an 8% hurdle. */
export const hedgeFundSchedule: FeeSchedule = {
  id: "fee-hedge-fund",
  name: "Macro Hedge Fund",
  category: "Hedge fund",
  managementFee: "0.015",
  fundExpenses: "0.005",
  carry: "0.15",
  hurdle: "0.08",
};

/** Private-equity buyout fund: full 2-and-20 over an 8% hurdle. */
export const privateEquitySchedule: FeeSchedule = {
  id: "fee-private-equity",
  name: "Buyout PE Fund III",
  category: "Private equity",
  managementFee: "0.02",
  fundExpenses: "0.005",
  carry: "0.20",
  hurdle: "0.08",
};

/** All seeded fee schedules, cheapest-first. */
export const seededFeeSchedules: readonly FeeSchedule[] = [
  indexEtfSchedule,
  coreBondSchedule,
  activeEquitySchedule,
  hedgeFundSchedule,
  privateEquitySchedule,
];

/**
 * A seeded book of positions: the family's capital allocation across the five
 * vehicles, with an assumed gross return per strategy so realised carry is
 * meaningful. Amounts are plain currency units (USD).
 */
export const seededPositions: readonly Position[] = [
  { schedule: indexEtfSchedule, invested: "4000000", grossReturn: "0.08" },
  { schedule: coreBondSchedule, invested: "2500000", grossReturn: "0.04" },
  { schedule: activeEquitySchedule, invested: "1500000", grossReturn: "0.10" },
  { schedule: hedgeFundSchedule, invested: "1200000", grossReturn: "0.12" },
  { schedule: privateEquitySchedule, invested: "1800000", grossReturn: "0.18" },
];

/** Default horizon (years) for the seeded fee-drag projection. */
export const SEEDED_DRAG_HORIZON = 20;

/** Blended gross return assumed for the seeded book's fee-drag projection. */
export const SEEDED_DRAG_GROSS_RETURN = "0.08";
