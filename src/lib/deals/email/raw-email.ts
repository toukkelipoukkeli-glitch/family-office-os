import * as z from "zod";

import { Id, IsoDateTime } from "../../model/primitives";

/**
 * Raw-email parsing for the Gmail deal-email ingestion pipeline.
 *
 * READ-ONLY product: this module turns the *text* of an email that already
 * arrived into structured fields. It never connects to Gmail, fetches a
 * message, sends, drafts, or replies to anything. The real ingestion job is
 * expected to feed already-fetched message text (or a fixture) into
 * {@link parseRawEmail}; tests run entirely offline against fixtures.
 */

/**
 * A single parsed email address with an optional display name, e.g.
 * `"Jane Doe" <jane@example.com>` → `{ name: "Jane Doe", email: "jane@..." }`.
 * The address is lower-cased and trimmed; the name keeps its original casing.
 */
export const EmailAddress = z
  .object({
    /** Display name, if the header carried one (e.g. "Jane Doe"). */
    name: z.string().trim().min(1).optional(),
    /** The bare address, normalized to lower-case. */
    email: z.string().trim().toLowerCase().pipe(z.email()),
  })
  .strict();
export type EmailAddress = z.infer<typeof EmailAddress>;

/**
 * A raw email broken into the fields the deal extractor cares about. This is a
 * *structural* parse only — semantic extraction (who is the broker? how big is
 * the deal?) happens in {@link extractDealFromEmail}.
 */
export const RawEmail = z
  .object({
    /** Provider message id (e.g. Gmail message id), stored for idempotency. */
    messageId: Id.optional(),
    /** The `Subject:` header, trimmed. */
    subject: z.string().trim().default(""),
    /** The parsed `From:` address. */
    from: EmailAddress,
    /** Parsed `To:` recipients (may be empty). */
    to: z.array(EmailAddress).default([]),
    /** Parsed `Cc:` recipients (may be empty). */
    cc: z.array(EmailAddress).default([]),
    /** The `Date:` header normalized to an ISO-8601 timestamp, if parseable. */
    date: IsoDateTime.optional(),
    /** The plain-text body with quoted replies / signatures left intact. */
    body: z.string().default(""),
  })
  .strict();
export type RawEmail = z.infer<typeof RawEmail>;

/** Months for parsing RFC-2822 `Date:` headers without relying on `Date.parse`. */
const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Parse an RFC-2822 `Date:` header (e.g.
 * `Mon, 12 Jan 2026 09:30:00 +0200`) into a normalized ISO-8601 string
 * (`2026-01-12T07:30:00.000Z`). Returns `undefined` if the header doesn't match
 * the expected shape — we never guess, to keep parsing deterministic.
 *
 * Deliberately does NOT use `new Date(str)`: that is locale/engine dependent and
 * non-deterministic for many inputs. This hand-rolled parser is offline and
 * stable.
 */
export function parseEmailDate(raw: string): string | undefined {
  const s = raw.trim();
  // [Day,] DD Mon YYYY HH:MM[:SS] (+ZZZZ | -ZZZZ | Z | GMT)
  const m = s.match(
    /^(?:[A-Za-z]{3},\s*)?(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?\s*(Z|GMT|UTC|[+-]\d{4})?$/,
  );
  if (!m) return undefined;
  const [, dd, monRaw, yyyy, hh, min, ss, tz] = m;
  const month = MONTHS[monRaw.toLowerCase()];
  if (!month) return undefined;
  const day = Number(dd);
  const year = Number(yyyy);
  const hour = Number(hh);
  const minute = Number(min);
  const second = ss ? Number(ss) : 0;

  // Validate the calendar date.
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const check = new Date(utcGuess);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return undefined;
  }

  // Resolve the timezone offset to minutes east of UTC.
  let offsetMinutes = 0;
  if (tz && tz !== "Z" && tz !== "GMT" && tz !== "UTC") {
    const sign = tz[0] === "-" ? -1 : 1;
    const oh = Number(tz.slice(1, 3));
    const om = Number(tz.slice(3, 5));
    offsetMinutes = sign * (oh * 60 + om);
  }

  const utcMs = utcGuess - offsetMinutes * 60_000;
  return new Date(utcMs).toISOString();
}

