import { Decimal } from "decimal.js";
import * as z from "zod";

import { Money } from "../money";
import {
  CurrencyCode,
  Id,
  IsoDate,
  MoneySchema,
  NonNegativeMoneySchema,
} from "../model/primitives";

/**
 * Company profile data: the read-only financials, portfolio holdings, and key
 * people that hang off a {@link Company} node and are surfaced on its profile
 * card. These schemas are deliberately reporting-oriented — they model what a
 * family office wants to *see* about an entity, never an instruction to act.
 *
 * Money line items are stored as serialized {@link Money} values (an exact
 * decimal `amount` string + a `currency` code) so nothing here ever touches a
 * floating-point currency (see AGENTS.md).
 */

/**
 * A single fiscal year of headline financials for a company. All monetary
 * fields are serialized {@link Money} values in the company's reporting
 * currency. Signed fields (net income) may be negative; balance-sheet sizes
 * (assets, equity, cash, debt) and revenue are non-negative.
 */
export const CompanyFinancialYear = z
  .object({
    /** Fiscal year, e.g. 2024. */
    fiscalYear: z.number().int().gte(1900).lte(2200),
    /** Total revenue / turnover for the year. */
    revenue: NonNegativeMoneySchema,
    /** Earnings before interest, tax, depreciation and amortization. */
    ebitda: MoneySchema,
    /** Bottom-line net income (may be negative). */
    netIncome: MoneySchema,
    /** Total assets at year end. */
    totalAssets: NonNegativeMoneySchema,
    /** Total shareholders' equity at year end (may be negative). */
    totalEquity: MoneySchema,
    /** Cash and cash equivalents at year end. */
    cash: NonNegativeMoneySchema,
    /** Total interest-bearing debt at year end. */
    debt: NonNegativeMoneySchema,
    /** Optional reporting date the figures were drawn from. */
    asOf: IsoDate.optional(),
  })
  .strict();
export type CompanyFinancialYear = z.infer<typeof CompanyFinancialYear>;

/** The kind of asset a company-held position represents. */
export const HoldingKind = z.enum([
  "equity",
  "fund",
  "real_estate",
  "fixed_income",
  "cash",
  "private",
  "other",
]);
export type HoldingKind = z.infer<typeof HoldingKind>;

/**
 * A position held *by* the company on its own balance sheet (an investment,
 * property, or fund interest) — surfaced on the holdings card. This is a
 * reporting snapshot, not a tradeable line.
 */
export const CompanyHolding = z
  .object({
    /** Stable id for this holding. */
    id: Id,
    /** Display name, e.g. "Acme Corp" or "Helsinki office building". */
    name: z.string().trim().min(1, "holding name must not be empty"),
    /** Asset kind, used for grouping/legend. */
    kind: HoldingKind,
    /** Mark-to-market value of the position. */
    value: NonNegativeMoneySchema,
    /** Optional ticker / identifier. */
    ticker: z.string().trim().min(1).max(32).optional(),
  })
  .strict();
export type CompanyHolding = z.infer<typeof CompanyHolding>;

/** A person's role within the company, for the people card. */
export const PersonRole = z.enum([
  "director",
  "officer",
  "chair",
  "ceo",
  "cfo",
  "advisor",
  "shareholder",
  "other",
]);
export type PersonRole = z.infer<typeof PersonRole>;

/**
 * A key person attached to a company profile: a reference to a {@link Person}
 * by id, plus the role they hold at this company. Roles are descriptive; the
 * product never contacts these people (see AGENTS.md scope fence).
 */
export const CompanyPerson = z
  .object({
    /** Id of the referenced {@link Person}. */
    personId: Id,
    /** Role this person holds at the company. */
    role: PersonRole,
    /** Optional title override (e.g. "Group CFO"). */
    title: z.string().trim().min(1).max(120).optional(),
  })
  .strict();
export type CompanyPerson = z.infer<typeof CompanyPerson>;

/**
 * The full profile payload for a company: a reporting currency plus the three
 * card datasets (financials over time, holdings, people). Kept separate from
 * the core {@link Company} ownership node so the structural graph and the
 * reporting overlay can evolve independently.
 */
