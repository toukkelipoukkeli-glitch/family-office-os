/**
 * Charitable giving planner — the deterministic engine behind the philanthropy
 * page.
 *
 * A family office gives a lot, and *how* it gives changes the after-tax cost of
 * a gift dramatically. The two levers this module models:
 *
 *  - **Gifting appreciated assets in kind.** Donating long-term appreciated
 *    securities (instead of selling them and donating the cash) does two things
 *    at once: you take a charitable **income-tax deduction** for the asset's
 *    fair-market value, *and* you avoid the **capital-gains tax** you would have
 *    paid on the embedded gain. The combined benefit is what makes in-kind
 *    gifting the workhorse of strategic philanthropy.
 *
 *  - **Donor-advised funds (DAF) & multi-year plans.** A DAF lets a donor
 *    "bunch" several years of giving into one year — taking the deduction now,
 *    while the gifted assets are granted out to operating charities over time.
 *    Bunching matters because the charitable deduction is only worth taking if
 *    your itemized deductions clear the **standard deduction**; bunching pushes
 *    you over that threshold in the contribution year.
 *
 * Everything here is pure, deterministic and offline. Money is {@link Money}
 * (Decimal-backed) — never floating-point currency. This is a READ-ONLY product:
 * the module *models and reports* the tax economics of a gift; it never moves
 * money, transfers a security, or makes a grant.
 *
 * Simplifying tax assumptions (documented, not authoritative tax advice):
 *  - Long-term appreciated property donated to a public charity / DAF is
 *    deductible at fair-market value, subject to an AGI ceiling (default 30%).
 *  - Cash gifts are deductible up to a higher AGI ceiling (default 60%).
 *  - Amounts over the ceiling are not lost — they **carry forward** (up to a
 *    configurable number of years) and are absorbed by later-year headroom.
 *  - The deduction is only *useful* to the extent total itemized deductions
 *    exceed the standard deduction; the engine reports the marginal benefit
 *    against that baseline.
 */

import { Decimal } from "decimal.js";

import { Money, sumMoney } from "@/lib/money";

/** Thrown when giving-plan inputs are structurally invalid. */
export class GivingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GivingError";
  }
}

/** What kind of asset is being given — drives the tax treatment. */
export type GiftKind = "cash" | "appreciated";

/** Where the gift is directed. A DAF is treated like a public charity for AGI ceilings. */
export type Recipient = "public-charity" | "daf" | "private-foundation";

/** A single charitable gift in a plan year. */
export interface Gift {
  /** Stable id. */
  id: string;
  /** Human label, e.g. "Appreciated ACME stock". */
  label: string;
  /** Cash vs. appreciated property. */
  kind: GiftKind;
  /** Destination of the gift. */
  recipient: Recipient;
  /** Fair-market value of what is given. */
  fairMarketValue: Money;
  /**
   * Cost basis of the asset. Only meaningful for `appreciated` gifts; the
   * embedded gain = FMV − basis is what would have been taxed on a sale.
   * Ignored for cash gifts.
   */
  costBasis?: Money;
}

/** Tax assumptions used to value the benefit of a gift. */
export interface TaxProfile {
  /** Currency for all money in the plan. */
  currency: string;
  /** Adjusted gross income — sets the AGI deduction ceilings. */
  agi: Money;
  /** Marginal ordinary income-tax rate (e.g. 0.37). */
  ordinaryRate: number;
  /** Long-term capital-gains rate (e.g. 0.238 incl. NIIT). */
  capitalGainsRate: number;
  /** Itemized standard deduction baseline the gift deduction stacks on top of. */
  standardDeduction: Money;
  /**
   * Other itemized deductions the donor already has (SALT, mortgage interest,
   * …) before any charitable gift. Used to decide how much of the charitable
   * deduction clears the standard-deduction hurdle.
   */
  otherItemized?: Money;
  /** AGI ceiling for cash gifts to public charities/DAF (default 0.60). */
  cashAgiLimit?: number;
  /** AGI ceiling for appreciated property to public charities/DAF (default 0.30). */
  appreciatedAgiLimit?: number;
}

