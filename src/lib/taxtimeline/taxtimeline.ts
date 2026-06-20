/**
 * m11-tax-timeline — Unified household tax timeline.
 *
 * Sequences the family's tax-relevant actions across a single calendar year
 * into ONE ordered, deterministic timeline by *composing existing engines*
 * rather than re-deriving any tax logic:
 *
 *   - tax-loss harvesting candidates (wash-sale aware) → {@link findHarvestCandidates}
 *   - quarterly estimated-tax payments               → {@link estimateTax}
 *   - charitable gifting windows                      → {@link analyzeGivingPlan}
 *   - estate / liquidity actions                      → {@link analyzeEstate}
 *
 * The output is a flat, chronologically-sorted list of {@link TimelineEvent}s
 * with a stable tie-break, so the same inputs always produce byte-identical
 * output. Everything is pure, offline and {@link Money}/{@link Decimal}-backed.
 *
 * READ-ONLY product: this only *describes* and *schedules* — it never moves
 * money, places a trade, files a return or makes a grant.
 */

import { Decimal } from "decimal.js";

import {
  findHarvestCandidates,
  type HarvestReport,
} from "@/lib/harvest";
import type { Ledger } from "@/lib/taxlots";
import {
  estimateTax,
  type RateSchedule,
  type TaxEstimate,
  type TaxYearInputs,
} from "@/lib/taxestimate";
import {
  analyzeGivingPlan,
  type GivingAnalysis,
  type GivingPlan,
} from "@/lib/giving";
import {
  analyzeEstate,
  type EstateAnalysis,
  type EstatePlan,
} from "@/lib/estate";
import { Money } from "@/lib/money";

/** Error thrown for invalid timeline inputs. */
export class TaxTimelineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaxTimelineError";
  }
}

/**
 * The five categories an action can belong to. Drives colour/grouping in the
 * UI and the deterministic tie-break ordering for same-day events.
 */
export const TIMELINE_CATEGORIES = [
  "estimated-tax",
  "harvest",
  "charitable",
  "estate",
  "filing",
] as const;
export type TimelineCategory = (typeof TIMELINE_CATEGORIES)[number];

/** Human labels for each category. */
export const CATEGORY_LABELS: Record<TimelineCategory, string> = {
  "estimated-tax": "Estimated tax",
  harvest: "Tax-loss harvest",
  charitable: "Charitable giving",
  estate: "Estate & gifting",
  filing: "Filing & deadlines",
};

/**
 * Same-day ordering priority (lower = earlier). Deadlines that legally bind
 * sort before softer planning windows so a reader scanning a single day sees
 * the hard date first.
 */
const CATEGORY_PRIORITY: Record<TimelineCategory, number> = {
  filing: 0,
  "estimated-tax": 1,
  estate: 2,
  charitable: 3,
  harvest: 4,
};

/** How urgent / binding an action is. */
export type TimelineSeverity = "deadline" | "action" | "info";

/** One dated, tax-relevant action on the unified timeline. */
export interface TimelineEvent {
  /** Stable id, unique within a timeline. */
  id: string;
  /** ISO date (YYYY-MM-DD) the action is anchored to. */
  date: string;
  /** Which engine / domain produced it. */
  category: TimelineCategory;
  /** Short title. */
  title: string;
  /** One-line detail. */
  detail: string;
  /** Urgency. */
  severity: TimelineSeverity;
  /** Optional money amount associated with the action (already in plan ccy). */
  amount?: Money;
  /**
   * Optional inclusive window the action applies over (e.g. a wash-sale
   * blackout). When present, `date` is the window start.
   */
  windowEnd?: string;
}

/** A category roll-up for the timeline summary. */
export interface CategorySummary {
  category: TimelineCategory;
  /** Number of events in this category. */
  count: number;
  /** Sum of the `amount` fields present in this category (0 when none). */
  total: Money;
}

