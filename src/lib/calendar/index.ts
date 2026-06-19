/**
 * Calendar meeting sync: Zod schemas for imported calendar events plus a pure,
 * deterministic builder that folds those meetings into a deal's timeline.
 *
 * READ-ONLY product: every export here describes or projects *already-imported*
 * calendar data. Nothing creates, edits, accepts, declines, or sends a calendar
 * invite, and tests run entirely against fixtures — never a live calendar API.
 *
 * Shared primitives (Id, IsoDateTime, ...) come from `src/lib/model/primitives`.
 */
export * from "./calendar-event";
export * from "./timeline";
