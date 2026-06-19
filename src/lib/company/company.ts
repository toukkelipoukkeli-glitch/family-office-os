import * as z from "zod";

import { CurrencyCode, Id, IsoDate, IsoDateTime } from "../model/primitives";
import { OwnershipStake, Percentage } from "./ownership-stake";

/**
 * The legal form of an entity. Descriptive and reporting-oriented; the set is
 * intentionally broad rather than jurisdiction-exact.
 */
export const EntityType = z.enum([
  "corporation",
  "llc",
  "partnership",
  "trust",
  "foundation",
  "holding_company",
  "fund",
  "other",
]);
export type EntityType = z.infer<typeof EntityType>;

/**
 * A subsidiary edge: a reference from a parent {@link Company} to a child
 * company it (partly) owns, together with the percentage the parent holds.
 *
 * The child company is referenced by id (`companyId`) rather than nested, so
 * the ownership graph can be a DAG without duplicating entities. Cycle and
 * existence checks belong to the graph layer, not this leaf schema.
 */
export const Subsidiary = z
  .object({
    /** Stable id for this subsidiary edge. */
    id: Id,
    /** Id of the child {@link Company} that is owned. */
    companyId: Id,
    /** Percentage of the child held by the parent, in [0, 100]. */
    percentage: Percentage,
    /** Optional date the parent acquired/established this interest. */
    since: IsoDate.optional(),
    /** Optional free-text note. */
    note: z.string().trim().max(2000).optional(),
  })
  .strict();
export type Subsidiary = z.infer<typeof Subsidiary>;

/**
 * A company (or other legal entity) in the family-office ownership graph.
 *
 * A company is owned by zero or more {@link OwnershipStake}s (its `owners`) and
 * may own zero or more child companies via `subsidiaries`. Both lists are edges
 * in a wider graph keyed by id; this schema validates a single node and its
 * outgoing/incoming edges, enforcing per-node invariants:
 *
 *  - owner stake ids and subsidiary ids are each unique within the company;
 *  - total owned percentage across `owners` may not exceed 100;
 *  - total percentage given away across `subsidiaries` may not exceed 100;
 *  - a company is not listed as its own subsidiary.
 *
 * READ-ONLY product: a company record models structure and ownership for
 * reporting; nothing here moves money, issues shares, or places trades.
 */
export const Company = z
  .object({
    /** Stable id for this company. */
    id: Id,
    /** Legal/display name (e.g. "Ursin Holdings Oy"). */
    name: z.string().trim().min(1, "company name must not be empty"),
    /** Legal form of the entity. */
    entityType: EntityType,
    /**
     * ISO-3166-1 alpha-2 country of incorporation/registration (e.g. "FI").
     */
    jurisdiction: z
      .string()
      .trim()
      .transform((s) => s.toUpperCase())
      .pipe(
        z
          .string()
          .regex(/^[A-Z]{2}$/, "jurisdiction must be a 2-letter ISO-3166 code"),
      ),
    /** Reporting/functional currency for the entity. */
    currency: CurrencyCode,
    /** Optional registration/company number in its jurisdiction. */
    registrationNumber: z.string().trim().min(1).max(100).optional(),
    /** Optional date the entity was incorporated/established. */
    incorporatedOn: IsoDate.optional(),
    /** Ownership stakes held *in* this company. */
    owners: z.array(OwnershipStake).default([]),
    /** Child companies this entity (partly) owns. */
    subsidiaries: z.array(Subsidiary).default([]),
    /** Optional free-text tags for grouping/filtering. */
    tags: z.array(z.string().trim().min(1)).default([]),
    /** When the company record was created. */
    createdAt: IsoDateTime.optional(),
    /** When the company record was last updated. */
    updatedAt: IsoDateTime.optional(),
  })
  .strict()
  .superRefine((company, ctx) => {
    // Owner stake ids must be unique within the company.
    const seenOwner = new Set<string>();
    company.owners.forEach((o, i) => {
      if (seenOwner.has(o.id)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate owner stake id: ${o.id}`,
          path: ["owners", i, "id"],
        });
      }
      seenOwner.add(o.id);
    });

    // Subsidiary ids must be unique within the company.
    const seenSub = new Set<string>();
    company.subsidiaries.forEach((s, i) => {
      if (seenSub.has(s.id)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate subsidiary id: ${s.id}`,
          path: ["subsidiaries", i, "id"],
        });
      }
      seenSub.add(s.id);
      // A company cannot be its own subsidiary.
      if (s.companyId === company.id) {
        ctx.addIssue({
          code: "custom",
          message: "a company cannot be its own subsidiary",
          path: ["subsidiaries", i, "companyId"],
        });
      }
    });

    // Total ownership in this company may not exceed 100%.
    const ownedTotal = company.owners.reduce(
      (sum, o) => sum + Number(o.percentage),
      0,
    );
    if (ownedTotal > 100 + 1e-9) {
      ctx.addIssue({
        code: "custom",
        message: `total ownership (${ownedTotal}%) exceeds 100%`,
        path: ["owners"],
      });
    }

    // Total percentage of children held may not exceed 100% per child, which is
    // already enforced by Percentage; here we guard that no single child is
    // listed twice with a combined share over 100%.
    const perChild = new Map<string, number>();
    company.subsidiaries.forEach((s) => {
      perChild.set(
        s.companyId,
        (perChild.get(s.companyId) ?? 0) + Number(s.percentage),
      );
    });
    company.subsidiaries.forEach((s, i) => {
      const total = perChild.get(s.companyId) ?? 0;
      if (total > 100 + 1e-9) {
        ctx.addIssue({
          code: "custom",
          message: `total stake in child ${s.companyId} (${total}%) exceeds 100%`,
          path: ["subsidiaries", i, "percentage"],
        });
      }
    });
  });
export type Company = z.infer<typeof Company>;
