import { Deal } from "../deals/deal";
import { CalendarEvent } from "./calendar-event";

/**
 * Deterministic, offline fixtures for calendar sync. These are parsed through
 * {@link CalendarEvent} in tests so the fixtures themselves are validated, and
 * reused by the timeline-builder tests as known-good sample meetings.
 *
 * All data is fictional. These events are imported records of meetings that
 * supposedly already happened on the family's calendar about "Project Acorn"
 * (see `src/lib/deals/fixtures.ts`). Nothing here ever creates a real invite.
 */

/** Matched to the deal by an explicit `dealId`. */
export const eventKickoff: CalendarEvent = CalendarEvent.parse({
  id: "evt-kickoff",
  calendarId: "cal-primary",
  title: "Acorn kickoff",
  start: "2026-01-15T10:00:00Z",
  end: "2026-01-15T11:00:00Z",
  status: "confirmed",
  location: "https://meet.example.com/acorn",
  attendees: [
    { name: "Family Office", email: "office@family.example", self: true },
    { name: "Jane Doe", email: "jane.doe@example.com", response: "accepted" },
  ],
  dealId: "deal-acorn",
});

/** Matched by a shared tag (`forestry`) — carries no `dealId`. */
export const eventSiteVisit: CalendarEvent = CalendarEvent.parse({
  id: "evt-site-visit",
  calendarId: "cal-primary",
  title: "Forestry site visit",
  start: "2026-02-03T08:30:00Z",
  end: "2026-02-03T15:00:00Z",
  status: "confirmed",
  location: "Central Finland",
  attendees: [
    { name: "Family Office", email: "office@family.example", self: true },
  ],
  dealTags: ["forestry"],
});

/** Matched by a shared attendee email (Karl, the principal). */
export const eventNegotiation: CalendarEvent = CalendarEvent.parse({
  id: "evt-negotiation",
  calendarId: "cal-primary",
  title: "Price negotiation",
  start: "2026-03-10T13:00:00Z",
  end: "2026-03-10T14:30:00Z",
  status: "confirmed",
  attendees: [
    { name: "Family Office", email: "office@family.example", self: true },
    { name: "Karl Nieminen", email: "karl@nieminen-forestry.example" },
  ],
});

/** Cancelled — excluded from the timeline by default. */
export const eventCancelled: CalendarEvent = CalendarEvent.parse({
  id: "evt-cancelled",
  calendarId: "cal-primary",
  title: "Acorn follow-up (cancelled)",
  start: "2026-03-20T09:00:00Z",
  end: "2026-03-20T09:30:00Z",
  status: "cancelled",
  dealId: "deal-acorn",
});

/** Belongs to a different deal — must NOT attach to Acorn. */
export const eventUnrelated: CalendarEvent = CalendarEvent.parse({
  id: "evt-unrelated",
  calendarId: "cal-primary",
  title: "Project Birch intro",
  start: "2026-02-10T16:00:00Z",
  end: "2026-02-10T16:45:00Z",
  status: "confirmed",
  attendees: [
    { name: "Family Office", email: "office@family.example", self: true },
    { name: "Someone Else", email: "someone@birch.example" },
  ],
  dealId: "deal-birch",
});

/**
 * A self-contained deal fixture for the calendar tests. It mirrors the shared
 * "Project Acorn" deal but gives the principal contact an email so the
 * attendee-match path can be exercised, and carries one native interaction so
 * the merge-with-interactions behavior is covered. Kept local to this unit
 * rather than mutating the shared deals fixture.
 */
export const calendarDeal: Deal = Deal.parse({
  id: "deal-acorn",
  name: "Project Acorn — forestry roll-up",
  pipelineId: "pipeline-direct-pe",
  stageId: "stage-diligence",
  status: "active",
  assetClass: "forest",
  amount: { amount: "4500000.00", currency: "EUR" },
  openedOn: "2026-01-10",
  contacts: [
    {
      id: "contact-broker",
      name: "Jane Doe",
      role: "broker",
      organization: "Evergreen Advisory",
      email: "jane.doe@example.com",
    },
    {
      id: "contact-principal",
      name: "Karl Nieminen",
      role: "principal",
      organization: "Nieminen Forestry Oy",
      email: "karl@nieminen-forestry.example",
    },
  ],
  interactions: [
    {
      id: "int-intro",
      kind: "email",
      occurredAt: "2026-01-12T09:30:00Z",
      summary: "Intro from broker",
      direction: "inbound",
      contactIds: ["contact-broker"],
    },
  ],
  tags: ["forestry", "nordics"],
});

/** The full pool of imported events used across tests. */
export const sampleCalendarEvents: CalendarEvent[] = [
  eventKickoff,
  eventSiteVisit,
  eventNegotiation,
  eventCancelled,
  eventUnrelated,
];
