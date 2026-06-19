import * as z from "zod";

import { AssetClass } from "../../model/asset-class";
import { NonNegativeMoneySchema } from "../../model/primitives";
import { ContactRole } from "../contact";
import { RawEmail } from "./raw-email";

/**
 * Semantic extraction for the Gmail deal-email ingestion pipeline.
 *
 * READ-ONLY product: this turns a {@link RawEmail} (text that already arrived)
 * into a structured, *proposed* deal record a human can review before anything
 * is created. It never writes to Gmail, never sends, never moves money, and
 * never auto-creates a deal — it only produces a suggestion. Extraction is pure
 * and deterministic: same email in → same result out, fully offline.
 */

/** Currency symbols / codes we recognize, mapped to ISO-4217 codes. */
const CURRENCY_BY_SYMBOL: Record<string, string> = {
  "€": "EUR",
  $: "USD",
  "£": "GBP",
  "¥": "JPY",
};

const CURRENCY_CODES = new Set([
  "EUR",
  "USD",
  "GBP",
  "JPY",
  "CHF",
  "SEK",
  "NOK",
  "DKK",
]);

/** Magnitude suffixes used in deal sizes, with their decimal multiplier. */
const MAGNITUDES: Record<string, number> = {
  k: 1_000,
  m: 1_000_000,
  mm: 1_000_000,
  bn: 1_000_000_000,
  b: 1_000_000_000,
};

const MAGNITUDE_WORDS: Record<string, number> = {
  thousand: 1_000,
  million: 1_000_000,
  billion: 1_000_000_000,
};

/**
 * Multiply a decimal string (e.g. "4.5") by an integer factor (e.g. 1_000_000)
 * exactly, without floating point, returning a normalized decimal string with
 * no trailing zeros beyond what's significant ("4500000"). Keeps cents when the
 * input has them and the factor doesn't fully absorb them.
 */
export function scaleDecimal(value: string, factor: number): string {
  const neg = value.startsWith("-");
  const unsigned = neg ? value.slice(1) : value;
  const [intPart, fracPart = ""] = unsigned.split(".");
  // Work in the smallest unit implied by the fractional digits.
  const digits = `${intPart}${fracPart}`.replace(/^0+(?=\d)/, "");
  const scale = fracPart.length; // number of fractional digits in input
  // value = digits * 10^-scale ; result = digits * factor * 10^-scale
  const product = BigInt(digits || "0") * BigInt(factor);
  const productStr = product.toString();

  let result: string;
  if (scale === 0) {
    result = productStr;
  } else {
    const padded = productStr.padStart(scale + 1, "0");
    const cut = padded.length - scale;
    const whole = padded.slice(0, cut);
    const frac = padded.slice(cut).replace(/0+$/, "");
    result = frac ? `${whole}.${frac}` : whole;
  }
  return neg ? `-${result}` : result;
}

/**
 * A money amount detected in free text, with the byte range it was found at so
 * callers can deduplicate or highlight. `amount` is an exact decimal string.
 */
export const MoneyMatch = z
  .object({
    amount: z.string(),
    currency: z.string(),
    /** Index of the first character of the match in the source text. */
    index: z.number().int().min(0),
  })
  .strict();
export type MoneyMatch = z.infer<typeof MoneyMatch>;

/**
 * Find money amounts in free text. Recognizes:
 *  - symbol/code prefix or suffix: `€4.5m`, `$2,000,000`, `EUR 4.5m`, `4.5m EUR`
 *  - magnitude suffixes (`k`, `m`, `mm`, `bn`) and words (`million`, `billion`)
 * Returns matches in document order. Amounts are exact decimal strings (no
 * floating point); thousands separators are stripped.
 */
export function findMoneyAmounts(text: string): MoneyMatch[] {
  const matches: MoneyMatch[] = [];
  // currency-symbol-or-code  amount  magnitude?   OR   amount magnitude? currency-code
  const re =
    /(?<sym>[€$£¥]|\b(?:EUR|USD|GBP|JPY|CHF|SEK|NOK|DKK)\b)?\s*(?<num>\d{1,3}(?:[,\s]\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)\s*(?<mag>thousand|million|billion|mm|bn|[kmb])?\b\s*(?<code>EUR|USD|GBP|JPY|CHF|SEK|NOK|DKK)?/gi;

  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const g = m.groups!;
    const symRaw = g.sym;
    const code = g.code;
    if (!symRaw && !code) continue; // require an explicit currency to avoid false positives
    if (m[0].trim() === "") {
      re.lastIndex += 1;
      continue;
    }

    let currency: string | undefined;
    if (symRaw) {
      const upper = symRaw.toUpperCase();
      currency = CURRENCY_BY_SYMBOL[symRaw] ?? (CURRENCY_CODES.has(upper) ? upper : undefined);
    }
    if (!currency && code) {
      const upper = code.toUpperCase();
      if (CURRENCY_CODES.has(upper)) currency = upper;
    }
    if (!currency) continue;

    const numClean = g.num.replace(/[,\s]/g, "");
    if (!/^\d+(\.\d+)?$/.test(numClean)) continue;

    let amount = numClean;
    if (g.mag) {
      const mag = g.mag.toLowerCase();
      const factor = MAGNITUDE_WORDS[mag] ?? MAGNITUDES[mag];
      if (factor) amount = scaleDecimal(numClean, factor);
    }

    matches.push({ amount, currency, index: m.index });
  }
  return matches;
}

