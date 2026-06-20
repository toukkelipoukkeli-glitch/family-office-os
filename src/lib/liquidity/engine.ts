import { Decimal } from "decimal.js";

import { addMonths } from "@/lib/cashflow";

/**
 * m11-liquidity-coverage — Liquidity & capital-call coverage engine.
 *
 * Answers the single question a family office most fears getting wrong:
 *
 *   *"Can we fund our committed-but-uncalled private-equity capital calls AND
 *    our household burn over the horizon — WITHOUT being forced to sell our
 *    illiquid assets at a bad time?"*
 *
 * It folds three deterministic inputs onto one monthly grid:
 *
 *  - **Obligations** — dated PE capital calls (committed-but-uncalled, from the
 *    m9-pe-lifecycle ledger) plus the household's net cash burn (recurring
 *    inflows − outflows, from m9-cashflow). Each month's obligation is the cash
 *    the family must come up with that month.
 *  - **Liquid reserves by tier** — cash, T-bills, marketable securities, …, each
 *    with a **stress haircut** (how much value survives a forced sale) and an
 *    **availability lag** (how many months until the tier can actually be
 *    deployed). Distressed/illiquid sleeves are simply *excluded* — funding a
 *    call by selling them is exactly the failure this cockpit is designed to
 *    flag.
 *
 * From those it derives, month by month, the **available liquidity buffer**
 * (haircut reserves that have come online, minus obligations drawn so far), a
 * **coverage ratio** (buffer entering the month ÷ that month's obligation), a
 * **shortfall** when the buffer can't cover the month, and the **worst-case
 * month** (the tightest point on the horizon).
 *
 * Everything is exact ({@link Decimal}); nothing is floating-point currency.
 * Pure, deterministic, offline, and strictly READ-ONLY: it *measures* whether
 * the family can fund its calls — it never moves money or places a trade.
 */

const ZERO = new Decimal(0);
const ONE = new Decimal(1);

function toDecimal(value: Decimal.Value, context: string): Decimal {
  const dec = value instanceof Decimal ? value : new Decimal(value);
  if (!dec.isFinite()) {
    throw new Error(`liquidity: non-finite ${context}`);
  }
  return dec;
}

function assertNonNegativeInteger(value: number, context: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`liquidity: ${context} must be a non-negative integer`);
  }
  return value;
}

function assertPositiveInteger(value: number, context: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`liquidity: ${context} must be a positive integer`);
  }
  return value;
}

const ISO_MONTH = /^\d{4}-\d{2}$/;

function assertIsoMonth(period: string, context: string): string {
  if (!ISO_MONTH.test(period)) {
    throw new Error(
      `liquidity: ${context} must be ISO YYYY-MM, got ${JSON.stringify(period)}`,
    );
  }
  const month = Number(period.split("-")[1]);
  if (month < 1 || month > 12) {
    throw new Error(
      `liquidity: ${context} is not a real calendar month: ${JSON.stringify(period)}`,
    );
  }
  return period;
}

/**
 * A pool of liquid reserves the family can tap to fund obligations.
 *
 * `balance` is the gross face value. `haircut` is the fractional value *lost*
 * in a forced sale (0 = par, e.g. 0.02 for a 2 % T-bill spread, 0.15 for
 * marketable equities under stress); the deployable amount is
 * `balance × (1 − haircut)`. `availableFromMonth` is the 0-based month the tier
 * first becomes deployable (0 = immediately; a lock-up or settlement lag pushes
 * it out). Tiers you would never sell to fund a call simply don't belong here.
 */
export interface ReserveTier {
  /** Stable identifier. */
  readonly id: string;
  /** Human label, e.g. "Operating cash", "T-bill ladder". */
  readonly label: string;
  /** Gross balance (positive magnitude, reserve currency). */
  readonly balance: Decimal.Value;
  /**
   * Fractional value lost in a forced/stress sale, in `[0, 1)`. Deployable
   * value is `balance × (1 − haircut)`. Defaults to `0` (par).
   */
  readonly haircut?: Decimal.Value;
  /**
   * 0-based month index from which this tier becomes deployable. Defaults to
   * `0` (available immediately). Reserves coming online later cannot fund an
   * obligation that lands before them.
   */
  readonly availableFromMonth?: number;
}

/**
 * A single dated obligation — cash the family must fund in a given month.
 * `amount` is a positive magnitude. PE capital calls and the (positive) net
 * household burn both map onto this shape.
 */
export interface Obligation {
  readonly id: string;
  readonly label: string;
  /** Bucket, e.g. "pe-call", "household-burn". */
  readonly category: string;
  /** Positive magnitude due in {@link month}. */
  readonly amount: Decimal.Value;
  /** 0-based month the obligation falls due. */
  readonly month: number;
}

