import { describe, expect, it } from "vitest";

import { Deal } from "../deals/deal";
import {
  ATTENDEE_RESPONSES,
  Attendee,
  AttendeeResponse,
  CALENDAR_EVENT_STATUSES,
  CalendarEvent,
  CalendarEventStatus,
  eventDurationMinutes,
  isCancelled,
} from "./calendar-event";
import {
  calendarDeal,
  eventCancelled,
  eventKickoff,
  eventNegotiation,
  eventSiteVisit,
  eventUnrelated,
  sampleCalendarEvents,
} from "./fixtures";
import {
  MATCH_REASONS,
  buildDealTimeline,
  countMeetings,
  matchEventToDeal,
} from "./timeline";

describe("Attendee", () => {
  it("normalizes email casing/whitespace and applies defaults", () => {
    const a = Attendee.parse({ email: "  Jane.DOE@Example.com  " });
    expect(a.email).toBe("jane.doe@example.com");
    expect(a.response).toBe("needsAction");
    expect(a.self).toBe(false);
    expect(a.organizer).toBe(false);
  });

  it("accepts every declared response", () => {
    for (const r of ATTENDEE_RESPONSES) {
      expect(AttendeeResponse.safeParse(r).success).toBe(true);
    }
  });

  it("rejects a malformed email", () => {
    expect(Attendee.safeParse({ email: "not-an-email" }).success).toBe(false);
  });

  it("rejects unknown keys (strict)", () => {
    expect(
      Attendee.safeParse({ email: "a@b.com", phone: "123" }).success,
    ).toBe(false);
  });
});

