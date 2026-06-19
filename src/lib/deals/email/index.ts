/**
 * Gmail deal-email ingestion (READ-ONLY parser).
 *
 * Turns the text of an email that already arrived into a structured, *proposed*
 * deal record a human reviews before anything is created. This module never
 * connects to Gmail, never sends/drafts/replies, never moves money, and never
 * auto-creates a deal. All extraction is pure, deterministic, and offline —
 * tested against fixtures only.
 */
import { extractDealFromEmail, type DealEmailExtraction } from "./extract";
import { parseRawEmail, type RawEmail, type RawEmailInput } from "./raw-email";

export * from "./raw-email";
export * from "./extract";

/**
 * One-shot convenience: parse a raw email (string or pre-split payload) and
 * extract a deal suggestion from it. Equivalent to
 * `extractDealFromEmail(parseRawEmail(input))`.
 */
export function parseDealEmail(input: RawEmailInput): {
  raw: RawEmail;
  extraction: DealEmailExtraction;
} {
  const raw = parseRawEmail(input);
  return { raw, extraction: extractDealFromEmail(raw) };
}
