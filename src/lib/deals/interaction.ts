import * as z from "zod";

import { Id, IsoDateTime } from "../model/primitives";

/**
 * Interaction model: a logged touchpoint with a contact about a deal.
 *
 * READ-ONLY product: an {@link Interaction} is an *after-the-fact record* of
 * something that already happened (a call took place, an email was received).
 * It never triggers an outbound action — logging a "email" interaction does
 * NOT send an email.
 */

/**
 * The channel of an interaction. `email` here means "an email was exchanged",
 * recorded for history — it is never an instruction to send one.
 */
export const INTERACTION_KINDS = [
  "note", // a free-text note / observation
  "call", // a phone call took place
  "meeting", // an in-person or video meeting took place
  "email", // an email was exchanged (recorded, never sent)
  "document", // a document was received / reviewed
] as const;

export const InteractionKind = z.enum(INTERACTION_KINDS);
export type InteractionKind = z.infer<typeof InteractionKind>;

/**
 * The direction of an interaction relative to the family. Optional because a
 * `note` typically has no direction.
 */
export const INTERACTION_DIRECTIONS = ["inbound", "outbound", "internal"] as const;
export const InteractionDirection = z.enum(INTERACTION_DIRECTIONS);
export type InteractionDirection = z.infer<typeof InteractionDirection>;

/**
 * A single logged touchpoint.
 *
 * - `occurredAt` is when the interaction happened (history, not the future).
 * - `contactIds` references the {@link Contact}s involved; cross-referential
 *   integrity (that these ids exist on the deal) is enforced at the Deal level.
 */
export const Interaction = z
  .object({
    /** Stable id for this interaction. */
    id: Id,
    /** Channel of the interaction. */
    kind: InteractionKind,
    /** When it happened (ISO-8601 timestamp). */
    occurredAt: IsoDateTime,
    /** Short summary / subject line. */
    summary: z.string().trim().min(1, "interaction summary must not be empty"),
    /** Optional longer body / notes. */
    body: z.string().trim().max(10000).optional(),
    /** Optional direction relative to the family. */
    direction: InteractionDirection.optional(),
    /** Ids of contacts involved in this interaction. */
    contactIds: z.array(Id).default([]),
  })
  .strict()
  .superRefine((interaction, ctx) => {
    const seen = new Set<string>();
    interaction.contactIds.forEach((cid, i) => {
      if (seen.has(cid)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate contact id in interaction: ${cid}`,
          path: ["contactIds", i],
        });
      }
      seen.add(cid);
    });
  });
export type Interaction = z.infer<typeof Interaction>;