/** The full composed timeline. */
export interface TaxTimeline {
  currency: string;
  /** The calendar year the timeline covers. */
  year: number;
  /** All events, chronologically sorted with a stable tie-break. */
  events: TimelineEvent[];
  /** Per-category roll-ups in canonical category order. */
  byCategory: CategorySummary[];
  /** Count of hard deadlines (severity === "deadline"). */
  deadlineCount: number;
  /** The estimated total tax bill for the year (from the tax-estimate engine). */
  estimatedTax: Money;
  /** Each quarterly estimated payment (totalTax / 4, last quarter absorbs rounding). */
  quarterlyPayment: Money;
  /** Total clean (non-wash-sale) harvestable loss surfaced this year. */
  harvestableLoss: Money;
  /** Total charitable tax benefit modelled for the year. */
  charitableBenefit: Money;
}

/**
 * Inputs to {@link buildTaxTimeline}. Each sub-input is optional: omit a domain
 * and that engine simply contributes no events, so the timeline degrades
 * gracefully (e.g. a household with no estate plan yet still gets its tax,
 * harvest and giving dates).
 */
export interface TaxTimelineInputs {
  /** Calendar year, e.g. 2026. Drives every anchor date. */
  year: number;
  /** Reporting currency. Defaults to the first engine input's currency. */
  currency?: string;

  /** Quarterly estimated-tax inputs. */
  taxEstimate?: {
    inputs: TaxYearInputs;
    schedule: RateSchedule;
  };
  /** Tax-loss harvesting scan inputs. */
  harvest?: {
    ledger: Ledger;
    prices: Record<string, string>;
    /** Hypothetical harvest/valuation date (defaults to Dec 1 of `year`). */
    asOf?: string;
  };
  /** Charitable giving plan. */
  giving?: GivingPlan;
  /** Estate plan. */
  estate?: EstatePlan;
}