/**
 * Keyword → {@link ContactRole} hints. Matched case-insensitively against the
 * sender's display name, signature, and subject so a "broker" or "lawyer"
 * intro is classified sensibly. Defaults to `principal` when nothing matches
 * (an inbound deal email is most often from the counterparty principal).
 */
const ROLE_KEYWORDS: ReadonlyArray<readonly [RegExp, ContactRole]> = [
  [/\b(broker|banker|advisor(?:y)?|m&a|intermediary|agent)\b/i, "broker"],
  [/\b(lawyer|counsel|attorney|solicitor|legal)\b/i, "lawyer"],
  [/\b(introduc|referr|connect you)\b/i, "introducer"],
  [/\b(founder|ceo|owner|seller|principal|gp\b)/i, "principal"],
];

/** Infer a contact role from free text (name + body), defaulting to principal. */
export function inferContactRole(text: string): ContactRole {
  for (const [re, role] of ROLE_KEYWORDS) {
    if (re.test(text)) return role;
  }
  return "principal";
}

/** Keyword → {@link AssetClass} hints for classifying the opportunity. */
const ASSET_KEYWORDS: ReadonlyArray<readonly [RegExp, AssetClass]> = [
  [/\b(forest|timber|woodland|forestry)\b/i, "forest"],
  [/\b(vineyard|winery)\b/i, "vineyard"],
  [/\bwine(s)?\b/i, "wine"],
  [/\b(art|painting|gallery|sculpture)\b/i, "art"],
  [/\bwatch(es)?\b/i, "watch"],
  [/\b(classic car|vintage car|automobile)\b/i, "car"],
  [/\blego\b/i, "lego"],
  [/\b(private equity|buyout|roll-?up|acquisition|stake|equity stake)\b/i, "pe"],
  [/\b(crypto|bitcoin|token|web3)\b/i, "crypto"],
];

/** Infer an asset class from free text, or `undefined` if no keyword matches. */
export function inferAssetClass(text: string): AssetClass | undefined {
  for (const [re, cls] of ASSET_KEYWORDS) {
    if (re.test(text)) return cls;
  }
  return undefined;
}

/**
 * A deterministic, slugified id derived from a label, with an optional prefix.
 * E.g. `slugId("contact", "Jane Doe")` → `"contact-jane-doe"`. Stable across
 * runs so re-ingesting the same email yields the same ids (idempotency).
 */
export function slugId(prefix: string, label: string): string {
  const slug = label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug ? `${prefix}-${slug}` : prefix;
}

/** Strip a quoted reply / forwarded chain and a trailing signature heuristically. */
export function stripQuotedAndSignature(body: string): string {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    // Common reply markers: "On <date> ... wrote:", ">", "-----Original Message-----".
    if (/^On .+wrote:\s*$/.test(line.trim())) break;
    if (/^-{2,}\s*Original Message\s*-{2,}/i.test(line.trim())) break;
    if (/^_{5,}$/.test(line.trim())) break;
    out.push(line);
  }
  // Trim a trailing signature block introduced by "-- ".
  const joined = out.join("\n");
  const sigIdx = joined.search(/\n-- \n/);
  return (sigIdx === -1 ? joined : joined.slice(0, sigIdx)).trim();
}

/**
 * The structured suggestion produced from a single deal email. This is NOT a
 * full {@link import("../deal").Deal} — it's a *draft* a human reviews. It maps
 * cleanly onto the deal model (a deal name, a primary contact, an inbound
 * `email` interaction, an optional amount + asset class) but intentionally omits
 * pipeline/stage placement, which is a human decision.
 */
export const DealEmailExtraction = z
  .object({
    /** Source provider message id, when known (idempotency key). */
    messageId: z.string().optional(),
    /** Suggested deal name (from the subject, cleaned of Re:/Fwd: prefixes). */
    dealName: z.string().trim().min(1),
    /** The primary contact parsed from the sender. */
    primaryContact: z
      .object({
        id: z.string(),
        name: z.string(),
        role: ContactRole,
        organization: z.string().optional(),
        email: z.string(),
      })
      .strict(),
    /** Suggested inbound `email` interaction summarizing the touchpoint. */
    interaction: z
      .object({
        id: z.string(),
        kind: z.literal("email"),
        direction: z.literal("inbound"),
        occurredAt: z.string().optional(),
        summary: z.string().trim().min(1),
        contactIds: z.array(z.string()),
      })
      .strict(),
    /** Detected indicative deal size, if any (exact decimal money). */
    amount: NonNegativeMoneySchema.optional(),
    /** Inferred asset class, if a keyword matched. */
    assetClass: AssetClass.optional(),
    /** Every money amount detected, for transparency / review. */
    moneyMatches: z.array(MoneyMatch),
    /** Confidence in [0,1]: rises with how many fields were confidently filled. */
    confidence: z.number().min(0).max(1),
  })
  .strict();
