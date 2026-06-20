/**
 * m9-vault — Document & obligation vault.
 *
 * A **read-only** registry of family-office documents — subscription
 * agreements, side letters, insurance policies, trust deeds, lasting powers of
 * attorney (LPAs) — held as metadata linked to the owning legal entities, plus
 * an **offline obligation extractor** that parses key dates and amounts out of
 * fixture document text.
 *
 * Everything here is pure, deterministic and offline. The extractor never hits
 * a network or a live document store: it reads plain `text` carried on each
 * {@link VaultDocument} and produces structured {@link Obligation}s. Amounts are
 * modelled with {@link Money} (never floating-point currency).
 *
 * READ-ONLY product: this catalogues and analyses documents; it never signs,
 * sends, executes or amends anything.
 */

import { Money } from "@/lib/money";

/** The kinds of document the vault tracks. */
export type DocumentKind =
  | "subscription-agreement"
  | "side-letter"
  | "insurance-policy"
  | "trust-deed"
  | "lpa";

/** A legal entity a document is filed against (holdco, trust, person, …). */
export interface VaultEntity {
  readonly id: string;
  readonly name: string;
  readonly kind: "person" | "trust" | "holdco" | "foundation" | "fund";
}

/**
 * A document in the vault. Carries registry metadata plus the raw `text` the
 * obligation extractor parses. `text` is intentionally part of the model so the
 * whole pipeline stays offline and fixture-driven.
 */
export interface VaultDocument {
  readonly id: string;
  /** Human-facing title. */
  readonly title: string;
  readonly kind: DocumentKind;
  /** Entity ids this document is linked to (≥ 1). */
  readonly entityIds: readonly string[];
  /** Counterparty / issuer (fund manager, insurer, settlor…). */
  readonly counterparty: string;
  /** ISO-8601 date the document was executed / dated. */
  readonly executedOn: string;
  /** Base currency obligations in this document are denominated in. */
  readonly currency: string;
  /** Free-text body the extractor reads. Kept short & deterministic. */
  readonly text: string;
}

/** The vault itself: the entity directory plus the filed documents. */
export interface Vault {
  readonly entities: readonly VaultEntity[];
  readonly documents: readonly VaultDocument[];
}

/** Category of a parsed obligation. */
export type ObligationKind =
  | "capital-call" // money the family must wire on a date
  | "premium" // recurring insurance premium
  | "distribution" // money expected to be received
  | "deadline" // a dated action with no amount (e.g. election, renewal)
  | "fee"; // a fixed/management fee amount

/**
 * A structured obligation extracted from a document's text.
 *
 * `dueOn` is an ISO date (`YYYY-MM-DD`). `amount` is present for monetary
 * obligations and absent for pure deadlines.
 */
export interface Obligation {
  readonly id: string;
  readonly documentId: string;
  readonly kind: ObligationKind;
  /** Short human description, taken verbatim-ish from the matched clause. */
  readonly description: string;
  readonly dueOn: string;
  readonly amount?: Money;
}

/* ------------------------------------------------------------------ *
 * Date parsing
 * ------------------------------------------------------------------ */

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/**
 * Parse a single date in one of two accepted, unambiguous forms:
 *   - ISO: `2026-09-30`
 *   - long: `30 September 2026` or `September 30, 2026`
 *
 * Returns the ISO `YYYY-MM-DD` string, or `null` when no date is found at the
 * start of `fragment`'s first match. Day/month ranges are validated so a
 * malformed `2026-13-40` is rejected.
 */
