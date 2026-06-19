import * as z from "zod";

import { Id } from "../model/primitives";

/**
 * Contact data model for the deal / pipeline tracker.
 *
 * READ-ONLY product: a {@link Contact} records *who* a family is talking to
 * about a prospective deal. It is a passive record — the product never emails,
 * calls, or otherwise reaches out to a contact on the family's behalf.
 */

/**
 * The role a contact plays relative to a deal. Kept coarse so the UI can group
 * counterparties (the people on the other side) from the family's own advisors.
 */
export const CONTACT_ROLES = [
  "principal", // the counterparty principal (seller, founder, GP)
  "broker", // intermediary / agent / banker running the process
  "advisor", // the family's own advisor (lawyer, accountant, consultant)
  "lawyer", // legal counsel (either side)
  "introducer", // who introduced the deal
  "other",
] as const;

export const ContactRole = z.enum(CONTACT_ROLES);
export type ContactRole = z.infer<typeof ContactRole>;

/**
 * A lenient email check. We validate shape only — this product never sends to
 * the address, so RFC-perfect validation is unnecessary and counterproductive.
 */
const EmailString = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("must be a valid email address"));

/**
 * An E.164-ish phone string: optional leading `+`, then 7–15 digits, with
 * spaces or hyphens allowed as separators. Shape-check only — the product
 * never dials the number.
 */
const PhoneString = z
  .string()
  .trim()
  .regex(/^\+?[\d\s-]+$/, "must look like a phone number")
  .refine((s) => {
    const digits = s.replace(/\D/g, "").length;
    return digits >= 7 && digits <= 15;
  }, "phone number must have 7–15 digits");

/**
 * A person involved in a deal. Email and phone are optional and are stored for
 * reference only; the product does not contact them.
 */
export const Contact = z
  .object({
    /** Stable id for this contact. */
    id: Id,
    /** Full name (e.g. "Jane Doe"). */
    name: z.string().trim().min(1, "contact name must not be empty"),
    /** What role this contact plays in the deal. */
    role: ContactRole,
    /** Optional organization / firm the contact belongs to. */
    organization: z.string().trim().min(1).optional(),
    /** Optional email, stored for reference only (never contacted). */
    email: EmailString.optional(),
    /** Optional phone, stored for reference only (never contacted). */
    phone: PhoneString.optional(),
    /** Optional free-text note. */
    note: z.string().trim().max(2000).optional(),
  })
  .strict();
export type Contact = z.infer<typeof Contact>;