export type DealEmailExtraction = z.infer<typeof DealEmailExtraction>;

/** Remove leading `Re:`/`Fwd:`/`Fw:` prefixes from a subject line. */
export function cleanSubject(subject: string): string {
  return subject.replace(/^(\s*(re|fwd?|aw|sv)\s*:\s*)+/i, "").trim();
}

/**
 * Derive a person's display name from an {@link EmailAddress}: prefer the
 * header display name, else humanize the local-part (`jane.doe` → `Jane Doe`).
 */
function deriveName(addr: RawEmail["from"]): string {
  if (addr.name) return addr.name;
  const local = addr.email.split("@")[0];
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ") || addr.email;
}

/** Derive an organization name from the sender's email domain, if non-generic. */
function deriveOrganization(email: string): string | undefined {
  const domain = email.split("@")[1];
  if (!domain) return undefined;
  const generic = new Set([
    "gmail.com",
    "outlook.com",
    "hotmail.com",
    "yahoo.com",
    "icloud.com",
    "proton.me",
    "me.com",
  ]);
  if (generic.has(domain.toLowerCase())) return undefined;
  const base = domain.split(".")[0];
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/**
 * Extract a structured deal suggestion from a parsed {@link RawEmail}.
 *
 * Pure and deterministic. Picks the *largest* detected money amount as the
 * indicative deal size (deal emails usually quote it once, prominently). The
 * returned object is a *proposal* — nothing is created, sent, or moved.
 */
export function extractDealFromEmail(email: RawEmail): DealEmailExtraction {
  const cleanedBody = stripQuotedAndSignature(email.body);
  const dealName = cleanSubject(email.subject) || "Untitled deal (no subject)";

  const senderName = deriveName(email.from);
  const roleHintText = `${senderName} ${email.subject} ${cleanedBody}`;
  const role = inferContactRole(roleHintText);
  const organization = deriveOrganization(email.from.email);

  const contactId = slugId("contact", senderName);
  const primaryContact = {
    id: contactId,
    name: senderName,
    role,
    organization,
    email: email.from.email,
  };

  const moneyMatches = findMoneyAmounts(`${email.subject}\n${cleanedBody}`);
  // Largest amount = indicative deal size. Compare exactly via BigInt on the
  // integer part (deal sizes are large; cent-level ties don't matter for "max").
  let amount: { amount: string; currency: string } | undefined;
  if (moneyMatches.length > 0) {
    const largest = moneyMatches.reduce((a, b) =>
      compareDecimal(b.amount, a.amount) > 0 ? b : a,
    );
    amount = { amount: largest.amount, currency: largest.currency };
  }

  const assetClass = inferAssetClass(`${email.subject} ${cleanedBody}`);

  const interaction = {
    id: slugId("int", email.messageId ?? `${contactId}-${email.date ?? "email"}`),
    kind: "email" as const,
    direction: "inbound" as const,
    occurredAt: email.date,
    summary: dealName,
    contactIds: [contactId],
  };

  // Confidence: start at a baseline and add for each confidently filled slot.
  let confidence = 0.3;
  if (cleanSubject(email.subject)) confidence += 0.2;
  if (amount) confidence += 0.2;
  if (assetClass) confidence += 0.15;
  if (email.date) confidence += 0.1;
  if (organization) confidence += 0.05;
  confidence = Math.min(1, Number(confidence.toFixed(2)));

  return DealEmailExtraction.parse({
    messageId: email.messageId,
    dealName,
    primaryContact,
    interaction,
    amount,
    assetClass,
    moneyMatches,
    confidence,
  });
}

/**
 * Compare two non-negative decimal strings. Returns >0 if `a > b`, <0 if
 * `a < b`, 0 if equal. Exact (no floating point): compares integer parts via
 * BigInt, then fractional parts lexically after right-padding.
 */
export function compareDecimal(a: string, b: string): number {
  const [ai, af = ""] = a.split(".");
  const [bi, bf = ""] = b.split(".");
  const aInt = BigInt(ai);
  const bInt = BigInt(bi);
  if (aInt !== bInt) return aInt < bInt ? -1 : 1;
  const len = Math.max(af.length, bf.length);
  const ap = af.padEnd(len, "0");
  const bp = bf.padEnd(len, "0");
  if (ap === bp) return 0;
  return ap < bp ? -1 : 1;
}