/** Per-gift tax economics. */
export interface GiftBenefit {
  giftId: string;
  label: string;
  kind: GiftKind;
  recipient: Recipient;
  /** Fair-market value given. */
  fairMarketValue: Money;
  /** Embedded long-term gain (FMV − basis); zero for cash. */
  embeddedGain: Money;
  /** Capital-gains tax avoided by gifting in kind rather than selling. */
  capitalGainsAvoided: Money;
  /**
   * The deductible amount this gift contributes (FMV, before any AGI ceiling is
   * applied at the plan level).
   */
  deductibleAmount: Money;
}

/** A multi-year plan: gifts grouped by year, sharing one tax profile. */
export interface GivingPlanYear {
  /** Calendar year, e.g. 2026. */
  year: number;
  /** Gifts made this year. */
  gifts: Gift[];
  /** Optional per-year AGI override (defaults to the plan-level profile AGI). */
  agi?: Money;
}

/** A complete multi-year giving plan. */
export interface GivingPlan {
  /** Human label, e.g. "Ursin Foundation 5-year plan". */
  name: string;
  /** Shared tax assumptions. */
  profile: TaxProfile;
  /** The years, in any order (the engine sorts them). */
  years: GivingPlanYear[];
  /** How many years an over-ceiling deduction may carry forward (default 5). */
  carryforwardYears?: number;
}

/** Year-level rollup after applying AGI ceilings and carryforward. */
export interface PlanYearResult {
  year: number;
  /** AGI used for this year. */
  agi: Money;
  /** Total fair-market value gifted this year. */
  gifted: Money;
  /** Capital-gains tax avoided across this year's in-kind gifts. */
  capitalGainsAvoided: Money;
  /**
   * Deduction actually usable this year = min(eligible, AGI ceiling), including
   * carryforward absorbed from prior years.
   */
  deductionUsed: Money;
  /** Deduction generated this year that exceeds the ceiling and carries forward. */
  carriedForward: Money;
  /**
   * Income-tax saved this year = marginal-useful deduction × ordinary rate. Only
   * the portion of the deduction above the standard-deduction hurdle is counted
   * as a *marginal* benefit.
   */
  incomeTaxSaved: Money;
  /** Total tax benefit this year = income tax saved + capital gains avoided. */
  totalBenefit: Money;
}

/** The full analysis of a giving plan. */
export interface GivingAnalysis {
  currency: string;
  /** Per-gift economics across the whole plan. */
  giftBenefits: GiftBenefit[];
  /** Per-year rollups, sorted by year. */
  yearResults: PlanYearResult[];
  /** Total fair-market value gifted across all years. */
  totalGifted: Money;
  /** Total capital-gains tax avoided across all in-kind gifts. */
  totalCapitalGainsAvoided: Money;
  /** Total income tax saved across all years. */
  totalIncomeTaxSaved: Money;
  /** Grand total tax benefit = income tax saved + capital gains avoided. */
  totalBenefit: Money;
  /**
   * After-tax net cost of the entire giving program:
   *   total gifted − total benefit.
   * The headline "what did this philanthropy actually cost me" number.
   */
  netCost: Money;
  /**
   * Deduction that went unused: amounts that aged past the carryforward window
   * before they could be absorbed, plus anything still sitting in carryforward
   * at the end of the plan horizon. Zero in a well-shaped plan.
   */
  unusedDeduction: Money;
}

function rate(value: number, name: string): Decimal {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new GivingError(`${name} must be a finite rate in [0, 1]`);
  }
  return new Decimal(value);
}

/** AGI ceiling fraction that applies to a given gift. */
function agiLimitFor(gift: Gift, profile: TaxProfile): Decimal {
  // Validate configurable ceilings: an out-of-range fraction would silently
  // corrupt every downstream deduction. rate() enforces a finite value in [0,1].
  const cash = rate(profile.cashAgiLimit ?? 0.6, "cashAgiLimit").toNumber();
  const appreciated = rate(
    profile.appreciatedAgiLimit ?? 0.3,
    "appreciatedAgiLimit",
  ).toNumber();
  // Private foundations get a lower ceiling for appreciated property (20%);
  // model that explicitly so foundation gifts don't over-deduct.
  if (gift.recipient === "private-foundation") {
    return gift.kind === "cash" ? new Decimal(0.3) : new Decimal(0.2);
  }
  return gift.kind === "cash" ? new Decimal(cash) : new Decimal(appreciated);
}

