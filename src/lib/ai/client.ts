import type { BoardReport } from "@/lib/reporting";

import { guardLiveCall, isBrowserRuntime } from "./guard";
import { buildNarrativePrompt, deterministicNarrative } from "./prompt";
import {
  GeminiErrorResponse,
  GeminiGenerateContentResponse,
} from "./schema";

/**
 * The single AI adapter for the whole app (m10-ai-insights).
 *
 * It generates a plain-English narrative of the already-computed portfolio
 * state via Google Gemini's `generateContent` REST endpoint, reading
 * `GEMINI_API_KEY` **server-side**. Two hard rules from the unit brief:
 *
 *  1. It DEGRADES GRACEFULLY. If the key is absent or the request fails for any
 *     reason, it returns an `unavailable` result (never throws); the panel then
 *     renders "AI insights unavailable" plus the deterministic offline summary.
 *  2. Tests use FIXTURE responses ONLY. The network call is injected
 *     (`fetchImpl`), so unit tests drive the parser with fixtures and never
 *     touch the live API (AGENTS.md: data adapters are tested against fixtures,
 *     never live APIs).
 *
 * READ-ONLY product: this only reads a generated summary of deterministic
 * state. It never moves money, places trades, or sends email.
 */

/** Default Gemini model used for the narrative. */
export const DEFAULT_GEMINI_MODEL = "gemini-1.5-flash";

/** Base URL for the Gemini REST API. */
export const GEMINI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta";

/** Default per-request timeout (ms). */
export const DEFAULT_REQUEST_TIMEOUT_MS = 12_000;

