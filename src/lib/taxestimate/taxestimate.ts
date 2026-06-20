import { Decimal } from "decimal.js";

import { Money, sumMoney } from "../money";
import type { RealizedSummary } from "../taxlots";

/**
 * m9-tax-estimate — consolidated annual tax estimator for the read-only family
 * office OS.
 *
 * This module is the *oracle* behind the consolidated tax estimate. It rolls up
 * the year's tax-relevant facts that the rest of the OS already computes —
 *
 *  - **realized capital gains**, split short- vs long-term, from the tax-lot
 *    engine ({@link RealizedSummary} from `../taxlots`);
 *  - the **realized-loss benefit** from tax-loss harvesting (the *clean*,
 *    non-wash-sale losses you actually banked, which offset gains);
 *  - **ordinary income** (wages, interest, non-qualified dividends, …);
 *  - **deductible fees** (advisory / management fees that reduce taxable
 *    income where allowed) —
 *
 * — and applies a set of **configurable progressive rate brackets** to produce
 * a single estimated tax bill, with a full, auditable breakdown of how each
 * piece contributes.
 *
 * The hard part this engine gets right is the *interaction* between the pieces:
 *
 *  1. **Capital-loss netting (IRC §1211/§1212 shape).** Short-term losses first
 *     offset short-term gains and long-term losses first offset long-term
 *     gains; any net loss in one class then offsets net gain in the other.
 *     Harvested losses are folded in on the short-/long-term side they were
 *     realized on. A remaining *net capital loss* is deductible against
 *     ordinary income only up to an annual cap (default $3,000), with the rest
 *     carried forward.
 *  2. **Ordinary vs. preferential rates.** Net *short-term* capital gain is
 *     taxed at the ordinary brackets (stacked on top of ordinary income);
 *     net *long-term* capital gain gets its own preferential brackets.
 *  3. **Fee deductibility.** Deductible fees reduce ordinary taxable income
 *     (floored at zero — fees never create a refundable credit here).
 *
 * READ-ONLY product: this *estimates and explains* a tax bill from data the
 * user already has. It never files a return, moves money, or places a trade.
 * All money is exact {@link Money} / decimal.js — never floating-point currency
 * (see AGENTS.md).
 */

/** Thrown when tax-estimate inputs are structurally invalid. */
export class TaxEstimateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaxEstimateError";
  }
}

/**
 * One progressive tax bracket: income from {@link from} (inclusive) up to the
 * next bracket's `from` is taxed at {@link rate} (a fraction, 0.22 = 22%).
 * Brackets are supplied sorted ascending by `from`; the first bracket must
 * start at 0.
 */
export interface TaxBracket {
  /** Lower bound of the bracket in currency (inclusive). The first must be 0. */
  readonly from: Decimal.Value;
  /** Marginal rate applied within the bracket, as a fraction (0.22 = 22%). */
  readonly rate: Decimal.Value;
}

/**
 * A full rate schedule: the progressive {@link ordinary} brackets used for
 * ordinary income and short-term gains, the preferential {@link longTerm}
 * brackets used for net long-term capital gain, and the annual cap on net
 * capital loss deductible against ordinary income.
 */
export interface RateSchedule {
  /** Brackets for ordinary income + net short-term capital gain. */
  readonly ordinary: readonly TaxBracket[];
  /** Preferential brackets for net long-term capital gain. */
  readonly longTerm: readonly TaxBracket[];
  /**
   * Max net capital loss deductible against ordinary income in the year
   * (currency). The remainder carries forward. Defaults to 3000.
   */
  readonly capitalLossOrdinaryOffsetCap?: Decimal.Value;
}

