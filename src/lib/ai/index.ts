/**
 * m10-ai-insights — the single AI adapter for the whole app.
 *
 * Generates a plain-English narrative of the already-computed, deterministic
 * portfolio state (the board report) via Google Gemini, reading
 * `GEMINI_API_KEY` server-side. All AI behaviour lives behind this one adapter.
 *
 * It DEGRADES GRACEFULLY: with no key (or any failure) it returns an
 * `unavailable` result carrying a deterministic offline summary, so the panel
 * renders "AI insights unavailable" and still shows the facts. Tests drive it
 * with offline fixtures via an injected fetch and never call the live API.
 *
 * READ-ONLY product: it reads a generated summary; it never moves money,
 * places trades, or sends email.
 */
export * from "./schema";
export * from "./prompt";
export * from "./guard";
export * from "./client";
// NOTE: `./fixtures` is intentionally NOT re-exported — those are static test
// snapshots with no runtime use. Tests import them directly from "./fixtures".