/** Inputs to {@link projectLiquidityCoverage}. */
export interface LiquidityInput {
  /** Number of months to project (positive integer). */
  readonly horizonMonths: number;
  /** 3-letter ISO currency code (carried through; not converted). */
  readonly currency: string;
  /**
   * ISO `YYYY-MM` of the first projected month. Labels only; the math is
   * offset-based. Defaults to `"2024-01"`.
   */
  readonly startPeriod?: string;
  /** Liquid reserve tiers available to fund obligations. */
  readonly reserves: readonly ReserveTier[];
  /** Dated obligations (PE calls + household burn) on the month grid. */
  readonly obligations: readonly Obligation[];
}

/** One month of the liquidity-coverage projection. All amounts are {@link Decimal}. */
export interface LiquidityMonth {
  /** 0-based month offset into the horizon. */
  readonly index: number;
  /** ISO `YYYY-MM` label for the month. */
  readonly period: string;
  /**
   * Haircut reserve value that has come online by the start of this month and
   * not yet been consumed — the buffer entering the month.
   */
  readonly availableLiquidity: Decimal;
  /** Total obligation amount falling due this month. */
  readonly obligation: Decimal;
  /**
   * Coverage ratio for this month = `availableLiquidity ÷ obligation`. `null`
   * when there is no obligation (coverage is undefined / not binding).
   */
  readonly coverageRatio: Decimal | null;
  /**
   * Amount of this month's obligation that the buffer cannot cover
   * (`max(obligation − availableLiquidity, 0)`). Zero when fully funded.
   */
  readonly shortfall: Decimal;
  /** Buffer carried into the next month (`availableLiquidity − obligation`, floored at 0). */
  readonly closingLiquidity: Decimal;
  /** True when this month's obligation is met in full from liquid reserves. */
  readonly covered: boolean;
}

/** Headline coverage stats for the whole horizon. */
export interface LiquiditySummary {
  /** Total haircut (deployable) reserve value across all tiers. */
  readonly totalLiquidity: Decimal;
  /** Total gross reserve value (pre-haircut). */
  readonly grossLiquidity: Decimal;
  /** Total obligations over the horizon. */
  readonly totalObligations: Decimal;
  /** Total PE capital calls over the horizon. */
  readonly totalCalls: Decimal;
  /** Total net household burn over the horizon (calls excluded). */
  readonly totalBurn: Decimal;
  /**
   * Horizon coverage ratio = `totalLiquidity ÷ totalObligations`. `null` when
   * there are no obligations.
   */
  readonly coverageRatio: Decimal | null;
  /**
   * The tightest month: the lowest monthly {@link LiquidityMonth.coverageRatio}
   * among months that actually have an obligation. `null` if no month has one.
   */
  readonly worstMonth: number | null;
  /** Coverage ratio in the {@link worstMonth} (mirrors that month). */
  readonly worstCoverageRatio: Decimal | null;
  /** First month index with a non-zero shortfall, or `null` if always covered. */
  readonly firstShortfallMonth: number | null;
  /** Sum of every month's shortfall over the horizon. */
  readonly totalShortfall: Decimal;
  /** True when every obligation across the horizon is fully funded from reserves. */
  readonly fullyCovered: boolean;
}

/** The full coverage projection: the monthly series plus summary stats. */
export interface LiquidityProjection {
  readonly currency: string;
  readonly months: readonly LiquidityMonth[];
  readonly summary: LiquiditySummary;
}

/** Deployable (haircut) value of a single reserve tier = `balance × (1 − haircut)`. */
export function deployableValue(tier: ReserveTier): Decimal {
  const balance = toDecimal(tier.balance, `reserve balance (${tier.id})`);
  if (balance.isNegative()) {
    throw new Error(`liquidity: reserve balance must be non-negative (${tier.id})`);
  }
  const haircut =
    tier.haircut === undefined ? ZERO : toDecimal(tier.haircut, `haircut (${tier.id})`);
  if (haircut.isNegative() || haircut.greaterThanOrEqualTo(ONE)) {
    throw new Error(
      `liquidity: haircut must be in [0, 1) (${tier.id}), got ${haircut.toFixed()}`,
    );
  }
  return balance.times(ONE.minus(haircut));
}

/**
 * Project month-by-month liquidity coverage of a family's obligations from its
 * liquid reserve tiers.
 *
 * The model is a *running buffer*: reserves come online on their availability
 * month and accumulate into a deployable buffer; each month's obligation draws
 * the buffer down first-in. A month is **covered** when the buffer entering it
 * is at least the obligation due; otherwise the unmet part is that month's
 * **shortfall** and the buffer floors at zero (you cannot fund a call with cash
 * you do not have — illiquids are out of scope by construction). The **worst
 * month** is the lowest monthly coverage ratio among months that have an
 * obligation.
 *
 * Pure and deterministic — same input always yields the same series.
 */