/** The tax-relevant facts for one tax year, all in a single currency. */
export interface TaxYearInputs {
  /** Reporting currency (ISO-4217 style code). */
  readonly currency: string;
  /** The tax year (e.g. 2024), used only for labelling. */
  readonly year: number;
  /**
   * Realized capital-gain summary from the tax-lot engine. Its
   * `shortTermGain` / `longTermGain` are *net* of the lots already matched —
   * each may be negative (a realized loss).
   */
  readonly realized?: Pick<RealizedSummary, "shortTermGain" | "longTermGain">;
  /**
   * Additional realized losses banked via tax-loss harvesting that are NOT
   * already in {@link realized} — e.g. the clean (non-wash-sale) harvestable
   * loss the user chose to realize. Supplied as positive magnitudes; folded in
   * on the matching short-/long-term side.
   */
  readonly harvestedShortTermLoss?: Money;
  readonly harvestedLongTermLoss?: Money;
  /** Ordinary income for the year (wages, interest, non-qualified dividends). */
  readonly ordinaryIncome?: Money;
  /** Deductible advisory / management fees that reduce ordinary taxable income. */
  readonly deductibleFees?: Money;
}

/** The result of applying a bracket schedule to one taxable amount. */
export interface BracketTax {
  /** The taxable base the brackets were applied to. */
  readonly taxable: Money;
  /** Total tax owed on that base. */
  readonly tax: Money;
  /** Effective rate = tax / taxable (0 when taxable is 0). */
  readonly effectiveRate: Decimal;
  /** The marginal rate at the top of the taxable base (fraction). */
  readonly marginalRate: Decimal;
  /** Per-bracket detail. */
  readonly perBracket: readonly BracketSlice[];
}

/** Tax contributed by a single bracket slice. */
export interface BracketSlice {
  /** Bracket lower bound. */
  readonly from: Decimal;
  /** Marginal rate of this bracket (fraction). */
  readonly rate: Decimal;
  /** Amount of the base that fell into this bracket. */
  readonly amountInBracket: Money;
  /** Tax from this bracket = amountInBracket × rate. */
  readonly tax: Money;
}

/**
 * The consolidated estimate. Every field is exact {@link Money} (or an exact
 * {@link Decimal} fraction) so the breakdown reconciles to the cent.
 */
export interface TaxEstimate {
  readonly currency: string;
  readonly year: number;

  /** Net short-term capital gain after netting (negative = net ST loss). */
  readonly netShortTerm: Money;
  /** Net long-term capital gain after netting (negative = net LT loss). */
  readonly netLongTerm: Money;
  /**
   * Net short-term gain *taxed* this year (≥ 0). After cross-class netting,
   * a net ST loss is moved against LT gain, so this is the ST gain that
   * actually survives to be taxed at ordinary rates.
   */
  readonly taxableShortTermGain: Money;
  /** Net long-term gain *taxed* this year (≥ 0), after cross-class netting. */
  readonly taxableLongTermGain: Money;
  /**
   * Net capital loss remaining after netting both classes (positive
   * magnitude). Zero when the year is a net gain.
   */
  readonly netCapitalLoss: Money;
  /** Portion of the net capital loss deducted against ordinary income (≤ cap). */
  readonly capitalLossUsedAgainstOrdinary: Money;
  /** Net capital loss carried forward to future years (positive magnitude). */
  readonly capitalLossCarryforward: Money;

  /** Ordinary income before fee/loss deductions. */
  readonly ordinaryIncome: Money;
  /** Deductible fees applied against ordinary income. */
  readonly deductibleFees: Money;
  /**
   * Taxable ordinary income = ordinaryIncome − deductibleFees − capital-loss
   * offset, floored at 0. Short-term gains are taxed on top of this, not
   * folded into it.
   */
  readonly taxableOrdinaryIncome: Money;

  /** Tax on ordinary income (the base, before stacking ST gains). */
  readonly ordinaryIncomeTax: BracketTax;
  /**
   * Tax on the net short-term gain, computed as the marginal tax of stacking
   * the ST gain on top of taxable ordinary income (ordinary brackets).
   */
  readonly shortTermTax: BracketTax;
  /** Tax on the net long-term gain at the preferential brackets. */
  readonly longTermTax: BracketTax;

