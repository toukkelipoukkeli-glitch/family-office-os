import * as z from "zod";

import { Id, IsoDateTime } from "../model/primitives";

/**
 * Calendar event data model for the read-only calendar sync.
 *
 * READ-ONLY product: a {@link CalendarEvent} is an *imported, after-the-fact*
 * record of a meeting that exists on a calendar. Nothing here ever creates,
 * updates, accepts, declines, or sends a calendar invitation — the schemas only
 * describe and validate events that have already been fetched from a fixture so
 * they can be folded into a deal's timeline.
 */

/**
 * An attendee's RSVP state, mirroring the common calendar vocabulary. Stored for
 * display/grouping only; the product never responds on the user's behalf.
 */
export const ATTENDEE_RESPONSES = [
  "accepted",
  "declined",
  "tentative",
  "needsAction",
] as const;
export const AttendeeResponse = z.enum(ATTENDEE_RESPONSES);
export type AttendeeResponse = z.infer<typeof AttendeeResponse>;

/**
 * A lenient email check (shape only). The product never emails the address, so
 * RFC-perfect validation is unnecessary; we normalize casing/whitespace so the
 * same person matches a deal contact regardless of how the calendar stored it.
 */
const EmailString = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("must be a valid email address"));

/**
 * A person on a calendar event. `email` is the join key against a deal's
 * contacts; `self` marks the calendar owner so the family's own attendance can
 * be distinguished from counterparties.
 */
export const Attendee = z
  .object({
    /** Display name, if the calendar provided one. */
    name: z.string().trim().min(1).optional(),
    /** Email address (normalized lowercase); the join key to deal contacts. */
    email: EmailString,
    /** RSVP state for this attendee. */
    response: AttendeeResponse.default("needsAction"),
    /** True when this attendee is the calendar owner (the family side). */
    self: z.boolean().default(false),
    /** True when this attendee is the meeting organizer. */
    organizer: z.boolean().default(false),
  })
  .strict();
export type Attendee = z.infer<typeof Attendee>;

/**
 * A single calendar event imported from a fixture.
 *
 * - `start` / `end` are RFC-3339 timestamps; `end` must not precede `start`.
 * - Linkage hints (`dealId`, `dealTags`) are *optional*: an event may declare
 *   the deal it belongs to directly, or carry tags that match a deal's tags, or
 *   simply share an attendee email with a deal contact. The matching policy
 *   lives in the timeline builder, not in this leaf schema.
 * - `status` lets a `cancelled` event be recognized and excluded downstream.
 */
export const CALENDAR_EVENT_STATUSES = [
  "confirmed",
  "tentative",
  "cancelled",
] as const;
export const CalendarEventStatus = z.enum(CALENDAR_EVENT_STATUSES);
export type CalendarEventStatus = z.infer<typeof CalendarEventStatus>;

export const CalendarEvent = z
  .object({
    /** Stable id for this event (e.g. the provider's event id). */
    id: Id,
    /** Id of the calendar this event came from. */
    calendarId: Id,
    /** Event title / summary. */
    title: z.string().trim().min(1, "event title must not be empty"),
    /** Start timestamp (ISO-8601, offset required). */
    start: IsoDateTime,
    /** End timestamp (ISO-8601, offset required). */
    end: IsoDateTime,
    /** confirmed / tentative / cancelled. */
    status: CalendarEventStatus.default("confirmed"),
    /** Optional physical location or video link text (never dialed/opened). */
    location: z.string().trim().min(1).optional(),
    /** Optional longer description. */
    description: z.string().trim().max(10000).optional(),
    /** People on the event. */
    attendees: z.array(Attendee).default([]),
    /** Explicit deal linkage hint, if the calendar carried one. */
    dealId: Id.optional(),
    /** Tag hints used to match a deal by its tags when no `dealId` is given. */
    dealTags: z.array(z.string().trim().min(1)).default([]),
  })
  .strict()
  .superRefine((event, ctx) => {
    if (event.end < event.start) {
      ctx.addIssue({
        code: "custom",
        message: `end (${event.end}) must not be before start (${event.start})`,
        path: ["end"],
      });
    }

    // Attendee emails must be unique within an event (one row per person).
    const seenEmails = new Set<string>();
    event.attendees.forEach((a, i) => {
      if (seenEmails.has(a.email)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate attendee email: ${a.email}`,
          path: ["attendees", i, "email"],
        });
      }
      seenEmails.add(a.email);
    });

    // Tag hints must be unique within an event.
    const seenTags = new Set<string>();
    event.dealTags.forEach((tag, i) => {
      if (seenTags.has(tag)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate dealTag: ${tag}`,
          path: ["dealTags", i],
        });
      }
      seenTags.add(tag);
    });
  });
export type CalendarEvent = z.infer<typeof CalendarEvent>;

/** Duration of an event in whole minutes (floored), always non-negative. */
export function eventDurationMinutes(event: CalendarEvent): number {
  const ms = Date.parse(event.end) - Date.parse(event.start);
  return Math.max(0, Math.floor(ms / 60000));
}

/** True when an event is cancelled and should be excluded from a timeline. */
export function isCancelled(event: CalendarEvent): boolean {
  return event.status === "cancelled";
}