describe("CalendarEvent", () => {
  it("parses a valid event and applies defaults", () => {
    const e = CalendarEvent.parse({
      id: "e1",
      calendarId: "c1",
      title: "Sync",
      start: "2026-01-01T10:00:00Z",
      end: "2026-01-01T11:00:00Z",
    });
    expect(e.status).toBe("confirmed");
    expect(e.attendees).toEqual([]);
    expect(e.dealTags).toEqual([]);
  });

  it("accepts every declared status", () => {
    for (const s of CALENDAR_EVENT_STATUSES) {
      expect(CalendarEventStatus.safeParse(s).success).toBe(true);
    }
  });

  it("rejects an end before start", () => {
    const res = CalendarEvent.safeParse({
      id: "e1",
      calendarId: "c1",
      title: "X",
      start: "2026-01-01T11:00:00Z",
      end: "2026-01-01T10:00:00Z",
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(
        res.error.issues.some((i) => i.message.includes("must not be before")),
      ).toBe(true);
    }
  });

  it("accepts a zero-length (instant) event", () => {
    expect(
      CalendarEvent.safeParse({
        id: "e1",
        calendarId: "c1",
        title: "X",
        start: "2026-01-01T10:00:00Z",
        end: "2026-01-01T10:00:00Z",
      }).success,
    ).toBe(true);
  });

  it("rejects a non-ISO timestamp", () => {
    expect(
      CalendarEvent.safeParse({
        id: "e1",
        calendarId: "c1",
        title: "X",
        start: "2026-01-01 10:00:00",
        end: "2026-01-01T11:00:00Z",
      }).success,
    ).toBe(false);
  });

  it("rejects an empty title", () => {
    expect(
      CalendarEvent.safeParse({
        id: "e1",
        calendarId: "c1",
        title: "   ",
        start: "2026-01-01T10:00:00Z",
        end: "2026-01-01T11:00:00Z",
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate attendee emails (case-insensitively)", () => {
    const res = CalendarEvent.safeParse({
      id: "e1",
      calendarId: "c1",
      title: "X",
      start: "2026-01-01T10:00:00Z",
      end: "2026-01-01T11:00:00Z",
      attendees: [{ email: "a@b.com" }, { email: "A@B.com" }],
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(
        res.error.issues.some((i) =>
          i.message.includes("duplicate attendee email"),
        ),
      ).toBe(true);
    }
  });

  it("rejects duplicate dealTags", () => {
    const res = CalendarEvent.safeParse({
      id: "e1",
      calendarId: "c1",
      title: "X",
      start: "2026-01-01T10:00:00Z",
      end: "2026-01-01T11:00:00Z",
      dealTags: ["forestry", "forestry"],
    });
    expect(res.success).toBe(false);
  });

  it("rejects unknown keys (strict)", () => {
    expect(
      CalendarEvent.safeParse({
        id: "e1",
        calendarId: "c1",
        title: "X",
        start: "2026-01-01T10:00:00Z",
        end: "2026-01-01T11:00:00Z",
        organizerEmail: "a@b.com",
      }).success,
    ).toBe(false);
  });
});

describe("eventDurationMinutes / isCancelled", () => {
  it("computes whole-minute durations", () => {
    expect(eventDurationMinutes(eventKickoff)).toBe(60);
    expect(eventDurationMinutes(eventSiteVisit)).toBe(390);
    expect(eventDurationMinutes(eventNegotiation)).toBe(90);
  });

  it("floors partial minutes and never goes negative", () => {
    const e = CalendarEvent.parse({
      id: "e",
      calendarId: "c",
      title: "X",
      start: "2026-01-01T10:00:00Z",
      end: "2026-01-01T10:00:30Z",
    });
    expect(eventDurationMinutes(e)).toBe(0);
  });

  it("flags cancelled events", () => {
    expect(isCancelled(eventCancelled)).toBe(true);
    expect(isCancelled(eventKickoff)).toBe(false);
  });
});

describe("matchEventToDeal", () => {
  it("matches by explicit dealId", () => {
    expect(matchEventToDeal(eventKickoff, calendarDeal)).toBe("dealId");
  });

  it("matches by shared tag when no dealId is present", () => {
    expect(matchEventToDeal(eventSiteVisit, calendarDeal)).toBe("tag");
  });

  it("matches by shared attendee email as the last resort", () => {
    expect(matchEventToDeal(eventNegotiation, calendarDeal)).toBe("attendee");
  });

  it("does not match an event whose dealId points at another deal", () => {
    expect(matchEventToDeal(eventUnrelated, calendarDeal)).toBeUndefined();
  });

  it("dealId takes precedence over a coincidental tag/attendee match", () => {
    // Event explicitly tagged to another deal but sharing a tag + attendee with
    // this deal must still NOT attach: the explicit (wrong) dealId wins.
    const e = CalendarEvent.parse({
      id: "e",
      calendarId: "c",
      title: "X",
      start: "2026-01-01T10:00:00Z",
      end: "2026-01-01T11:00:00Z",
      dealId: "some-other-deal",
      dealTags: ["forestry"],
      attendees: [{ email: "jane.doe@example.com" }],
    });
    expect(matchEventToDeal(e, calendarDeal)).toBeUndefined();
  });

  it("ignores contacts without an email when matching attendees", () => {
    const dealNoEmails = Deal.parse({
      id: "deal-acorn",
      name: "D",
      pipelineId: "p",
      stageId: "s",
      openedOn: "2026-01-01",
      contacts: [
        { id: "c1", name: "No Email", role: "principal", phone: "+1 555 123 4567" },
      ],
    });
    expect(matchEventToDeal(eventNegotiation, dealNoEmails)).toBeUndefined();
  });

  it("is email case-insensitive across calendar and contact", () => {
    const e = CalendarEvent.parse({
      id: "e",
      calendarId: "c",
      title: "X",
      start: "2026-01-01T10:00:00Z",
      end: "2026-01-01T11:00:00Z",
      attendees: [{ email: "Karl@Nieminen-Forestry.Example" }],
    });
    expect(matchEventToDeal(e, calendarDeal)).toBe("attendee");
  });

  it("exposes the documented set of match reasons", () => {
    expect(MATCH_REASONS).toEqual(["dealId", "tag", "attendee"]);
  });
});

describe("buildDealTimeline", () => {
  it("merges interactions with matched events in chronological order", () => {
    const timeline = buildDealTimeline(calendarDeal, sampleCalendarEvents);
    expect(timeline.map((e) => e.id)).toEqual([
      "interaction:int-intro", // 2026-01-12
      "calendar:evt-kickoff", // 2026-01-15
      "calendar:evt-site-visit", // 2026-02-03
      "calendar:evt-negotiation", // 2026-03-10
    ]);
  });

  it("annotates each calendar entry with its match reason", () => {
    const timeline = buildDealTimeline(calendarDeal, sampleCalendarEvents);
    const byId = new Map(timeline.map((e) => [e.id, e]));
    expect(byId.get("calendar:evt-kickoff")?.matchReason).toBe("dealId");
    expect(byId.get("calendar:evt-site-visit")?.matchReason).toBe("tag");
    expect(byId.get("calendar:evt-negotiation")?.matchReason).toBe("attendee");
  });

  it("excludes cancelled events by default", () => {
    const timeline = buildDealTimeline(calendarDeal, sampleCalendarEvents);
    expect(timeline.some((e) => e.id === "calendar:evt-cancelled")).toBe(false);
  });

  it("includes cancelled events when excludeCancelled is false", () => {
    const timeline = buildDealTimeline(calendarDeal, sampleCalendarEvents, {
      excludeCancelled: false,
    });
    expect(timeline.some((e) => e.id === "calendar:evt-cancelled")).toBe(true);
  });

  it("excludes events belonging to other deals", () => {
    const timeline = buildDealTimeline(calendarDeal, sampleCalendarEvents);
    expect(timeline.some((e) => e.id === "calendar:evt-unrelated")).toBe(false);
  });

  it("carries the source objects through on each entry", () => {
    const timeline = buildDealTimeline(calendarDeal, sampleCalendarEvents);
    const cal = timeline.find((e) => e.source === "calendar");
    const inter = timeline.find((e) => e.source === "interaction");
    expect(cal?.event?.id).toBe("evt-kickoff");
    expect(cal?.interaction).toBeUndefined();
    expect(inter?.interaction?.id).toBe("int-intro");
    expect(inter?.event).toBeUndefined();
  });

  it("is pure: does not mutate the deal, its arrays, or the events pool", () => {
    const interactionsBefore = calendarDeal.interactions.map((i) => i.id);
    const poolBefore = sampleCalendarEvents.map((e) => e.id);
    buildDealTimeline(calendarDeal, sampleCalendarEvents);
    expect(calendarDeal.interactions.map((i) => i.id)).toEqual(
      interactionsBefore,
    );
    expect(sampleCalendarEvents.map((e) => e.id)).toEqual(poolBefore);
  });

  it("is deterministic: identical inputs yield identical output", () => {
    const a = buildDealTimeline(calendarDeal, sampleCalendarEvents);
    const b = buildDealTimeline(calendarDeal, sampleCalendarEvents);
    expect(a).toEqual(b);
  });

  it("breaks ties on equal timestamps by source then id (stable)", () => {
    const sameTime = "2026-05-01T12:00:00Z";
    const deal = Deal.parse({
      id: "deal-x",
      name: "X",
      pipelineId: "p",
      stageId: "s",
      openedOn: "2026-01-01",
      tags: ["t"],
      interactions: [
        { id: "z-note", kind: "note", occurredAt: sameTime, summary: "note" },
      ],
    });
    const events = [
      CalendarEvent.parse({
        id: "a-evt",
        calendarId: "c",
        title: "A",
        start: sameTime,
        end: sameTime,
        dealId: "deal-x",
      }),
    ];
    const timeline = buildDealTimeline(deal, events);
    // "calendar" < "interaction" lexicographically, so calendar entry sorts first.
    expect(timeline.map((e) => e.id)).toEqual([
      "calendar:a-evt",
      "interaction:z-note",
    ]);
  });

  it("orders by absolute instant across mixed UTC offsets, not by string", () => {
    // The "+02:00" event is at 09:00Z — an *earlier* instant than the "10:00Z"
    // event, even though its `at` string sorts lexically later. A correct
    // chronological timeline must place it first.
    const deal = Deal.parse({
      id: "deal-tz",
      name: "TZ",
      pipelineId: "p",
      stageId: "s",
      openedOn: "2026-01-01",
      tags: ["t"],
    });
    const events = [
      CalendarEvent.parse({
        id: "later-utc",
        calendarId: "c",
        title: "Later",
        start: "2026-01-01T10:00:00Z", // 10:00Z
        end: "2026-01-01T10:30:00Z",
        dealId: "deal-tz",
      }),
      CalendarEvent.parse({
        id: "earlier-offset",
        calendarId: "c",
        title: "Earlier",
        start: "2026-01-01T11:00:00+02:00", // 09:00Z — earlier instant
        end: "2026-01-01T11:30:00+02:00",
        dealId: "deal-tz",
      }),
    ];
    const timeline = buildDealTimeline(deal, events);
    expect(timeline.map((e) => e.id)).toEqual([
      "calendar:earlier-offset",
      "calendar:later-utc",
    ]);
  });

  it("interleaves an offset interaction with a UTC event by true instant", () => {
    // Interaction at 13:30+01:00 (12:30Z) must sort before an event at 13:00Z.
    const deal = Deal.parse({
      id: "deal-mix",
      name: "Mix",
      pipelineId: "p",
      stageId: "s",
      openedOn: "2026-01-01",
      tags: ["t"],
      interactions: [
        {
          id: "call",
          kind: "call",
          occurredAt: "2026-01-01T13:30:00+01:00", // 12:30Z
          summary: "call",
        },
      ],
    });
    const events = [
      CalendarEvent.parse({
        id: "evt",
        calendarId: "c",
        title: "Meeting",
        start: "2026-01-01T13:00:00Z", // 13:00Z — later than the call
        end: "2026-01-01T13:30:00Z",
        dealId: "deal-mix",
      }),
    ];
    const timeline = buildDealTimeline(deal, events);
    expect(timeline.map((e) => e.id)).toEqual([
      "interaction:call",
      "calendar:evt",
    ]);
  });

  it("handles an empty events pool", () => {
    const timeline = buildDealTimeline(calendarDeal, []);
    expect(timeline.map((e) => e.id)).toEqual(["interaction:int-intro"]);
  });

  it("does not double-attach an event that matches a deal twice (single entry)", () => {
    // Event shares both the dealId AND a tag AND an attendee with the deal; it
    // must appear exactly once, attributed by the most specific reason.
    const event = CalendarEvent.parse({
      id: "multi",
      calendarId: "c",
      title: "Multi-match",
      start: "2026-04-01T10:00:00Z",
      end: "2026-04-01T11:00:00Z",
      dealId: "deal-acorn",
      dealTags: ["forestry"],
      attendees: [{ email: "jane.doe@example.com" }],
    });
    const timeline = buildDealTimeline(calendarDeal, [event]);
    const matches = timeline.filter((e) => e.id === "calendar:multi");
    expect(matches).toHaveLength(1);
    expect(matches[0]?.matchReason).toBe("dealId");
  });

  it("returns only interactions when no events match", () => {
    const timeline = buildDealTimeline(calendarDeal, [eventUnrelated]);
    expect(timeline.map((e) => e.id)).toEqual(["interaction:int-intro"]);
  });

  it("returns an empty timeline for a deal with no interactions and no matches", () => {
    const bare = Deal.parse({
      id: "deal-bare",
      name: "Bare",
      pipelineId: "p",
      stageId: "s",
      openedOn: "2026-01-01",
    });
    expect(buildDealTimeline(bare, sampleCalendarEvents)).toEqual([]);
  });
});

describe("countMeetings", () => {
  it("counts only calendar-sourced entries", () => {
    const timeline = buildDealTimeline(calendarDeal, sampleCalendarEvents);
    expect(countMeetings(timeline)).toBe(3);
    expect(timeline).toHaveLength(4); // + 1 interaction
  });
});

describe("fixtures round-trip through their schemas", () => {
  it("re-parses every event fixture without loss", () => {
    for (const e of sampleCalendarEvents) {
      expect(CalendarEvent.parse(e)).toEqual(e);
    }
  });

  it("the calendar deal fixture is a valid Deal", () => {
    expect(Deal.parse(calendarDeal)).toEqual(calendarDeal);
  });
});