  /** Total estimated tax = ordinaryIncomeTax + shortTermTax + longTermTax. */
  readonly totalTax: Money;
  /**
   * Effective rate over total *taxable* income (taxable ordinary + ST gain +
   * LT gain). Zero when there is no taxable income.
   */
  readonly effectiveRate: Decimal;
}

function toMoney(value: Money | undefined, currency: string, label: string): Money {
  if (value === undefined) return Money.zero(currency);
  if (value.currency !== currency) {
    throw new TaxEstimateError(
      `${label} currency ${value.currency} does not match ${currency}`,
    );
  }
  return value;
}

function rate(value: Decimal.Value, label: string): Decimal {
  let d: Decimal;
  try {
    d = new Decimal(value);
  } catch {
    throw new TaxEstimateError(`Invalid ${label}: ${JSON.stringify(value)}`);
  }
  if (!d.isFinite()) throw new TaxEstimateError(`${label} must be finite`);
  if (d.isNegative()) throw new TaxEstimateError(`${label} must be non-negative`);
  return d;
}

/**
 * Validate a bracket list: non-empty, first bound at 0, strictly-increasing
 * bounds, non-negative rates. Returns the bounds/rates as exact Decimals.
 */
function normalizeBrackets(
  brackets: readonly TaxBracket[],
  label: string,
): { from: Decimal; rate: Decimal }[] {
  if (brackets.length === 0) {
    throw new TaxEstimateError(`${label} must have at least one bracket`);
  }
  const out = brackets.map((b, i) => ({
    from: rate(b.from, `${label}[${i}].from`),
    rate: rate(b.rate, `${label}[${i}].rate`),
  }));
  if (!out[0].from.isZero()) {
    throw new TaxEstimateError(`${label} first bracket must start at 0`);
  }
  for (let i = 1; i < out.length; i++) {
    if (!out[i].from.greaterThan(out[i - 1].from)) {
      throw new TaxEstimateError(
        `${label} bracket bounds must strictly increase (index ${i})`,
      );
    }
  }
  return out;
}

/**
 * Apply a progressive bracket schedule to a taxable base, optionally *stacked*
 * on top of a `floor` amount of other income that fills the lower brackets
 * first. This is how a short-term gain is taxed *on top of* ordinary income:
 * the gain occupies the marginal brackets above the ordinary income, not the
 * bottom brackets.
 *
 * Pure; returns a full per-bracket breakdown that reconciles exactly.
 */
export function applyBrackets(
  taxableBase: Money,
  brackets: readonly TaxBracket[],
  options: { floor?: Money; label?: string } = {},
): BracketTax {
  const currency = taxableBase.currency;
  const label = options.label ?? "brackets";
  const norm = normalizeBrackets(brackets, label);

  const taxable = taxableBase.isNegative()
    ? Money.zero(currency)
    : taxableBase;
  const floor =
    options.floor && options.floor.isPositive()
      ? options.floor
      : Money.zero(currency);

  // The base occupies the income band [floor, floor + taxable).
  const start = floor.amount;
  const end = floor.amount.plus(taxable.amount);

  const slices: BracketSlice[] = [];
  let marginalRate = norm[0].rate;
  for (let i = 0; i < norm.length; i++) {
    const lower = norm[i].from;
    const upper = i + 1 < norm.length ? norm[i + 1].from : null;
    // Overlap of [start, end) with this bracket [lower, upper).
    const segLow = Decimal.max(start, lower);
    const segHigh = upper === null ? end : Decimal.min(end, upper);
    const width = segHigh.minus(segLow);
    if (width.greaterThan(0)) {
      const amountInBracket = Money.of(width, currency);
      slices.push({
        from: lower,
        rate: norm[i].rate,
        amountInBracket,
        tax: Money.of(width.times(norm[i].rate), currency),
      });
      marginalRate = norm[i].rate;
    }
    if (upper !== null && end.lessThanOrEqualTo(upper)) break;
  }

  const tax = sumMoney(
    slices.map((s) => s.tax),
    currency,
  );
  const effectiveRate = taxable.isZero()
    ? new Decimal(0)
    : tax.amount.div(taxable.amount);

  return {
    taxable,
    tax,
    effectiveRate,
    marginalRate: taxable.isZero() ? new Decimal(0) : marginalRate,
    perBracket: slices,
  };
}