/**
 * Compute the per-gift tax economics for one gift: the embedded gain, the
 * capital-gains tax avoided by gifting in kind, and the deductible amount.
 */
export function giftBenefit(gift: Gift, profile: TaxProfile): GiftBenefit {
  const ccy = profile.currency;
  const fmv = gift.fairMarketValue;
  if (fmv.currency !== ccy) {
    throw new GivingError(
      `Gift ${gift.id} FMV currency ${fmv.currency} != plan currency ${ccy}`,
    );
  }
  if (fmv.isNegative()) {
    throw new GivingError(`Gift ${gift.id} FMV must not be negative`);
  }

  let embeddedGain = Money.zero(ccy);
  let capitalGainsAvoided = Money.zero(ccy);

  if (gift.kind === "appreciated") {
    const basis = gift.costBasis ?? Money.zero(ccy);
    if (basis.currency !== ccy) {
      throw new GivingError(
        `Gift ${gift.id} basis currency ${basis.currency} != plan currency ${ccy}`,
      );
    }
    // Gain cannot be negative for these purposes: a depreciated asset should be
    // sold (to realize the loss) and the cash donated, so we floor the gain at 0.
    const gainAmt = Decimal.max(fmv.amount.minus(basis.amount), new Decimal(0));
    embeddedGain = Money.of(gainAmt, ccy);
    capitalGainsAvoided = embeddedGain.times(
      rate(profile.capitalGainsRate, "capitalGainsRate"),
    );
  }

  return {
    giftId: gift.id,
    label: gift.label,
    kind: gift.kind,
    recipient: gift.recipient,
    fairMarketValue: fmv,
    embeddedGain,
    capitalGainsAvoided,
    // Deduction is at fair-market value (long-term appreciated property) or the
    // cash amount. The plan-level pass applies AGI ceilings & carryforward.
    deductibleAmount: fmv,
  };
}

/** Min of two same-currency amounts. */
function minMoney(a: Money, b: Money): Money {
  return a.compare(b) <= 0 ? a : b;
}

/** Max of two same-currency amounts. */
function maxMoney(a: Money, b: Money): Money {
  return a.compare(b) >= 0 ? a : b;
}

/**
 * Analyze a complete multi-year giving plan: per-gift economics, per-year
 * deduction usage under AGI ceilings with carryforward, capital-gains avoided,
 * income tax saved (above the standard-deduction hurdle) and the after-tax net
 * cost of the whole program.
 */
