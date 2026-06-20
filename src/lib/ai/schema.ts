import * as z from "zod";

/**
 * Wire schemas for the Google Gemini `generateContent` REST API.
 *
 * These validate the subset of the response we depend on so a malformed,
 * empty, or blocked completion is rejected at the boundary rather than
 * silently rendering garbage in the insights panel. We only model the fields
 * the narrative builder reads; unknown extra fields are ignored.
 *
 * READ-ONLY product: this adapter only *reads* a generated summary of already-
 * computed, deterministic portfolio state. It never moves money, places
 * trades, or sends anything.
 */

/** One text part inside a candidate's content. */
export const GeminiPart = z.object({
  text: z.string(),
});
export type GeminiPart = z.infer<typeof GeminiPart>;

/** A single candidate completion. */
export const GeminiCandidate = z.object({
  content: z
    .object({
      parts: z.array(GeminiPart).min(1, "candidate has no text parts"),
      role: z.string().optional(),
    })
    .optional(),
  finishReason: z.string().optional(),
});
export type GeminiCandidate = z.infer<typeof GeminiCandidate>;

/**
 * The `generateContent` response. A successful generation returns at least one
 * candidate; safety blocks return `promptFeedback.blockReason` and no usable
 * text, which we treat as an unavailable result (graceful degradation).
 */
export const GeminiGenerateContentResponse = z.object({
  candidates: z.array(GeminiCandidate).optional(),
  promptFeedback: z
    .object({
      blockReason: z.string().optional(),
    })
    .optional(),
});
export type GeminiGenerateContentResponse = z.infer<
  typeof GeminiGenerateContentResponse
>;

/** Gemini's structured error envelope (non-2xx responses). */
export const GeminiErrorResponse = z.object({
  error: z.object({
    code: z.number().optional(),
    message: z.string().optional(),
    status: z.string().optional(),
  }),
});
export type GeminiErrorResponse = z.infer<typeof GeminiErrorResponse>;