/**
 * Net the year's short- and long-term capital results following the IRC
 * §1211/§1212 *shape*:
 *
 *  1. Combine realized ST gain with any harvested ST loss → net ST.
 *  2. Combine realized LT gain with any harvested LT loss → net LT.
 *  3. If one class is a net loss and the other a net gain, the loss offsets
 *     the gain (cross-class netting).
 *
 * Returns the surviving taxable ST/LT gains (each ≥ 0) and the net capital
 * loss left over (≥ 0) for ordinary-income offset / carryforward.
 */
function netCapitalGains(inputs: TaxYearInputs): {
  netShortTerm: Money;
  netLongTerm: Money;
  taxableShortTermGain: Money;
  taxableLongTermGain: Money;
  netCapitalLoss: Money;
} {
  const ccy = inputs.currency;
  const realizedShort = inputs.realized
    ? toMoney(inputs.realized.shortTermGain, ccy, "realized.shortTermGain")
    : Money.zero(ccy);
  const realizedLong = inputs.realized
    ? toMoney(inputs.realized.longTermGain, ccy, "realized.longTermGain")
    : Money.zero(ccy);
  const harvestShort = toMoney(
    inputs.harvestedShortTermLoss,
    ccy,
    "harvestedShortTermLoss",
  );
  const harvestLong = toMoney(
    inputs.harvestedLongTermLoss,
    ccy,
    "harvestedLongTermLoss",
  );
  if (harvestShort.isNegative() || harvestLong.isNegative()) {
    throw new TaxEstimateError("harvested losses must be non-negative magnitudes");
  }

  // Harvested losses are positive magnitudes -> subtract from the gain side.
  let netShortTerm = realizedShort.minus(harvestShort);
  let netLongTerm = realizedLong.minus(harvestLong);

  // Cross-class netting: a net loss in one class offsets net gain in the other.
  if (netShortTerm.isNegative() && netLongTerm.isPositive()) {
    const applied = Money.of(
      Decimal.min(netShortTerm.amount.negated(), netLongTerm.amount),
      ccy,
    );
    netLongTerm = netLongTerm.minus(applied);
    netShortTerm = netShortTerm.plus(applied);
  } else if (netLongTerm.isNegative() && netShortTerm.isPositive()) {
    const applied = Money.of(
      Decimal.min(netLongTerm.amount.negated(), netShortTerm.amount),
      ccy,
    );
    netShortTerm = netShortTerm.minus(applied);
    netLongTerm = netLongTerm.plus(applied);
  }

  const taxableShortTermGain = netShortTerm.isPositive()
    ? netShortTerm
    : Money.zero(ccy);
  const taxableLongTermGain = netLongTerm.isPositive()
    ? netLongTerm
    : Money.zero(ccy);

  // Any class still negative after cross-netting is a residual capital loss.
  let netCapitalLoss = Money.zero(ccy);
  if (netShortTerm.isNegative()) {
    netCapitalLoss = netCapitalLoss.plus(netShortTerm.negated());
  }
  if (netLongTerm.isNegative()) {
    netCapitalLoss = netCapitalLoss.plus(netLongTerm.negated());
  }

  return {
    netShortTerm,
    netLongTerm,
    taxableShortTermGain,
    taxableLongTermGain,
    netCapitalLoss,
  };
}

