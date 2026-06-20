/**
 * Deterministic, offline fixtures for the unified household tax timeline.
 *
 * A single seeded {@link TaxTimelineInputs} for the Ursin family's 2026
 * calendar year. It deliberately exercises ALL four composed engines:
 *
 *   - estimated tax  — a realistic high-income year with realized gains;
 *   - harvest        — a ledger with clean + wash-sale-blocked losses;
 *   - charitable     — the 2026 slice of the seeded DAF "bunching" plan;
 *   - estate         — the seeded Ursin succession plan (liquidity review).
 *
 * Every literal is pinned so a fixture change is a visible, intentional diff.
 *
 * READ-ONLY product: this only describes a hypothetical tax year.
 */

import { Money } from "@/lib/money";
import type { Ledger } from "@/lib/taxlots";
import type { RateSchedule, TaxYearInputs } from "@/lib/taxestimate";
import { seededGivingPlan } from "@/lib/giving";
import { seededEstatePlan } from "@/lib/estate";

import type { TaxTimelineInputs } from "./taxtimeline";

const USD = "USD";
const m = (v: string): Money => Money.of(v, USD);

/** The calendar year the seeded timeline covers. */
export const SEEDED_YEAR = 2026;

/** US-2026-shaped progressive brackets (single filer, illustrative). */
const ordinaryBrackets = [
  { from: "0", rate: "0.10" },
  { from: "11600", rate: "0.12" },
  { from: "47150", rate: "0.22" },
  { from: "100525", rate: "0.24" },
  { from: "191950", rate: "0.32" },
  { from: "243725", rate: "0.35" },
  { from: "609350", rate: "0.37" },
];

const longTermBrackets = [
  { from: "0", rate: "0.0" },
  { from: "47025", rate: "0.15" },
  { from: "518900", rate: "0.20" },
];

/** Rate schedule for the seeded timeline. */
export const seededSchedule: RateSchedule = {
  ordinary: ordinaryBrackets,
  longTerm: longTermBrackets,
  capitalLossOrdinaryOffsetCap: "3000",
};

/** Estimated-tax inputs: a high-income year with realized gains. */
export const seededTaxInputs: TaxYearInputs = {
  currency: USD,
  year: SEEDED_YEAR,
  realized: {
    shortTermGain: m("60000"),
    longTermGain: m("420000"),
  },
  harvestedLongTermLoss: m("18000"),
  ordinaryIncome: m("550000"),
  deductibleFees: m("40000"),
};

/**
 * Harvest ledger for the timeline year. One winner (kept), one clean loss
 * (TSLA) and two wash-sale-blocked losses (BABA add 12 days before the Dec-1
 * valuation date; META replacement 20 days after).
 */
export const seededHarvestLedger: Ledger = {
  currency: USD,
  acquisitions: [
    {
      id: "nvda-1",
      symbol: "NVDA",
      date: "2024-02-10",
      quantity: "100",
      cost: "25000",
      note: "NVDA core (winner — kept)",
    },
    {
      id: "tsla-1",
      symbol: "TSLA",
      date: "2026-01-05",
      quantity: "200",
      cost: "56000",
      note: "TSLA buy near the top",
    },
    {
      id: "baba-1",
      symbol: "BABA",
      date: "2024-08-01",
      quantity: "300",
      cost: "33000",
      note: "BABA core (underwater)",
    },
    {
      id: "baba-2",
      symbol: "BABA",
      date: "2026-11-19", // 12 days before asOf 2026-12-01 -> wash-sale
      quantity: "20",
      cost: "1600",
      note: "BABA dip add (triggers wash sale)",
    },
    {
      id: "meta-1",
      symbol: "META",
      date: "2026-02-15",
      quantity: "50",
      cost: "26000",
      note: "META buy (underwater)",
    },
    {
      id: "meta-2",
      symbol: "META",
      date: "2026-12-21", // 20 days after asOf -> wash-sale
      quantity: "10",
      cost: "4500",
      note: "META replacement buy (triggers wash sale)",
    },
  ],
  disposals: [],
};

/** Per-symbol valuation prices for the harvest scan. */
export const seededHarvestPrices: Record<string, string> = {
  NVDA: "900",
  TSLA: "175",
  BABA: "72",
  META: "470",
};

/**
 * The seeded unified-timeline inputs for the Ursin family's {@link SEEDED_YEAR}.
 * Reuses the philanthropy and estate fixtures verbatim so the timeline truly
 * *composes* the existing engines rather than forking their data.
 */
export const seededTimelineInputs: TaxTimelineInputs = {
  year: SEEDED_YEAR,
  currency: USD,
  taxEstimate: {
    inputs: seededTaxInputs,
    schedule: seededSchedule,
  },
  harvest: {
    ledger: seededHarvestLedger,
    prices: seededHarvestPrices,
    asOf: "2026-12-01",
  },
  giving: seededGivingPlan,
  estate: seededEstatePlan,
};
