import * as z from "zod";

import { AssetClass } from "../model/asset-class";
import {
  Id,
  IsoDate,
  NonNegativeMoneySchema,
} from "../model/primitives";
import { Contact } from "./contact";
import { Interaction } from "./interaction";

/**
 * Deal model: a prospective acquisition the family is evaluating, tracked
 * through a pipeline.
 *
 * READ-ONLY product: a {@link Deal} is a tracking record of the family's own
 * decision process about a *potential* purchase. It never executes a purchase,
 * moves money, or contacts a counterparty — advancing or "winning" a deal only
 * records that the family decided to.
 */

/**
 * The lifecycle status of a deal, independent of its specific pipeline stage.
 * `active` deals are in flight; `won` / `lost` / `abandoned` are terminal.
 */
export const DEAL_STATUSES = ["active", "won", "lost", "abandoned"] as const;
export const DealStatus = z.enum(DEAL_STATUSES);
export type DealStatus = z.infer<typeof DealStatus>;

/** Terminal statuses: a deal in one of these is closed and won't progress. */
export const TERMINAL_DEAL_STATUSES = new Set<DealStatus>([
  "won",
  "lost",
  "abandoned",
]);

/** True when a deal status is terminal (closed). */
export function isTerminalDealStatus(status: DealStatus): boolean {
  return TERMINAL_DEAL_STATUSES.has(status);
}

/**
 * A prospective deal.
 *
 * - `pipelineId` / `stageId` locate the deal in a {@link Pipeline}. Referential
 *   integrity against an actual pipeline is enforced where both are available
 *   (e.g. a selector), not by this leaf schema.
 * - `amount` is the indicative size of the opportunity (non-negative money).
 * - `probability` optionally overrides the stage's default close-probability.
 * - `contacts` and `interactions` are embedded; interaction `contactIds` must
 *   reference a contact on this deal (enforced below).
 */
export const Deal = z
  .object({
    /** Stable id for this deal. */
    id: Id,
    /** Human-readable name (e.g. "Project Acorn — forestry roll-up"). */
    name: z.string().trim().min(1, "deal name must not be empty"),
    /** Id of the pipeline this deal lives in. */
    pipelineId: Id,
    /** Id of the current stage within that pipeline. */
    stageId: Id,
    /** Lifecycle status. */
    status: DealStatus.default("active"),
    /** Optional asset class the deal would create a holding in. */
    assetClass: AssetClass.optional(),
    /** Indicative deal size (non-negative money). */
    amount: NonNegativeMoneySchema.optional(),
    /** Optional per-deal override of close-probability, in [0, 1]. */
    probability: z.number().min(0).max(1).optional(),
    /** Date the deal was first opened (YYYY-MM-DD). */
    openedOn: IsoDate,
    /** Optional expected / actual close date (YYYY-MM-DD). */
    expectedCloseOn: IsoDate.optional(),
    /** Embedded contacts for this deal. */
    contacts: z.array(Contact).default([]),
    /** Embedded interaction log for this deal. */
    interactions: z.array(Interaction).default([]),
    /** Optional free-text tags for grouping/filtering. */
    tags: z.array(z.string().trim().min(1)).default([]),
    /** Optional free-text note / thesis. */
    note: z.string().trim().max(10000).optional(),
  })
  .strict()
  .superRefine((deal, ctx) => {
    // Contact ids must be unique within a deal.
    const contactIds = new Set<string>();
    deal.contacts.forEach((c, i) => {
      if (contactIds.has(c.id)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate contact id: ${c.id}`,
          path: ["contacts", i, "id"],
        });
      }
      contactIds.add(c.id);
    });

    // Interaction ids must be unique, and every referenced contactId must
    // belong to this deal (cross-referential integrity).
    const interactionIds = new Set<string>();
    deal.interactions.forEach((it, i) => {
      if (interactionIds.has(it.id)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate interaction id: ${it.id}`,
          path: ["interactions", i, "id"],
        });
      }
      interactionIds.add(it.id);
      it.contactIds.forEach((cid, j) => {
        if (!contactIds.has(cid)) {
          ctx.addIssue({
            code: "custom",
            message: `interaction references unknown contact id: ${cid}`,
            path: ["interactions", i, "contactIds", j],
          });
        }
      });
    });

    // A terminal close date can't precede the open date.
    if (deal.expectedCloseOn && deal.expectedCloseOn < deal.openedOn) {
      ctx.addIssue({
        code: "custom",
        message: `expectedCloseOn (${deal.expectedCloseOn}) must not be before openedOn (${deal.openedOn})`,
        path: ["expectedCloseOn"],
      });
    }
  });
export type Deal = z.infer<typeof Deal>;