export function analyzeGivingPlan(plan: GivingPlan): GivingAnalysis {
  const { profile } = plan;
  const ccy = profile.currency;
  const ordinary = rate(profile.ordinaryRate, "ordinaryRate");
  const carryforwardYears = plan.carryforwardYears ?? 5;
  if (
    !Number.isInteger(carryforwardYears) ||
    carryforwardYears < 0 ||
    carryforwardYears > 20
  ) {
    throw new GivingError("carryforwardYears must be an integer in [0, 20]");
  }
  if (profile.standardDeduction.currency !== ccy) {
    throw new GivingError("standardDeduction currency mismatch");
  }

  const years = [...plan.years].sort((a, b) => a.year - b.year);
  const giftBenefits: GiftBenefit[] = [];

  // Carryforward buckets keyed by the year a deduction was generated, so we can
  // expire them once they age past the carryforward window. Each bucket also
  // remembers the AGI-limit fraction that applies to it, so a later year with
  // no gifts of its own still raises enough ceiling room to absorb the carry.
  const carry: { year: number; remaining: Money; limitFrac: Decimal }[] = [];
  // Deduction that aged past the carryforward window before it could be used.
  let expiredUnused = Money.zero(ccy);

  const yearResults: PlanYearResult[] = [];

  for (const py of years) {
    const agi = py.agi ?? profile.agi;
    if (agi.currency !== ccy) {
      throw new GivingError(`Year ${py.year} AGI currency mismatch`);
    }

    // Per-gift economics for this year.
    const benefits = py.gifts.map((g) => giftBenefit(g, profile));
    giftBenefits.push(...benefits);

    const gifted = sumMoney(
      benefits.map((b) => b.fairMarketValue),
      ccy,
    );
    const cgAvoided = sumMoney(
      benefits.map((b) => b.capitalGainsAvoided),
      ccy,
    );

    // Eligible deduction this year, before ceilings, is the new gifts' FMV.
    // The AGI ceiling that applies is gift-specific, so compute the headroom as
    // the *highest* applicable ceiling and cap each gift class within it. To
    // keep the model tractable and conservative, we apply the single highest
    // applicable AGI fraction across this year's gifts as the overall ceiling.
    // Expire carryforward older than the window before using it.
    for (const bucket of carry) {
      if (
        py.year - bucket.year > carryforwardYears &&
        bucket.remaining.isPositive()
      ) {
        expiredUnused = expiredUnused.plus(bucket.remaining);
        bucket.remaining = Money.zero(ccy);
      }
    }

    // The ceiling fraction must cover both this year's gifts and any still-live
    // carryforward we want to absorb, so take the max over both.
    let ceilingFrac = new Decimal(0);
    for (const g of py.gifts) {
      ceilingFrac = Decimal.max(ceilingFrac, agiLimitFor(g, profile));
    }
    for (const bucket of carry) {
      if (bucket.remaining.isPositive()) {
        ceilingFrac = Decimal.max(ceilingFrac, bucket.limitFrac);
      }
    }
    const ceiling = Money.of(agi.amount.times(ceilingFrac), ccy);

    // Absorb carryforward first (oldest first), then current-year gifts, up to
    // the ceiling. Anything beyond the ceiling carries forward.
    let room = ceiling;
    let deductionUsed = Money.zero(ccy);
    // Oldest first.
    carry.sort((a, b) => a.year - b.year);
    for (const bucket of carry) {
      if (room.amount.isZero() || !room.isPositive()) break;
      if (!bucket.remaining.isPositive()) continue;
      const use = minMoney(bucket.remaining, room);
      deductionUsed = deductionUsed.plus(use);
      bucket.remaining = bucket.remaining.minus(use);
      room = room.minus(use);
    }

    // Now current-year gifts.
    const remainingRoom = maxMoney(room, Money.zero(ccy));
    const currentUsed = minMoney(gifted, remainingRoom);
    deductionUsed = deductionUsed.plus(currentUsed);
    const carriedForward = gifted.minus(currentUsed);
    if (carriedForward.isPositive()) {
      // The carry inherits the most generous AGI fraction among this year's
      // gifts, so it can be absorbed under the same ceiling in a later year.
      let frac = new Decimal(0);
      for (const g of py.gifts) {
        frac = Decimal.max(frac, agiLimitFor(g, profile));
      }
      carry.push({ year: py.year, remaining: carriedForward, limitFrac: frac });
    }

    // Income tax saved: only the deduction *above the standard-deduction hurdle*
    // is a marginal benefit. The donor's other itemized deductions help clear
    // that hurdle first.
    const otherItemized = profile.otherItemized ?? Money.zero(ccy);
    const totalItemized = otherItemized.plus(deductionUsed);
    const aboveStandard = maxMoney(
      totalItemized.minus(profile.standardDeduction),
      Money.zero(ccy),
    );
    // The charitable deduction's marginal contribution above the hurdle is the
    // lesser of (deduction used) and (total itemized above standard).
    const usefulDeduction = minMoney(deductionUsed, aboveStandard);
    const incomeTaxSaved = usefulDeduction.times(ordinary);

    const totalBenefit = incomeTaxSaved.plus(cgAvoided);

    yearResults.push({
      year: py.year,
      agi,
      gifted,
      capitalGainsAvoided: cgAvoided,
      deductionUsed,
      carriedForward,
      incomeTaxSaved,
      totalBenefit,
    });
  }

  const totalGifted = sumMoney(
    yearResults.map((y) => y.gifted),
    ccy,
  );
  const totalCapitalGainsAvoided = sumMoney(
    yearResults.map((y) => y.capitalGainsAvoided),
    ccy,
  );
  const totalIncomeTaxSaved = sumMoney(
    yearResults.map((y) => y.incomeTaxSaved),
    ccy,
  );
  const totalBenefit = totalIncomeTaxSaved.plus(totalCapitalGainsAvoided);
  const netCost = totalGifted.minus(totalBenefit);

  // Unused = deduction that expired past the window, plus anything still sitting
  // in carryforward at the end of the plan horizon (it would expire later).
  const unusedDeduction = expiredUnused.plus(
    sumMoney(
      carry.map((c) => c.remaining),
      ccy,
    ),
  );

  return {
    currency: ccy,
    giftBenefits,
    yearResults,
    totalGifted,
    totalCapitalGainsAvoided,
    totalIncomeTaxSaved,
    totalBenefit,
    netCost,
    unusedDeduction,
  };
}