/* ------------------------------------------------------------------------- */
/* Date helpers                                                              */
/* ------------------------------------------------------------------------- */

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Build a YYYY-MM-DD string from a year and 1-based month/day. */
function iso(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Parse a YYYY-MM-DD date to a UTC epoch-day integer (for stable sorting). */
function epochDay(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** Shift an ISO date by a (possibly negative) number of days. */
function shiftDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const ms = Date.UTC(y, m - 1, d) + days * 86_400_000;
  const dt = new Date(ms);
  return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/**
 * US-style quarterly estimated-tax due dates for income earned in `year`.
 * Q1–Q3 are due in-year; Q4 is due Jan 15 of the *following* year. Pinned as
 * fixed literals (not weekend-adjusted) so the timeline is deterministic and
 * jurisdiction-agnostic enough for a planning view.
 */
function estimatedTaxDueDates(year: number): { label: string; date: string }[] {
  return [
    { label: "Q1", date: iso(year, 4, 15) },
    { label: "Q2", date: iso(year, 6, 15) },
    { label: "Q3", date: iso(year, 9, 15) },
    { label: "Q4", date: iso(year + 1, 1, 15) },
  ];
}

/* ------------------------------------------------------------------------- */
/* Builder                                                                   */
/* ------------------------------------------------------------------------- */

function resolveCurrency(inputs: TaxTimelineInputs): string {
  if (inputs.currency) return inputs.currency;
  if (inputs.taxEstimate) return inputs.taxEstimate.inputs.currency;
  if (inputs.giving) return inputs.giving.profile.currency;
  if (inputs.estate) return inputs.estate.currency;
  if (inputs.harvest) return inputs.harvest.ledger.currency;
  throw new TaxTimelineError(
    "cannot resolve currency: supply at least one engine input or set `currency`",
  );
}

/** Assert a Money is in the timeline currency. */
function sameCcy(m: Money, ccy: string, where: string): Money {
  if (m.currency !== ccy) {
    throw new TaxTimelineError(
      `currency mismatch in ${where}: ${m.currency} vs timeline ${ccy}`,
    );
  }
  return m;
}

/**
 * Split a total into 4 quarterly instalments. Quarters 1–3 are the floored
 * quarter; quarter 4 absorbs the rounding remainder so the four sum *exactly*
 * back to the total (no lost cents).
 */
function quarterlyInstalments(total: Money, ccy: string): Money[] {
  const each = Money.of(
    total.amount.dividedBy(4).toDecimalPlaces(2, Decimal.ROUND_DOWN),
    ccy,
  );
  const last = total.minus(each.times(3));
  return [each, each, each, last];
}

/**
 * Build the unified household tax timeline for one calendar year by composing
 * the existing harvest, tax-estimate, giving and estate engines. Pure and
 * deterministic: identical inputs always yield identical output.
 */
export function buildTaxTimeline(inputs: TaxTimelineInputs): TaxTimeline {
  if (!Number.isInteger(inputs.year)) {
    throw new TaxTimelineError("year must be an integer");
  }
  const { year } = inputs;
  const ccy = resolveCurrency(inputs);
  const zero = Money.zero(ccy);

  const events: TimelineEvent[] = [];

  let estimatedTax = zero;
  let quarterlyPayment = zero;
  let harvestableLoss = zero;
  let charitableBenefit = zero;

  // --- Estimated tax payments -------------------------------------------
  let taxEstimate: TaxEstimate | undefined;
  if (inputs.taxEstimate) {
    taxEstimate = estimateTax(
      inputs.taxEstimate.inputs,
      inputs.taxEstimate.schedule,
    );
    estimatedTax = sameCcy(taxEstimate.totalTax, ccy, "taxEstimate.totalTax");
    const instalments = quarterlyInstalments(estimatedTax, ccy);
    quarterlyPayment = instalments[0];
    const dueDates = estimatedTaxDueDates(year);
    dueDates.forEach((q, i) => {
      events.push({
        id: `tax-${q.label.toLowerCase()}`,
        date: q.date,
        category: "estimated-tax",
        title: `${q.label} estimated tax payment`,
        detail: `Quarterly instalment of the ${formatMoney(
          estimatedTax,
        )} estimated ${year} tax bill (${taxEstimate!.effectiveRate
          .times(100)
          .toDecimalPlaces(1)
          .toString()}% effective).`,
        severity: "deadline",
        amount: instalments[i],
      });
    });

    // The annual return filing deadline (Apr 15 of the following year).
    events.push({
      id: "filing-return",
      date: iso(year + 1, 4, 15),
      category: "filing",
      title: `File ${year} tax return`,
      detail: `Reconcile the ${formatMoney(
        estimatedTax,
      )} estimated bill against the final return.`,
      severity: "deadline",
    });
  }

  // --- Tax-loss harvesting ----------------------------------------------
  let harvestReport: HarvestReport | undefined;
  if (inputs.harvest) {
    const asOf = inputs.harvest.asOf ?? iso(year, 12, 1);
    harvestReport = findHarvestCandidates(inputs.harvest.ledger, {
      prices: inputs.harvest.prices,
      asOf,
    });
    harvestableLoss = sameCcy(
      harvestReport.cleanHarvestableLoss,
      ccy,
      "harvest.cleanHarvestableLoss",
    );

    // A single "harvest review" action on the valuation date.
    events.push({
      id: "harvest-review",
      date: asOf,
      category: "harvest",
      title: "Review harvest candidates",
      detail:
        harvestReport.candidates.length === 0
          ? "No underwater lots to harvest as of this date."
          : `${harvestReport.candidates.length} underwater lot(s); ${formatMoney(
              harvestReport.cleanHarvestableLoss,
            )} clean loss to bank, ${formatMoney(
              harvestReport.blockedHarvestableLoss,
            )} blocked by wash-sale rules.`,
      severity: "action",
      amount: harvestReport.cleanHarvestableLoss,
    });

    // One wash-sale blackout window per flagged candidate so the user can SEE
    // when they must not re-buy. The window is the ±30 days around `asOf`.
    for (const c of harvestReport.candidates) {
      if (!c.washSaleRisk) continue;
      events.push({
        id: `harvest-washsale-${c.lotId}`,
        date: shiftDays(asOf, -30),
        windowEnd: shiftDays(asOf, 30),
        category: "harvest",
        title: `Wash-sale blackout — ${c.symbol}`,
        detail: `Re-buying ${c.symbol} inside this ±30-day window disallows the ${formatMoney(
          c.harvestableLoss,
        )} loss.`,
        severity: "info",
        amount: c.harvestableLoss,
      });
    }
  }

  // --- Charitable giving -------------------------------------------------
  let givingAnalysis: GivingAnalysis | undefined;
  if (inputs.giving) {
    givingAnalysis = analyzeGivingPlan(inputs.giving);
    // Only the slice of the multi-year plan that falls in THIS calendar year
    // contributes events; the rest belongs to other years' timelines.
    const thisYear = givingAnalysis.yearResults.find((y) => y.year === year);
    if (thisYear) {
      charitableBenefit = sameCcy(
        thisYear.totalBenefit,
        ccy,
        "giving.totalBenefit",
      );

      // Each individual gift gets a planning action mid-year, anchored to a
      // stable date (Nov 15) so it sits before the year-end deadline.
      const gifts =
        inputs.giving.years.find((y) => y.year === year)?.gifts ?? [];
      for (const g of gifts) {
        events.push({
          id: `gift-${g.id}`,
          date: iso(year, 11, 15),
          category: "charitable",
          title: `Gift: ${g.label}`,
          detail: `${
            g.kind === "appreciated" ? "Appreciated-asset" : "Cash"
          } gift to ${g.recipient}.`,
          severity: "action",
          amount: sameCcy(
            g.fairMarketValue,
            ccy,
            `giving gift ${g.id} fairMarketValue`,
          ),
        });
      }

      // The hard year-end completion deadline for the year's gifting.
      events.push({
        id: "charitable-deadline",
        date: iso(year, 12, 31),
        category: "charitable",
        title: "Complete year-end gifting",
        detail: `Settle all ${year} charitable gifts to claim ${formatMoney(
          thisYear.totalBenefit,
        )} of tax benefit (${formatMoney(
          thisYear.capitalGainsAvoided,
        )} capital-gains avoided).`,
        severity: "deadline",
        amount: thisYear.deductionUsed,
      });
    }
  }

  // --- Estate & annual gifting ------------------------------------------
  let estateAnalysis: EstateAnalysis | undefined;
  if (inputs.estate) {
    estateAnalysis = analyzeEstate(inputs.estate);

    // Annual liquidity / settlement review — anchored to the start of the
    // year so the family revisits the funding waterfall once a year.
    events.push({
      id: "estate-review",
      date: iso(year, 1, 15),
      category: "estate",
      title: "Annual estate liquidity review",
      detail: estateAnalysis.covered
        ? `Settlement need of ${formatMoney(
            estateAnalysis.settlementNeed,
          )} is fully covered by liquid assets.`
        : `Liquidity SHORTFALL of ${formatMoney(
            estateAnalysis.shortfall,
          )} against a ${formatMoney(
            estateAnalysis.settlementNeed,
          )} settlement need — review funding.`,
      severity: estateAnalysis.covered ? "info" : "action",
      amount: estateAnalysis.settlementNeed,
    });

    // Year-end annual-exclusion gifting deadline (a classic estate action).
    events.push({
      id: "estate-annual-gifting",
      date: iso(year, 12, 31),
      category: "estate",
      title: "Annual-exclusion gifting deadline",
      detail: `Make any ${year} annual-exclusion gifts to heirs before year-end to shrink the taxable estate (${formatMoney(
        estateAnalysis.estateTax,
      )} projected estate tax).`,
      severity: "deadline",
    });
  }

  // --- Sort: chronological, then category priority, then id (all stable).
  events.sort((a, b) => {
    const da = epochDay(a.date);
    const db = epochDay(b.date);
    if (da !== db) return da - db;
    const pa = CATEGORY_PRIORITY[a.category];
    const pb = CATEGORY_PRIORITY[b.category];
    if (pa !== pb) return pa - pb;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  // --- Category roll-ups (canonical order). ------------------------------
  const byCategory: CategorySummary[] = TIMELINE_CATEGORIES.map((cat) => {
    const inCat = events.filter((e) => e.category === cat);
    const total = inCat.reduce(
      (acc, e) => (e.amount ? acc.plus(e.amount) : acc),
      zero,
    );
    return { category: cat, count: inCat.length, total };
  });

  const deadlineCount = events.filter((e) => e.severity === "deadline").length;

  return {
    currency: ccy,
    year,
    events,
    byCategory,
    deadlineCount,
    estimatedTax,
    quarterlyPayment,
    harvestableLoss,
    charitableBenefit,
  };
}

/** Whole-dollar currency formatting for event detail strings (deterministic). */
function formatMoney(m: Money): string {
  return m.format({ locale: "en-US", fractionDigits: 0 });
}