export function projectLiquidityCoverage(input: LiquidityInput): LiquidityProjection {
  const horizon = assertPositiveInteger(input.horizonMonths, "horizonMonths");
  const startPeriod = assertIsoMonth(input.startPeriod ?? "2024-01", "startPeriod");

  // Pre-compute, per month, how much fresh deployable liquidity comes online.
  const inflowByMonth: Decimal[] = Array.from({ length: horizon }, () => ZERO);
  let grossLiquidity = ZERO;
  let totalLiquidity = ZERO;
  for (const tier of input.reserves) {
    const deployable = deployableValue(tier);
    grossLiquidity = grossLiquidity.plus(toDecimal(tier.balance, "reserve balance"));
    totalLiquidity = totalLiquidity.plus(deployable);
    const from = tier.availableFromMonth ?? 0;
    assertNonNegativeInteger(from, `availableFromMonth (${tier.id})`);
    // Reserves that come online after the horizon never help fund anything in
    // it; reserves online from month 0..horizon-1 land on that month's buffer.
    if (from < horizon) {
      inflowByMonth[from] = inflowByMonth[from].plus(deployable);
    }
  }

  // Bucket obligations by month, validating as we go.
  const obligationByMonth: Decimal[] = Array.from({ length: horizon }, () => ZERO);
  let totalObligations = ZERO;
  let totalCalls = ZERO;
  let totalBurn = ZERO;
  for (const ob of input.obligations) {
    const amount = toDecimal(ob.amount, `obligation amount (${ob.id})`);
    if (amount.isNegative()) {
      throw new Error(
        `liquidity: obligation amounts must be non-negative magnitudes (${ob.id})`,
      );
    }
    assertNonNegativeInteger(ob.month, `obligation month (${ob.id})`);
    if (ob.month >= horizon) continue; // outside the window — cannot bind
    obligationByMonth[ob.month] = obligationByMonth[ob.month].plus(amount);
    totalObligations = totalObligations.plus(amount);
    if (ob.category === "pe-call") totalCalls = totalCalls.plus(amount);
    else totalBurn = totalBurn.plus(amount);
  }

  const months: LiquidityMonth[] = [];
  let buffer = ZERO;
  let worstMonth: number | null = null;
  let worstCoverageRatio: Decimal | null = null;
  let firstShortfallMonth: number | null = null;
  let totalShortfall = ZERO;

  for (let index = 0; index < horizon; index++) {
    // New reserves come online at the start of the month, before obligations.
    buffer = buffer.plus(inflowByMonth[index]);
    const availableLiquidity = buffer;
    const obligation = obligationByMonth[index];

    const coverageRatio = obligation.isZero()
      ? null
      : availableLiquidity.div(obligation);
    const shortfall = Decimal.max(obligation.minus(availableLiquidity), ZERO);
    const closingLiquidity = Decimal.max(availableLiquidity.minus(obligation), ZERO);
    const covered = shortfall.isZero();

    months.push({
      index,
      period: addMonths(startPeriod, index),
      availableLiquidity,
      obligation,
      coverageRatio,
      shortfall,
      closingLiquidity,
      covered,
    });

    totalShortfall = totalShortfall.plus(shortfall);
    if (firstShortfallMonth === null && shortfall.greaterThan(ZERO)) {
      firstShortfallMonth = index;
    }
    if (coverageRatio !== null) {
      if (worstCoverageRatio === null || coverageRatio.lessThan(worstCoverageRatio)) {
        worstCoverageRatio = coverageRatio;
        worstMonth = index;
      }
    }

    buffer = closingLiquidity;
  }

  const summary: LiquiditySummary = {
    totalLiquidity,
    grossLiquidity,
    totalObligations,
    totalCalls,
    totalBurn,
    coverageRatio: totalObligations.isZero()
      ? null
      : totalLiquidity.div(totalObligations),
    worstMonth,
    worstCoverageRatio,
    firstShortfallMonth,
    totalShortfall,
    fullyCovered: totalShortfall.isZero(),
  };

  return { currency: input.currency, months, summary };
}

/**
 * Map a household cashflow's recurring + one-off flows to a single **net burn**
 * obligation per month: in a month where outflows exceed inflows, the family
 * must fund the gap from reserves, so that gap is an obligation. PE calls are
 * carried *separately* (so they can be tagged `pe-call`) and are therefore
 * excluded here — pass them via {@link callObligations}.
 *
 * `netOutByMonth[i]` is `max(outflows − inflows, 0)` for month `i`, already
 * computed by the caller from the cashflow projection (which nets recurring
 * flows but should have PE calls stripped out first).
 */
export function burnObligations(
  netOutByMonth: readonly Decimal.Value[],
): Obligation[] {
  const out: Obligation[] = [];
  netOutByMonth.forEach((value, month) => {
    const amount = toDecimal(value, `net burn (month ${month})`);
    if (amount.greaterThan(ZERO)) {
      out.push({
        id: `burn-${month}`,
        label: "Household net burn",
        category: "household-burn",
        amount,
        month,
      });
    }
  });
  return out;
}