/** Minimal fetch signature this adapter depends on (injectable for tests). */
export type FetchLike = (
  url: string,
  init?: {
    method?: string;
    signal?: AbortSignal;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  json: () => Promise<unknown>;
}>;

/** Options for {@link AiInsightsAdapter}. */
export interface AiInsightsAdapterOptions {
  /**
   * Gemini API key. When omitted, falls back to `process.env.GEMINI_API_KEY`
   * (read server-side only). When still empty, the adapter degrades gracefully.
   */
  apiKey?: string;
  /** Model id (defaults to {@link DEFAULT_GEMINI_MODEL}). */
  model?: string;
  /** Base URL (defaults to {@link GEMINI_BASE_URL}). */
  baseUrl?: string;
  /** Injected fetch implementation (defaults to the global `fetch`). */
  fetchImpl?: FetchLike;
  /** Per-request timeout in ms (defaults to {@link DEFAULT_REQUEST_TIMEOUT_MS}). */
  requestTimeoutMs?: number;
  /**
   * Override the runtime detection used by the no-live-call guard. Defaults to
   * {@link isBrowserRuntime}. When the runtime is a browser, the adapter refuses
   * to call a live provider host even if a key is present (the live fetch lives
   * server-side). Exposed only so tests can drive both branches deterministically.
   */
  isBrowser?: boolean;
}

/** Why the AI narrative could not be produced. */
export type InsightUnavailableReason =
  | "missing-key"
  | "browser-blocked"
  | "http-error"
  | "blocked"
  | "empty"
  | "malformed"
  | "network-error";

/** A successful AI narrative. */
export interface InsightOk {
  readonly status: "ok";
  /** The generated plain-English narrative. */
  readonly narrative: string;
  /** The model that produced it. */
  readonly model: string;
  /** The deterministic offline summary of the same state (always available). */
  readonly deterministic: string;
}

/** A graceful-degradation result: no AI text, but the reason and a fallback. */
export interface InsightUnavailable {
  readonly status: "unavailable";
  readonly reason: InsightUnavailableReason;
  /** Human-readable detail (safe to surface; never includes the API key). */
  readonly detail: string;
  /** The deterministic offline summary, so the panel still shows the facts. */
  readonly deterministic: string;
}

/** The adapter's only public result type. */
export type InsightResult = InsightOk | InsightUnavailable;

/** Resolve the API key from options or the server-side environment. */
function resolveApiKey(explicit?: string): string | undefined {
  const fromOptions = explicit?.trim();
  if (fromOptions) return fromOptions;
  // `process.env` is only meaningful server-side; in the browser bundle it is
  // undefined, which correctly yields the graceful "missing-key" path.
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env;
  const fromEnv = env?.GEMINI_API_KEY?.trim();
  return fromEnv || undefined;
}

/**
 * Read-only Gemini narrative adapter. Construct with an injected `fetchImpl` in
 * tests to stay offline; in production it uses the global `fetch` and the
 * server-side `GEMINI_API_KEY`.
 */
export class AiInsightsAdapter {
  private readonly apiKey?: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchImpl?: FetchLike;
  private readonly requestTimeoutMs: number;
  private readonly isBrowser: boolean;

  constructor(options: AiInsightsAdapterOptions = {}) {
    this.apiKey = resolveApiKey(options.apiKey);
    this.model = options.model ?? DEFAULT_GEMINI_MODEL;
    this.baseUrl = (options.baseUrl ?? GEMINI_BASE_URL).replace(/\/+$/, "");
    this.fetchImpl =
      options.fetchImpl ?? (globalThis as { fetch?: FetchLike }).fetch;
    this.requestTimeoutMs =
      options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.isBrowser = options.isBrowser ?? isBrowserRuntime();
  }

  /** True when an API key is configured (key present, not validated remotely). */
  get isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  /**
   * Generate a plain-English narrative for the given board report. NEVER throws
   * — any failure (missing key, HTTP error, safety block, malformed/empty
   * body, network error, missing fetch) returns an `unavailable` result with
   * the deterministic offline summary attached.
   */
  async narrate(report: BoardReport): Promise<InsightResult> {
    const deterministic = deterministicNarrative(report);

    if (!this.apiKey) {
      return {
        status: "unavailable",
        reason: "missing-key",
        detail: "GEMINI_API_KEY is not configured.",
        deterministic,
      };
    }
    if (!this.fetchImpl) {
      return {
        status: "unavailable",
        reason: "network-error",
        detail: "No fetch implementation is available.",
        deterministic,
      };
    }

    const prompt = buildNarrativePrompt(report);
    const url =
      `${this.baseUrl}/models/${encodeURIComponent(this.model)}:generateContent` +
      `?key=${encodeURIComponent(this.apiKey)}`;

    // No-live-call guard (m14): even with a key present, never reach a live
    // provider host from a browser runtime. The live fetch belongs server-side;
    // the client degrades gracefully to the deterministic summary.
    const decision = guardLiveCall(url, { isBrowser: this.isBrowser });
    if (!decision.allow) {
      return {
        status: "unavailable",
        reason: "browser-blocked",
        detail:
          "AI insights are generated server-side; the browser does not call " +
          "the live AI provider. Showing the deterministic summary instead.",
        deterministic,
      };
    }

    const body = JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 512 },
    });

    let timer: ReturnType<typeof setTimeout> | undefined;
    let signal: AbortSignal | undefined;
    if (this.requestTimeoutMs > 0) {
      const controller = new AbortController();
      signal = controller.signal;
      timer = setTimeout(
        () => controller.abort(new Error("Gemini request timed out")),
        this.requestTimeoutMs,
      );
    }

    try {
      const res = await this.fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal,
      });

      if (!res.ok) {
        let detail = `Gemini request failed: ${res.status} ${res.statusText}`;
        try {
          const parsed = GeminiErrorResponse.safeParse(await res.json());
          if (parsed.success && parsed.data.error.message) {
            detail = `Gemini error ${res.status}: ${parsed.data.error.message}`;
          }
        } catch {
          // Body unavailable/non-JSON — keep the status-line detail.
        }
        return {
          status: "unavailable",
          reason: "http-error",
          detail,
          deterministic,
        };
      }

      const parsed = GeminiGenerateContentResponse.safeParse(await res.json());
      if (!parsed.success) {
        return {
          status: "unavailable",
          reason: "malformed",
          detail: "Gemini response did not match the expected shape.",
          deterministic,
        };
      }

      const block = parsed.data.promptFeedback?.blockReason;
      if (block) {
        return {
          status: "unavailable",
          reason: "blocked",
          detail: `Gemini blocked the prompt (${block}).`,
          deterministic,
        };
      }

      const text = parsed.data.candidates
        ?.flatMap((c) => c.content?.parts ?? [])
        .map((p) => p.text)
        .join("")
        .trim();

      if (!text) {
        return {
          status: "unavailable",
          reason: "empty",
          detail: "Gemini returned no narrative text.",
          deterministic,
        };
      }

      return {
        status: "ok",
        narrative: text,
        model: this.model,
        deterministic,
      };
    } catch (err) {
      return {
        status: "unavailable",
        reason: "network-error",
        detail:
          err instanceof Error ? err.message : "Unknown network error.",
        deterministic,
      };
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
}
