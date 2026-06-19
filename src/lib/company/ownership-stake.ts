import * as z from "zod";

import { Id } from "../model/primitives";

/** The kind of party that can hold an ownership stake. */
export const OwnerType = z.enum(["person", "company"]);
export type OwnerType = z.infer<typeof OwnerType>;

/**
 * The class of equity/interest a stake represents. Kept deliberately small and
 * descriptive — this is a reporting model, not a cap-table engine.
 */
export const ShareClass = z.enum([
  "common",
  "preferred",
  "voting",
  "non_voting",
  "lp_interest",
  "gp_interest",
  "membership_interest",
  "other",
]);
export type ShareClass = z.infer<typeof ShareClass>;

/**
 * A percentage in the inclusive range [0, 100], stored as an exact decimal
 * string to avoid floating-point drift when ownership is summed across stakes.
 */
export const Percentage = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/, "percentage must be a non-negative decimal string")
  .refine((s) => Number(s) <= 100, "percentage must be <= 100");
export type Percentage = z.infer<typeof Percentage>;

/**
 * An ownership stake: a directed edge in the ownership graph from an owner
 * (a {@link Person} or another {@link Company}) to a company, carrying the
 * fraction of the company that owner holds.
 *
 * `ownerId` is interpreted against `ownerType`; the containing {@link Company}
 * is the entity being owned (the edge target), so a stake does not repeat it.
 *
 * READ-ONLY product: a stake records who owns how much; it never transfers
 * shares or money.
 */
export const OwnershipStake = z
  .object({
    /** Stable id for this stake. */
    id: Id,
    /** Whether the owner is a person or another company. */
    ownerType: OwnerType,
    /** Id of the owning {@link Person} or {@link Company}. */
    ownerId: Id,
    /** Fraction of the company owned, as a percentage in [0, 100]. */
    percentage: Percentage,
    /** Class of interest held. Defaults to common equity. */
    shareClass: ShareClass.default("common"),
    /**
     * Optional voting percentage, when it diverges from the economic
     * `percentage` (e.g. dual-class or non-voting interests). In [0, 100].
     */
    votingPercentage: Percentage.optional(),
    /** Optional free-text note (e.g. "held via nominee", "vesting"). */
    note: z.string().trim().max(2000).optional(),
  })
  .strict();
export type OwnershipStake = z.infer<typeof OwnershipStake>;
