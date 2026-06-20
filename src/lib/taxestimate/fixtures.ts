import { Money } from "../money";
import type { RateSchedule, TaxYearInputs } from "./taxestimate";

/**
 * Deterministic, offline fixtures for the m9 consolidated tax estimator.
 *
 * A US-2024-*shaped* single-filer rate schedule (rounded, illustrative — NOT
 * tax advice and not the exact statutory tables) plus a realistic family-office
 * tax year: a salary, a book of realized gains split short/long, a banked
 * harvested loss, and deductible advisory fees. Fixed literals — no live API.
 * READ-ONLY: this describes a tax picture, it files nothing and moves nothing.
 */

/** Reporting currency for all fixtures. */
export const FIXTURE_CURRENCY = "USD";

/**
 * Ordinary-income brackets, US-2024 single-filer *shape* (illustrative). Bounds
 * are the lower edge of each bracket in dollars; rates are fractions.
 */
export const usOrdinaryBrackets2024Single = [
  { from: "0", rate: "0.10" },
  { from: "11600", rate: "0.12" },
  { from: "47150", rate: "0.22" },
  { from: "100525", rate: "0.24" },
  { from: "191950", rate: "0.32" },
  { from: "243725", rate: "0.35" },
  { from: "609350", rate: "0.37" },
] as const;

/**
 * Long-term capital-gains brackets, US-2024 single-filer *shape*: 0% up to
 * ~$47,025, 15% to ~$518,900, then 20%.
 */
export const usLongTermBrackets2024Single = [
  { from: "0", rate: "0.00" },
  { from: "47025", rate: "0.15" },
  { from: "518900", rate: "0.20" },
] as const;

/** A complete sample rate schedule (US-2024 single-filer shape). */
export const sampleSchedule: RateSchedule = {
  ordinary: usOrdinaryBrackets2024Single,
  longTerm: usLongTermBrackets2024Single,
  capitalLossOrdinaryOffsetCap: "3000",
};

/**
 * A realistic tax year for a family-office principal:
 *
 *  - $180,000 ordinary income (salary + interest);
 *  - realized $40,000 short-term gain and $90,000 long-term gain from trading;
 *  - $12,000 of banked long-term harvested loss (clean, non-wash-sale);
 *  - $9,000 of deductible advisory fees.
 */
export const sampleInputs: TaxYearInputs = {
  currency: FIXTURE_CURRENCY,
  year: 2024,
  realized: {
    shortTermGain: Money.of("40000", FIXTURE_CURRENCY),
    longTermGain: Money.of("90000", FIXTURE_CURRENCY),
  },
  harvestedLongTermLoss: Money.of("12000", FIXTURE_CURRENCY),
  ordinaryIncome: Money.of("180000", FIXTURE_CURRENCY),
  deductibleFees: Money.of("9000", FIXTURE_CURRENCY),
};

/**
 * A loss-year fixture: modest income, a net capital loss large enough that the
 * $3,000 ordinary-offset cap bites and the rest carries forward.
 */
export const lossYearInputs: TaxYearInputs = {
  currency: FIXTURE_CURRENCY,
  year: 2024,
  realized: {
    shortTermGain: Money.of("-25000", FIXTURE_CURRENCY),
    longTermGain: Money.of("5000", FIXTURE_CURRENCY),
  },
  ordinaryIncome: Money.of("80000", FIXTURE_CURRENCY),
};