/**
 * Build the consolidated annual tax estimate from one year's inputs and a rate
 * schedule.
 *
 * Pure and deterministic: given the same inputs and schedule it always returns
 * the same exact-decimal estimate. Throws {@link TaxEstimateError} on malformed
 * inputs (currency mismatch, invalid brackets, negative magnitudes).
 */
export function estimateTax(
  inputs: TaxYearInputs,
  schedule: RateSchedule,
): TaxEstimate {
  const ccy = inputs.currency;
  // Validate currency early by constructing a zero.
  Money.zero(ccy);

  const {
    netShortTerm,
    netLongTerm,
    taxableShortTermGain,
    taxableLongTermGain,
    netCapitalLoss,
  } = netCapitalGains(inputs);

  // Net capital loss offsets ordinary income up to the annual cap; the rest
  // carries forward.
  const cap = Money.of(
    rate(
      schedule.capitalLossOrdinaryOffsetCap ?? "3000",
      "capitalLossOrdinaryOffsetCap",
    ),
    ccy,
  );
  const capitalLossUsedAgainstOrdinary = Money.of(
    Decimal.min(netCapitalLoss.amount, cap.amount),
    ccy,
  );
  const capitalLossCarryforward = netCapitalLoss.minus(
    capitalLossUsedAgainstOrdinary,
  );

  const ordinaryIncome = toMoney(inputs.ordinaryIncome, ccy, "ordinaryIncome");
  const deductibleFees = toMoney(inputs.deductibleFees, ccy, "deductibleFees");
  if (ordinaryIncome.isNegative()) {
    throw new TaxEstimateError("ordinaryIncome must be non-negative");
  }
  if (deductibleFees.isNegative()) {
    throw new TaxEstimateError("deductibleFees must be non-negative");
  }

  // Taxable ordinary income = income − fees − capital-loss offset, floored at 0.
  let taxableOrdinaryIncome = ordinaryIncome
    .minus(deductibleFees)
    .minus(capitalLossUsedAgainstOrdinary);
  if (taxableOrdinaryIncome.isNegative()) {
    taxableOrdinaryIncome = Money.zero(ccy);
  }

  // Ordinary income tax (the base).
  const ordinaryIncomeTax = applyBrackets(
    taxableOrdinaryIncome,
    schedule.ordinary,
    { label: "ordinary" },
  );

  // Short-term gain is taxed at ordinary rates, *stacked* on top of taxable
  // ordinary income: its tax is the marginal tax of the band above ordinary.
  const shortTermTax = applyBrackets(taxableShortTermGain, schedule.ordinary, {
    floor: taxableOrdinaryIncome,
    label: "ordinary",
  });

  // Long-term gain at preferential brackets (stacked on top of ordinary income
  // + ST gain, the standard ordering).
  const longTermTax = applyBrackets(taxableLongTermGain, schedule.longTerm, {
    floor: taxableOrdinaryIncome.plus(taxableShortTermGain),
    label: "longTerm",
  });

  const totalTax = ordinaryIncomeTax.tax
    .plus(shortTermTax.tax)
    .plus(longTermTax.tax);

  const totalTaxable = taxableOrdinaryIncome
    .plus(taxableShortTermGain)
    .plus(taxableLongTermGain);
  const effectiveRate = totalTaxable.isZero()
    ? new Decimal(0)
    : totalTax.amount.div(totalTaxable.amount);

  return {
    currency: ccy,
    year: inputs.year,
    netShortTerm,
    netLongTerm,
    taxableShortTermGain,
    taxableLongTermGain,
    netCapitalLoss,
    capitalLossUsedAgainstOrdinary,
    capitalLossCarryforward,
    ordinaryIncome,
    deductibleFees,
    taxableOrdinaryIncome,
    ordinaryIncomeTax,
    shortTermTax,
    longTermTax,
    totalTax,
    effectiveRate,
  };
}