/**
 * Compare two strategies for the same dollar value of intended giving:
 * (a) sell the appreciated asset, pay capital-gains tax, donate the net cash;
 * vs (b) donate the appreciated asset in kind. Returns the extra benefit of
 * the in-kind route — the classic "why gift stock not cash" number.
 */
export interface InKindComparison {
  /** Capital-gains tax paid if sold first (route a). */
  capitalGainsIfSold: Money;
  /** Deduction under the sell-then-donate route (net cash). */
  cashRouteDeduction: Money;
  /** Deduction under the in-kind route (full FMV). */
  inKindDeduction: Money;
  /** Income tax saved difference (in-kind − cash route). */
  extraIncomeTaxSaved: Money;
  /** Total advantage of gifting in kind = CG avoided + extra deduction value. */
  inKindAdvantage: Money;
}

/**
 * Quantify the advantage of gifting a single appreciated asset in kind vs.
 * selling it and donating the after-tax proceeds.
 */
export function compareInKindVsCash(
  gift: Gift,
  profile: TaxProfile,
): InKindComparison {
  const ccy = profile.currency;
  if (gift.kind !== "appreciated") {
    throw new GivingError("compareInKindVsCash requires an appreciated gift");
  }
  const fmv = gift.fairMarketValue;
  if (fmv.currency !== ccy) {
    throw new GivingError(
      `Gift ${gift.id} FMV currency ${fmv.currency} != plan currency ${ccy}`,
    );
  }
  if (fmv.isNegative()) {
    throw new GivingError(`Gift ${gift.id} FMV must not be negative`);
  }
  const basis = gift.costBasis ?? Money.zero(ccy);
  if (basis.currency !== ccy) {
    throw new GivingError(
      `Gift ${gift.id} basis currency ${basis.currency} != plan currency ${ccy}`,
    );
  }
  const gainAmt = Decimal.max(fmv.amount.minus(basis.amount), new Decimal(0));
  const gain = Money.of(gainAmt, ccy);
  const cgRate = rate(profile.capitalGainsRate, "capitalGainsRate");
  const ordinary = rate(profile.ordinaryRate, "ordinaryRate");

  const capitalGainsIfSold = gain.times(cgRate);
  // Sell-then-donate: you can only donate the after-tax cash.
  const cashRouteDeduction = fmv.minus(capitalGainsIfSold);
  const inKindDeduction = fmv;

  const extraDeduction = inKindDeduction.minus(cashRouteDeduction);
  const extraIncomeTaxSaved = extraDeduction.times(ordinary);

  // In-kind advantage: you avoid the CG tax AND you deduct the full FMV. The
  // donor keeps the CG tax they would have paid, and the charity receives more.
  const inKindAdvantage = capitalGainsIfSold.plus(extraIncomeTaxSaved);

  return {
    capitalGainsIfSold,
    cashRouteDeduction,
    inKindDeduction,
    extraIncomeTaxSaved,
    inKindAdvantage,
  };
}

/** Format a coverage/efficiency ratio as a percent string, e.g. "0.42" → "42%". */
export function formatPct(value: Decimal | number): string {
  const d = value instanceof Decimal ? value : new Decimal(value);
  return `${d.times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0)}%`;
}

/**
 * Giving efficiency = total tax benefit / total gifted. How many cents of tax
 * benefit each dollar of giving generates. Returns a Decimal in [0, 1+].
 */
export function givingEfficiency(analysis: GivingAnalysis): Decimal {
  if (!analysis.totalGifted.isPositive()) return new Decimal(0);
  return analysis.totalBenefit.amount.div(analysis.totalGifted.amount);
}