export function parseDate(fragment: string): string | null {
  const iso = fragment.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const [, y, m, d] = iso;
    const month = Number(m);
    const day = Number(d);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${y}-${m}-${d}`;
    }
  }

  // "30 September 2026"
  const dmy = fragment.match(/\b(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\b/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = MONTHS[dmy[2].toLowerCase()];
    const year = Number(dmy[3]);
    if (month && day >= 1 && day <= 31) {
      return `${year}-${pad2(month)}-${pad2(day)}`;
    }
  }

  // "September 30, 2026"
  const mdy = fragment.match(/\b([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})\b/);
  if (mdy) {
    const month = MONTHS[mdy[1].toLowerCase()];
    const day = Number(mdy[2]);
    const year = Number(mdy[3]);
    if (month && day >= 1 && day <= 31) {
      return `${year}-${pad2(month)}-${pad2(day)}`;
    }
  }

  return null;
}

/* ------------------------------------------------------------------ *
 * Amount parsing
 * ------------------------------------------------------------------ */

/** Map of currency words/symbols → ISO-4217 codes the extractor understands. */
const CURRENCY_TOKENS: Record<string, string> = {
  $: "USD",
  "us$": "USD",
  usd: "USD",
  "€": "EUR",
  eur: "EUR",
  "£": "GBP",
  gbp: "GBP",
  chf: "CHF",
};

/**
 * Parse a money amount out of `fragment`, honouring an explicit currency token
 * (symbol or code) immediately before the number; falls back to
 * `defaultCurrency`. Understands thousands separators and a `million`/`m`
 * suffix. Returns `null` when no amount is present.
 *
 * To avoid mistaking a bare date/year (e.g. the `2026` in `2026-09-30`) for an
 * amount, a number with **no** explicit currency token must be "money-shaped":
 * it must carry a thousands separator, a decimal part, or a scale word. A bare
 * untokenised integer (like a year) is therefore not treated as money.
 *
 * Examples: `$1,250,000`, `USD 1,250,000`, `EUR 2.5 million`, `£500k`.
 */
export function parseAmount(
  fragment: string,
  defaultCurrency: string,
): Money | null {
  // currency token (optional) + number (+ optional scale word). Scanned
  // globally so an earlier non-money number (e.g. a date's year) is skipped
  // rather than aborting the parse.
  const re =
    /(us\$|usd|eur|gbp|chf|[$€£])?\s*([\d][\d,]*(?:\.\d+)?)\s*(million|mn|m|thousand|k)?/gi;

  for (const m of fragment.matchAll(re)) {
    const token = m[1]?.toLowerCase();
    const rawMatch = m[2];
    const rawNumber = rawMatch.replace(/,/g, "");
    const scaleWord = m[3]?.toLowerCase();

    if (rawNumber === "" || Number.isNaN(Number(rawNumber))) continue;

    // Without an explicit currency token, only accept "money-shaped" numbers:
    // a thousands separator, a decimal point, or a scale word. This stops a
    // bare year (e.g. `2026` from an ISO date) from being read as money.
    if (!token) {
      const moneyShaped =
        rawMatch.includes(",") || rawMatch.includes(".") || scaleWord != null;
      if (!moneyShaped) continue;
    }

    let value = Money.of(
      rawNumber,
      token ? CURRENCY_TOKENS[token] : defaultCurrency,
    );

    if (scaleWord === "million" || scaleWord === "mn" || scaleWord === "m") {
      value = value.times(1_000_000);
    } else if (scaleWord === "thousand" || scaleWord === "k") {
      value = value.times(1_000);
    }

    return value;
  }

  return null;
}

/* ------------------------------------------------------------------ *
 * Obligation extraction
 * ------------------------------------------------------------------ */

interface ClauseRule {
  readonly kind: ObligationKind;
  /**
   * Trigger pattern. The clause (a single line) must match this to be
   * considered. The matched line is then mined for a date and (for monetary
   * kinds) an amount.
   */
  readonly trigger: RegExp;
  /** Whether an amount is required for the obligation to be emitted. */
  readonly needsAmount: boolean;
}

/**
 * Ordered clause rules. Each input line is tested against rules in order and
 * the FIRST matching rule wins, so more specific patterns precede generic ones.
 */
const CLAUSE_RULES: readonly ClauseRule[] = [
  {
    kind: "capital-call",
    trigger: /\bcapital call\b|\bdrawdown\b|\bcommitment.*\bdue\b/i,
    needsAmount: true,
  },
  {
    kind: "premium",
    trigger: /\bpremium\b/i,
    needsAmount: true,
  },
  {
    kind: "distribution",
    trigger: /\bdistribution\b|\bredemption\b/i,
    needsAmount: true,
  },
  {
    kind: "fee",
    trigger: /\bmanagement fee\b|\badministration fee\b|\bfee of\b/i,
    needsAmount: true,
  },
  {
    kind: "deadline",
    trigger:
      /\b(election|notice|renewal|expir(?:y|es|ation)|review|deadline|by no later than|on or before)\b/i,
    needsAmount: false,
  },
];

/** Split a document body into trimmed, non-empty clause lines. */
function clauseLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/**
 * Extract structured obligations from a single document.
 *
 * Each non-empty line is matched against {@link CLAUSE_RULES}; the first rule
 * whose trigger matches mines the line for a `dueOn` date and (when required) an
 * `amount`. Lines without a recognisable date, or monetary clauses without a
 * parseable amount, are skipped — the extractor is conservative and only emits
 * obligations it can fully pin down. Results are sorted by `dueOn` ascending,
 * then by id for stability.
 */
export function extractObligations(doc: VaultDocument): Obligation[] {
  const out: Obligation[] = [];
  let seq = 0;

  for (const line of clauseLines(doc.text)) {
    const rule = CLAUSE_RULES.find((r) => r.trigger.test(line));
    if (!rule) continue;

    const dueOn = parseDate(line);
    if (!dueOn) continue;

    let amount: Money | undefined;
    if (rule.needsAmount) {
      const parsed = parseAmount(line, doc.currency);
      if (!parsed) continue;
      amount = parsed;
    }

    out.push({
      id: `${doc.id}-ob${seq}`,
      documentId: doc.id,
      kind: rule.kind,
      description: line,
      dueOn,
      amount,
    });
    seq += 1;
  }

  return out.sort((a, b) =>
    a.dueOn === b.dueOn ? a.id.localeCompare(b.id) : a.dueOn.localeCompare(b.dueOn),
  );
}

/** Extract obligations across every document in a vault, globally date-sorted. */
export function extractVaultObligations(vault: Vault): Obligation[] {
  return vault.documents
    .flatMap((d) => extractObligations(d))
    .sort((a, b) =>
      a.dueOn === b.dueOn
        ? a.id.localeCompare(b.id)
        : a.dueOn.localeCompare(b.dueOn),
    );
}

/* ------------------------------------------------------------------ *
 * Registry views
 * ------------------------------------------------------------------ */

/** A document joined to its resolved entities and extracted obligations. */
export interface DocumentView {
  readonly document: VaultDocument;
  readonly entities: readonly VaultEntity[];
  readonly obligations: readonly Obligation[];
}

/** Resolve a vault into joined {@link DocumentView}s (registry-ready). */
export function buildRegistry(vault: Vault): DocumentView[] {
  const byId = new Map(vault.entities.map((e) => [e.id, e]));
  return vault.documents.map((document) => ({
    document,
    entities: document.entityIds
      .map((id) => byId.get(id))
      .filter((e): e is VaultEntity => e != null),
    obligations: extractObligations(document),
  }));
}

/** Human label for a {@link DocumentKind}. */
export function documentKindLabel(kind: DocumentKind): string {
  switch (kind) {
    case "subscription-agreement":
      return "Subscription agreement";
    case "side-letter":
      return "Side letter";
    case "insurance-policy":
      return "Insurance policy";
    case "trust-deed":
      return "Trust deed";
    case "lpa":
      return "Lasting power of attorney";
  }
}

/** Human label for an {@link ObligationKind}. */
export function obligationKindLabel(kind: ObligationKind): string {
  switch (kind) {
    case "capital-call":
      return "Capital call";
    case "premium":
      return "Premium";
    case "distribution":
      return "Distribution";
    case "deadline":
      return "Deadline";
    case "fee":
      return "Fee";
  }
}

/**
 * Total of all monetary obligations of a given outflow kind across a list of
 * obligations, in `currency`. Pure reporting — moves no money.
 */
export function totalByKind(
  obligations: readonly Obligation[],
  kind: ObligationKind,
  currency: string,
): Money {
  return obligations
    .filter((o) => o.kind === kind && o.amount && o.amount.currency === currency)
    .reduce((acc, o) => acc.plus(o.amount as Money), Money.zero(currency));
}
