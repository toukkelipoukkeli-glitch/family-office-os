import * as z from "zod";

import { Id, NonNegativeMoneySchema } from "../model/primitives";

/**
 * Org-hierarchy model: the legal-entity structure of a family office — holding
 * companies, operating subsidiaries, trusts, funds and SPVs — wired together by
 * ownership edges.
 *
 * READ-ONLY product: an {@link Entity} is a record of how the family's
 * structure is *organized*. Nothing here moves money, restructures ownership,
 * or files anything; it only describes and reports the existing tree.
 */

/** The legal/functional kind of an entity in the structure. */
export const ENTITY_KINDS = [
  "holding",
  "operating",
  "trust",
  "fund",
  "spv",
  "foundation",
  "individual",
] as const;
export const EntityKind = z.enum(ENTITY_KINDS);
export type EntityKind = z.infer<typeof EntityKind>;

/** Human-readable label for an entity kind. */
export function entityKindLabel(kind: EntityKind): string {
  switch (kind) {
    case "holding":
      return "Holding company";
    case "operating":
      return "Operating company";
    case "trust":
      return "Trust";
    case "fund":
      return "Fund";
    case "spv":
      return "SPV";
    case "foundation":
      return "Foundation";
    case "individual":
      return "Individual";
  }
}

/**
 * An ownership edge: `parentId` owns `ownershipPct` of *this* entity.
 *
 * `ownershipPct` is a fraction in [0, 1] (e.g. `0.6` = 60%). An entity may have
 * several owners (multiple edges) as long as the fractions sum to <= 1.
 */
export const OwnershipEdge = z
  .object({
    /** Id of the owning (parent) entity. */
    parentId: Id,
    /** Fraction of this entity owned by `parentId`, in [0, 1]. */
    ownershipPct: z.number().min(0).max(1),
  })
  .strict();
export type OwnershipEdge = z.infer<typeof OwnershipEdge>;

/**
 * A legal entity in the family-office structure.
 *
 * - `owners` are the ownership edges *into* this entity; a root (top of the
 *   tree) has no owners.
 * - `nav` is the optional standalone net asset value of the entity in its own
 *   right (non-negative money), used to size nodes and roll up value.
 */
export const Entity = z
  .object({
    /** Stable id. */
    id: Id,
    /** Display name (e.g. "Acorn Holdings LLC"). */
    name: z.string().trim().min(1, "entity name must not be empty"),
    /** Legal/functional kind. */
    kind: EntityKind,
    /** Jurisdiction of formation (e.g. "Delaware, US"). */
    jurisdiction: z.string().trim().min(1).optional(),
    /** Ownership edges into this entity. */
    owners: z.array(OwnershipEdge).default([]),
    /** Standalone net asset value (non-negative money). */
    nav: NonNegativeMoneySchema.optional(),
    /** Optional free-text note. */
    note: z.string().trim().max(2000).optional(),
  })
  .strict()
  .superRefine((entity, ctx) => {
    // An entity cannot own itself.
    entity.owners.forEach((edge, i) => {
      if (edge.parentId === entity.id) {
        ctx.addIssue({
          code: "custom",
          message: `entity ${entity.id} cannot own itself`,
          path: ["owners", i, "parentId"],
        });
      }
    });

    // A parent may appear at most once among an entity's owners.
    const seen = new Set<string>();
    entity.owners.forEach((edge, i) => {
      if (seen.has(edge.parentId)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate owner edge for parent ${edge.parentId}`,
          path: ["owners", i, "parentId"],
        });
      }
      seen.add(edge.parentId);
    });

    // Total ownership of an entity cannot exceed 100%.
    const total = entity.owners.reduce((a, e) => a + e.ownershipPct, 0);
    if (total > 1 + 1e-9) {
      ctx.addIssue({
        code: "custom",
        message: `owners of ${entity.id} sum to ${(total * 100).toFixed(2)}% (> 100%)`,
        path: ["owners"],
      });
    }
  });
export type Entity = z.infer<typeof Entity>;

/** Validate and parse a list of entities. */
export const EntityList = z.array(Entity);
export type EntityList = z.infer<typeof EntityList>;
