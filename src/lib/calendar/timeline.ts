import type { Deal } from "../deals/deal";
import type { Interaction } from "../deals/interaction";
import { CalendarEvent, isCancelled } from "./calendar-event";

/**
 * Deal timeline: a chronological, read-only view that folds calendar meetings
 * into a deal's own interaction log.
 *
 * The product never writes back to a calendar or to a deal — {@link
 * buildDealTimeline} is a pure projection: given a deal and a pool of imported
 * calendar events, it decides which events belong to the deal, converts each to
 * a timeline entry, and merges them with the deal's existing interactions in
 * time order. Nothing is mutated.
 */

/** How a calendar event was matched to a deal (most specific first). */
export const MATCH_REASONS = ["dealId", "tag", "attendee"] as const;
export type MatchReason = (typeof MATCH_REASONS)[number];

/** The kind of source a timeline entry came from. */
export type TimelineEntrySource = "interaction" | "calendar";

/**
 * A single point on a deal timeline. Both interactions and calendar meetings
 * are normalized to this shape so the UI can render one ordered list.
 */
export interface TimelineEntry {
  /** Stable id, namespaced by source to avoid collisions across pools. */
  id: string;
  /** Where this entry came from. */
  source: TimelineEntrySource;
  /** ISO-8601 timestamp the entry is anchored at (interaction time / event start). */
  at: string;
  /** Short label (interaction summary / event title). */
  title: string;
  /**
   * For calendar entries, why the event was attributed to this deal. Undefined
   * for native interactions.
   */
  matchReason?: MatchReason;
  /** The originating calendar event, when `source === "calendar"`. */
  event?: CalendarEvent;
  /** The originating interaction, when `source === "interaction"`. */
  interaction?: Interaction;
}

/** Options controlling how events are attributed and which are included. */
export interface BuildTimelineOptions {
  /**
   * When true (default), cancelled events are dropped. Set false to keep them
   * (e.g. to show that a meeting was called off).
   */
  excludeCancelled?: boolean;
}

/**
 * Lowercased set of every email attached to a deal's contacts, used to attribute
 * an event to the deal when an attendee matches a known contact.
 */
function dealContactEmails(deal: Deal): Set<string> {
  const emails = new Set<string>();
  for (const c of deal.contacts) {
    if (c.email) emails.add(c.email.toLowerCase());
  }
  return emails;
}

/**
 * Decide whether a calendar `event` belongs to `deal`, and if so why.
 *
 * Precedence (most specific wins): an explicit `dealId` on the event, then a
 * shared tag between the event's `dealTags` and the deal's `tags`, then a shared
 * attendee email with one of the deal's contacts. Returns `undefined` when the
 * event is not attributable to this deal.
 */
export function matchEventToDeal(
  event: CalendarEvent,
  deal: Deal,
): MatchReason | undefined {
  if (event.dealId !== undefined) {
    return event.dealId === deal.id ? "dealId" : undefined;
  }

  if (event.dealTags.length > 0 && deal.tags.length > 0) {
    const dealTags = new Set(deal.tags);
    if (event.dealTags.some((t) => dealTags.has(t))) return "tag";
  }

  const emails = dealContactEmails(deal);
  if (emails.size > 0 && event.attendees.some((a) => emails.has(a.email))) {
    return "attendee";
  }

  return undefined;
}

/**
 * Stable, deterministic ordering: by the absolute instant the entry occurred,
 * then source, then id.
 *
 * Entries are ordered by parsed epoch milliseconds rather than by lexical
 * comparison of the `at` strings, so two timestamps that denote the same wall
 * time in different UTC offsets (e.g. `10:00Z` vs `11:00+02:00`, the latter
 * being the *earlier* instant) sort by when they really happened. When two
 * entries land on the same instant, the raw `at` string, then source, then id
 * break the tie so identical inputs always yield byte-identical output.
 */
function compareEntries(a: TimelineEntry, b: TimelineEntry): number {
  const ta = Date.parse(a.at);
  const tb = Date.parse(b.at);
  if (ta !== tb) return ta < tb ? -1 : 1;
  if (a.at !== b.at) return a.at < b.at ? -1 : 1;
  if (a.source !== b.source) return a.source < b.source ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Build a chronological timeline for `deal` by merging its interactions with the
 * subset of `events` attributable to it.
 *
 * Pure and deterministic: it reads only its inputs, never mutates them, and
 * orders entries by timestamp with a stable tiebreak so the same inputs always
 * yield byte-identical output. Calendar entry ids are prefixed with `calendar:`
 * and interaction ids with `interaction:` so the two pools cannot collide.
 */
export function buildDealTimeline(
  deal: Deal,
  events: readonly CalendarEvent[],
  options: BuildTimelineOptions = {},
): TimelineEntry[] {
  const { excludeCancelled = true } = options;

  const entries: TimelineEntry[] = deal.interactions.map((it) => ({
    id: `interaction:${it.id}`,
    source: "interaction" as const,
    at: it.occurredAt,
    title: it.summary,
    interaction: it,
  }));

  for (const event of events) {
    if (excludeCancelled && isCancelled(event)) continue;
    const matchReason = matchEventToDeal(event, deal);
    if (!matchReason) continue;
    entries.push({
      id: `calendar:${event.id}`,
      source: "calendar",
      at: event.start,
      title: event.title,
      matchReason,
      event,
    });
  }

  return entries.sort(compareEntries);
}

/** Count only the calendar-sourced entries in a timeline. */
export function countMeetings(timeline: readonly TimelineEntry[]): number {
  return timeline.reduce(
    (n, e) => (e.source === "calendar" ? n + 1 : n),
    0,
  );
}