export const CompanyProfile = z
  .object({
    /** Id of the {@link Company} this profile describes. */
    companyId: Id,
    /** Reporting currency for the money figures on the cards. */
    reportingCurrency: CurrencyCode,
    /** Headline financials, one entry per fiscal year. */
    financials: z.array(CompanyFinancialYear).default([]),
    /** Positions held by the company. */
    holdings: z.array(CompanyHolding).default([]),
    /** Key people attached to the company. */
    people: z.array(CompanyPerson).default([]),
  })
  .strict()
  .superRefine((profile, ctx) => {
    const ccy = profile.reportingCurrency;

    /** Flag any money field whose currency differs from the reporting currency. */
    const assertReportingCurrency = (
      money: { currency: string },
      path: (string | number)[],
      field: string,
    ) => {
      if (money.currency !== ccy) {
        ctx.addIssue({
          code: "custom",
          message: `${field} currency ${money.currency} must match reporting currency ${ccy}`,
          path,
        });
      }
    };

    // Fiscal years must be unique, and every monetary field must be reported in
    // the profile's reporting currency (selectors below assume this and would
    // otherwise throw a currency-mismatch at runtime).
    const seenYear = new Set<number>();
    profile.financials.forEach((f, i) => {
      if (seenYear.has(f.fiscalYear)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate fiscal year: ${f.fiscalYear}`,
          path: ["financials", i, "fiscalYear"],
        });
      }
      seenYear.add(f.fiscalYear);

      const moneyFields = [
        "revenue",
        "ebitda",
        "netIncome",
        "totalAssets",
        "totalEquity",
        "cash",
        "debt",
      ] as const;
      moneyFields.forEach((field) => {
        assertReportingCurrency(f[field], ["financials", i, field], field);
      });
    });

    // Holding ids must be unique, and each holding's value must be in the
    // reporting currency.
    const seenHolding = new Set<string>();
    profile.holdings.forEach((h, i) => {
      if (seenHolding.has(h.id)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate holding id: ${h.id}`,
          path: ["holdings", i, "id"],
        });
      }
      seenHolding.add(h.id);
      assertReportingCurrency(h.value, ["holdings", i, "value"], "holding value");
    });

    // A person may appear at most once on a company's people list.
    const seenPerson = new Set<string>();
    profile.people.forEach((p, i) => {
      if (seenPerson.has(p.personId)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate person on profile: ${p.personId}`,
          path: ["people", i, "personId"],
        });
      }
      seenPerson.add(p.personId);
    });
  });
export type CompanyProfile = z.infer<typeof CompanyProfile>;

/** The most recent fiscal year in a profile, or undefined if none. */
export function latestFinancialYear(
  profile: CompanyProfile,
): CompanyFinancialYear | undefined {
  if (profile.financials.length === 0) return undefined;
  return profile.financials.reduce((latest, f) =>
    f.fiscalYear > latest.fiscalYear ? f : latest,
  );
}

/** Financial years sorted oldest → newest (a copy; input is untouched). */
export function financialsChronological(
  profile: CompanyProfile,
): CompanyFinancialYear[] {
  return [...profile.financials].sort((a, b) => a.fiscalYear - b.fiscalYear);
}

/**
 * Total mark-to-market value of all holdings, as a {@link Money}. Throws if a
 * holding's currency differs from the profile's reporting currency (the model
 * does not implicitly FX-convert; callers normalize upstream).
 */
export function totalHoldingsValue(profile: CompanyProfile): Money {
  return profile.holdings.reduce(
    (acc, h) => acc.plus(Money.of(h.value.amount, h.value.currency)),
    Money.zero(profile.reportingCurrency),
  );
}

/**
 * Each holding's share of the total holdings value, as a percentage in
 * [0, 100]. Returns `[]` when there are no holdings; returns weights of 0 when
 * the total is zero. The weight is computed with exact {@link Decimal} math (no
 * floating point) and only converted to a `number` at the final display
 * boundary; the shares sum to ~100.
 */
export function holdingWeights(
  profile: CompanyProfile,
): { id: string; name: string; kind: HoldingKind; weight: number }[] {
  const total = totalHoldingsValue(profile).amount;
  const isZeroTotal = total.isZero();
  return profile.holdings.map((h) => ({
    id: h.id,
    name: h.name,
    kind: h.kind,
    weight: isZeroTotal
      ? 0
      : new Decimal(h.value.amount).div(total).times(100).toNumber(),
  }));
}

/**
 * Net debt = total debt − cash for a fiscal year, as a {@link Money}. Negative
 * when the company holds more cash than debt (a net-cash position).
 */
export function netDebt(year: CompanyFinancialYear): Money {
  return Money.of(year.debt.amount, year.debt.currency).minus(
    Money.of(year.cash.amount, year.cash.currency),
  );
}
