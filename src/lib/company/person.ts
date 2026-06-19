import * as z from "zod";

import { Id, IsoDate } from "../model/primitives";

/**
 * A natural person relevant to the family-office ownership graph: a family
 * member, beneficiary, director, or other individual who may hold an
 * {@link OwnershipStake} in a {@link Company}.
 *
 * READ-ONLY product: a person record describes who someone is for reporting
 * purposes; it never represents an instruction to contact them or move money on
 * their behalf.
 */
export const Person = z
  .object({
    /** Stable id for this person. */
    id: Id,
    /** Full legal/display name (e.g. "Touko Ursin"). */
    name: z.string().trim().min(1, "person name must not be empty"),
    /** Optional date of birth (YYYY-MM-DD). */
    dateOfBirth: IsoDate.optional(),
    /** Optional ISO-3166-1 alpha-2 country of (tax) residence (e.g. "FI"). */
    countryOfResidence: z
      .string()
      .trim()
      .transform((s) => s.toUpperCase())
      .pipe(
        z
          .string()
          .regex(/^[A-Z]{2}$/, "country must be a 2-letter ISO-3166 code"),
      )
      .optional(),
    /**
     * Optional contact email. Stored for reference only; this product never
     * sends mail (see AGENTS.md scope fence).
     */
    email: z.email().optional(),
    /** Optional free-text role/note (e.g. "Patriarch", "Trustee"). */
    note: z.string().trim().max(2000).optional(),
    /** Optional free-text tags for grouping/filtering. */
    tags: z.array(z.string().trim().min(1)).default([]),
  })
  .strict();
export type Person = z.infer<typeof Person>;