/**
 * Parse an address-list header value into structured {@link EmailAddress}es.
 * Handles `"Name" <addr>`, `Name <addr>`, and bare `addr` forms, comma- or
 * semicolon-separated. Entries without a valid email are skipped (we never
 * fabricate an address).
 */
export function parseAddressList(value: string): EmailAddress[] {
  if (!value.trim()) return [];
  const out: EmailAddress[] = [];
  for (const part of value.split(/[,;]/)) {
    const piece = part.trim();
    if (!piece) continue;
    const angled = piece.match(/^(.*?)<([^>]+)>\s*$/);
    let name: string | undefined;
    let email: string;
    if (angled) {
      name = angled[1].trim().replace(/^"(.*)"$/, "$1").trim() || undefined;
      email = angled[2].trim();
    } else {
      email = piece;
    }
    const parsed = EmailAddress.safeParse(name ? { name, email } : { email });
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/** Header keys we recognize, normalized to lower-case. */
const HEADER_KEYS = new Set([
  "subject",
  "from",
  "to",
  "cc",
  "date",
  "message-id",
]);

/**
 * Split a raw RFC-822-style email string into headers + body. The first blank
 * line separates the header block from the body. Header lines that begin with
 * whitespace are folded onto the previous header (RFC-822 continuation). If no
 * blank line is present, the whole input is treated as the body.
 */
function splitHeadersAndBody(raw: string): {
  headers: Map<string, string>;
  body: string;
} {
  const normalized = raw.replace(/\r\n/g, "\n");
  const blank = normalized.indexOf("\n\n");
  const headerBlock = blank === -1 ? "" : normalized.slice(0, blank);
  const body = blank === -1 ? normalized : normalized.slice(blank + 2);

  const headers = new Map<string, string>();
  let lastKey: string | null = null;
  for (const line of headerBlock.split("\n")) {
    if (/^\s/.test(line) && lastKey) {
      // Folded continuation of the previous header.
      headers.set(lastKey, `${headers.get(lastKey) ?? ""} ${line.trim()}`);
      continue;
    }
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const val = line.slice(idx + 1).trim();
    if (!HEADER_KEYS.has(key)) {
      lastKey = null;
      continue;
    }
    headers.set(key, val);
    lastKey = key;
  }
  return { headers, body };
}

/**
 * Input to {@link parseRawEmail}: either a single raw RFC-822 string, or an
 * already-split object (e.g. coming straight from a Gmail API payload that the
 * *caller* fetched). Both paths are pure/offline.
 */
export type RawEmailInput =
  | string
  | {
      messageId?: string;
      subject?: string;
      from: string;
      to?: string;
      cc?: string;
      date?: string;
      body: string;
    };

/**
 * Parse an email into a validated {@link RawEmail}. Accepts either a raw
 * RFC-822 string or a pre-split object. Throws (via Zod) only if the `From`
 * address is missing/invalid — everything else degrades gracefully so a weird
 * email never crashes ingestion.
 */
export function parseRawEmail(input: RawEmailInput): RawEmail {
  let fields: {
    messageId?: string;
    subject: string;
    fromRaw: string;
    toRaw: string;
    ccRaw: string;
    dateRaw?: string;
    body: string;
  };

  if (typeof input === "string") {
    const { headers, body } = splitHeadersAndBody(input);
    fields = {
      messageId: headers.get("message-id"),
      subject: headers.get("subject") ?? "",
      fromRaw: headers.get("from") ?? "",
      toRaw: headers.get("to") ?? "",
      ccRaw: headers.get("cc") ?? "",
      dateRaw: headers.get("date"),
      body,
    };
  } else {
    fields = {
      messageId: input.messageId,
      subject: input.subject ?? "",
      fromRaw: input.from,
      toRaw: input.to ?? "",
      ccRaw: input.cc ?? "",
      dateRaw: input.date,
      body: input.body,
    };
  }

  const from = parseAddressList(fields.fromRaw)[0];
  const date = fields.dateRaw ? parseEmailDate(fields.dateRaw) : undefined;

  return RawEmail.parse({
    messageId: fields.messageId,
    subject: fields.subject,
    from,
    to: parseAddressList(fields.toRaw),
    cc: parseAddressList(fields.ccRaw),
    date,
    body: fields.body,
  });
}
