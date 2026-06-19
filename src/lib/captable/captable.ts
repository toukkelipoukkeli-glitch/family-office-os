import * as z from "zod";

import { CurrencyCode, Id, IsoDate } from "../model/primitives";

/**
 * m5-captable — share-level cap table with dilution math.
 *
 * Where `src/lib/company` models *percentage* ownership for the reporting
 * graph, a cap table tracks the underlying **shares** so we can do exact
 * dilution math (issuing new shares, option pools, priced rounds). Share counts
 * are exact integers stored as strings, and all arithmetic runs through
 * decimal.js so we never lose precision (see AGENTS.md: never floating-point
 * currency, and the same care applies to share counts).
 *
 * READ-ONLY product: this models and reports ownership; it never issues real
 * shares, moves money, or executes a financing.
 */

/** The class of security a holding represents. */
export const SecurityClass = z.enum([
  "common",
  "preferred",
  "option",
  "warrant",
  "safe",
]);
export type SecurityClass = z.infer<typeof SecurityClass>;

/**
 * A whole, non-negative share count, stored as a digit string to keep large
 * counts exact (no floating-point, no `Number` rounding past 2^53).
 */
export const ShareCount = z
  .string()
  .trim()
  .regex(/^\d+$/, "share count must be a non-negative whole number");
export type ShareCount = z.infer<typeof ShareCount>;

/**
 * A single position on the cap table: a holder, the class of security, and how
 * many shares (or share-equivalents, for options) they hold.
 */
export const CapTableEntry = z
  .object({
    /** Stable id for this entry. */
    id: Id,
    /** Display name of the holder (e.g. "Touko Ursin", "Seed Pool"). */
    holder: z.string().trim().min(1, "holder must not be empty"),
    /** Class of security held. */
    securityClass: SecurityClass,
    /** Number of shares (share-equivalents for options/warrants). */
    shares: ShareCount,
    /** Optional date the holding was issued/granted. */
    since: IsoDate.optional(),
    /** Optional free-text note (e.g. "founder", "vesting 4y"). */
    note: z.string().trim().max(2000).optional(),
  })
  .strict();
export type CapTableEntry = z.infer<typeof CapTableEntry>;

/**
 * A cap table for a single company: its currency (for valuing rounds) and the
 * list of share holdings. Invariants enforced here:
 *
 *  - entry ids are unique;
 *  - at least one entry holds a positive number of shares (a cap table with
 *    zero shares outstanding is meaningless for ownership math).
 */
export const CapTable = z
  .object({
    /** Stable id of the company this cap table belongs to. */
    companyId: Id,
    /** Display name of the company. */
    companyName: z.string().trim().min(1, "company name must not be empty"),
    /** Reporting currency used when modelling priced rounds. */
    currency: CurrencyCode,
    /** All share holdings. */
    entries: z.array(CapTableEntry).default([]),
  })
  .strict()
  .superRefine((table, ctx) => {
    const seen = new Set<string>();
    table.entries.forEach((e, i) => {
      if (seen.has(e.id)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate cap table entry id: ${e.id}`,
          path: ["entries", i, "id"],
        });
      }
      seen.add(e.id);
    });

    const total = table.entries.reduce(
      (sum, e) => sum + BigInt(e.shares),
      0n,
    );
    if (total <= 0n) {
      ctx.addIssue({
        code: "custom",
        message: "cap table must have at least one share outstanding",
        path: ["entries"],
      });
    }
  });
export type CapTable = z.infer<typeof CapTable>;

/**
 * Description of a priced financing round used to compute dilution. A round
 * raises `investment` of new money at a `preMoneyValuation`, optionally topping
 * up an option pool to `optionPoolPercent` of the *post*-round fully diluted
 * shares (the standard "pool shuffle", carved out of existing holders).
 */
export const FinancingRound = z
  .object({
    /** Display name of the round (e.g. "Series A"). */
    name: z.string().trim().min(1, "round name must not be empty"),
    /** New money raised, as an exact decimal string in the table currency. */
    investment: z
      .string()
      .trim()
      .regex(/^\d+(\.\d+)?$/, "investment must be a non-negative decimal")
      .refine((s) => Number(s) > 0, "investment must be positive"),
    /** Pre-money valuation, as an exact decimal string in the table currency. */
    preMoneyValuation: z
      .string()
      .trim()
      .regex(/^\d+(\.\d+)?$/, "pre-money must be a non-negative decimal")
      .refine((s) => Number(s) > 0, "pre-money must be positive"),
    /**
     * Optional target option-pool size as a percent of post-round fully diluted
     * shares, in [0, 100). When set and larger than the current pool, fresh
     * pool shares are created pre-money (diluting existing holders).
     */
    optionPoolPercent: z
      .number()
      .min(0)
      .lt(100)
      .optional(),
  })
  .strict();
export type FinancingRound = z.infer<typeof FinancingRound>;
