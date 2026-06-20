import type { GeminiGenerateContentResponse } from "./schema";

/**
 * Static fixture responses for the Gemini narrative adapter.
 *
 * Tests drive {@link import("./client").AiInsightsAdapter} with these via an
 * injected `fetchImpl` so the suite is deterministic and offline and NEVER
 * hits the live API (AGENTS.md). These are NOT re-exported from `index.ts` —
 * they have no runtime use and tests import them directly from "./fixtures".
 */

/** A normal, successful single-candidate generation. */
export const successResponse: GeminiGenerateContentResponse = {
  candidates: [
    {
      content: {
        role: "model",
        parts: [
          {
            text:
              "As of 2026-06-30, the portfolio's consolidated net worth is " +
              "healthy and has grown over the reporting window. Public equities " +
              "remain the largest allocation, and the portfolio sits within its " +
              "policy limits. Performance is modestly ahead of the benchmark on " +
              "an active basis, with fees and private-markets multiples in line " +
              "with expectations.",
          },
        ],
      },
      finishReason: "STOP",
    },
  ],
};

/** A generation split across two text parts (the adapter concatenates them). */
export const multiPartResponse: GeminiGenerateContentResponse = {
  candidates: [
    {
      content: {
        role: "model",
        parts: [
          { text: "The portfolio is in good standing. " },
          { text: "Net worth grew and stayed within policy limits." },
        ],
      },
      finishReason: "STOP",
    },
  ],
};

/** A safety-blocked prompt: no usable candidate text. */
export const blockedResponse: GeminiGenerateContentResponse = {
  promptFeedback: { blockReason: "SAFETY" },
};

/** An empty-candidate response (model returned nothing usable). */
export const emptyResponse: GeminiGenerateContentResponse = {
  candidates: [],
};

/**
 * A malformed body that fails schema validation: `candidates` is the wrong
 * type (an object, not an array), so the boundary rejects it.
 */
export const malformedResponse = {
  candidates: { not: "an array" },
} as const;

/** A structured Gemini error envelope (paired with a non-2xx status). */
export const errorResponse = {
  error: {
    code: 400,
    message: "API key not valid. Please pass a valid API key.",
    status: "INVALID_ARGUMENT",
  },
} as const;
