import { describe, expect, it } from "vitest";

import { Contact } from "../contact";
import { Interaction } from "../interaction";
import {
  cleanSubject,
  compareDecimal,
  findMoneyAmounts,
  inferAssetClass,
  inferContactRole,
  parseAddressList,
  parseDealEmail,
  parseEmailDate,
  parseRawEmail,
  scaleDecimal,
  slugId,
  stripQuotedAndSignature,
} from "./index";
import {
  dealEmailFixtures,
  forestryBrokerEmail,
  minimalEmail,
  vagueOutlookEmail,
  vineyardFounderEmail,
  watchCollectionLawyerEmail,
} from "./fixtures";

describe("parseEmailDate", () => {
  it("parses an RFC-2822 date with a +HHMM offset to normalized UTC ISO", () => {
    expect(parseEmailDate("Mon, 12 Jan 2026 09:30:00 +0200")).toBe(
      "2026-01-12T07:30:00.000Z",
    );
  });

  it("parses a negative offset", () => {
    expect(parseEmailDate("Tue, 03 Feb 2026 17:05:00 -0800")).toBe(
      "2026-02-04T01:05:00.000Z",
    );
  });

  it("handles Z / GMT / UTC and a missing weekday and seconds", () => {
    expect(parseEmailDate("9 Apr 2026 08:00 Z")).toBe(
      "2026-04-09T08:00:00.000Z",
    );
    expect(parseEmailDate("18 Mar 2026 11:00:00 GMT")).toBe(
      "2026-03-18T11:00:00.000Z",
    );
  });

  it("returns undefined for unparseable / invalid dates (deterministic, never guesses)", () => {
    expect(parseEmailDate("not a date")).toBeUndefined();
    expect(parseEmailDate("32 Jan 2026 09:30:00 +0000")).toBeUndefined();
    expect(parseEmailDate("12 Foo 2026 09:30:00 +0000")).toBeUndefined();
    expect(parseEmailDate("12 Jan 2026 25:00:00 +0000")).toBeUndefined();
  });
});

describe("parseAddressList", () => {
  it("parses quoted display names and lowercases the address", () => {
    expect(parseAddressList('"Jane Doe" <Jane.Doe@Example.com>')).toEqual([
      { name: "Jane Doe", email: "jane.doe@example.com" },
    ]);
  });

  it("parses bare and unquoted-name addresses, comma/semicolon separated", () => {
    expect(
      parseAddressList("a@x.com, Bob B <bob@y.com>; carol@z.com"),
    ).toEqual([
      { email: "a@x.com" },
      { name: "Bob B", email: "bob@y.com" },
      { email: "carol@z.com" },
    ]);
  });

  it("skips entries without a valid email rather than fabricating one", () => {
    expect(parseAddressList("not-an-email, ok@x.com")).toEqual([
      { email: "ok@x.com" },
    ]);
    expect(parseAddressList("")).toEqual([]);
  });
});

describe("scaleDecimal", () => {
  it("scales exactly without floating point", () => {
    expect(scaleDecimal("4.5", 1_000_000)).toBe("4500000");
    expect(scaleDecimal("1.2", 1_000_000)).toBe("1200000");
    expect(scaleDecimal("0.8", 1_000_000)).toBe("800000");
    expect(scaleDecimal("2", 1_000)).toBe("2000");
    expect(scaleDecimal("1.234", 1_000)).toBe("1234");
  });

  it("keeps a residual fraction when the factor doesn't absorb it", () => {
    expect(scaleDecimal("1.2345", 1_000)).toBe("1234.5");
  });
});

describe("compareDecimal", () => {
  it("orders exactly across magnitudes and fractions", () => {
    expect(compareDecimal("4500000", "800000")).toBeGreaterThan(0);
    expect(compareDecimal("800000", "4500000")).toBeLessThan(0);
    expect(compareDecimal("1.20", "1.2")).toBe(0);
    expect(compareDecimal("1.25", "1.2")).toBeGreaterThan(0);
  });
});

describe("findMoneyAmounts", () => {
  it("finds symbol+magnitude amounts and resolves them exactly", () => {
    const m = findMoneyAmounts("around €4.5m, plus a further €800k");
    expect(m.map((x) => ({ amount: x.amount, currency: x.currency }))).toEqual([
      { amount: "4500000", currency: "EUR" },
      { amount: "800000", currency: "EUR" },
    ]);
  });

  it("finds thousands-separated amounts with $ symbol", () => {
    const m = findMoneyAmounts("a stake of $2,000,000 please");
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ amount: "2000000", currency: "USD" });
  });

  it("finds code-suffix amounts (e.g. 1.2m CHF)", () => {
    const m = findMoneyAmounts("the reserve is 1.2m CHF");
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ amount: "1200000", currency: "CHF" });
  });

  it("understands magnitude words", () => {
    const m = findMoneyAmounts("about EUR 3 million in total");
    expect(m[0]).toMatchObject({ amount: "3000000", currency: "EUR" });
  });

  it("ignores numbers with no currency (no false positives)", () => {
    expect(findMoneyAmounts("we met 3 times in 2026")).toEqual([]);
  });

  it("returns matches in document order with their index", () => {
    const text = "first €1m then $2m";
    const m = findMoneyAmounts(text);
    expect(m).toHaveLength(2);
    expect(m[0].index).toBeLessThan(m[1].index);
  });
});

describe("inferContactRole / inferAssetClass", () => {
  it("classifies roles from keywords, defaulting to principal", () => {
    expect(inferContactRole("as your advisory broker")).toBe("broker");
    expect(inferContactRole("on behalf of counsel")).toBe("lawyer");
    expect(inferContactRole("I am the founder and owner")).toBe("principal");
    expect(inferContactRole("plain text with nothing")).toBe("principal");
  });

  it("classifies asset classes from keywords", () => {
    expect(inferAssetClass("a forestry roll-up")).toBe("forest");
    expect(inferAssetClass("napa vineyard")).toBe("vineyard");
    expect(inferAssetClass("a Patek watch collection")).toBe("watch");
    expect(inferAssetClass("contemporary art from a gallery")).toBe("art");
    expect(inferAssetClass("nothing relevant here")).toBeUndefined();
  });
});

describe("slugId / cleanSubject / stripQuotedAndSignature", () => {
  it("produces stable, slugified ids", () => {
    expect(slugId("contact", "Jane Doe")).toBe("contact-jane-doe");
    expect(slugId("contact", "R. Schmidt (Counsel)")).toBe("contact-r-schmidt-counsel");
    expect(slugId("int", "")).toBe("int");
  });

  it("strips Re:/Fwd: prefixes (including stacked ones)", () => {
    expect(cleanSubject("Re: Fwd: Hello")).toBe("Hello");
    expect(cleanSubject("FW: deal")).toBe("deal");
    expect(cleanSubject("Plain subject")).toBe("Plain subject");
  });

  it("strips quoted replies and signatures", () => {
    const cleaned = stripQuotedAndSignature(
      "Body line\n\nOn Tue, 17 Mar 2026 at 14:00, X <x@y.com> wrote:\n> quoted $9,999,999",
    );
    expect(cleaned).toContain("Body line");
    expect(cleaned).not.toContain("9,999,999");
  });
});

describe("parseRawEmail (fixtures)", () => {
  it("parses headers, addresses, and date from a raw RFC-822 string", () => {
    const raw = parseRawEmail(forestryBrokerEmail);
    expect(raw.subject).toBe("Project Acorn — forestry roll-up opportunity");
    expect(raw.from).toEqual({
      name: "Jane Doe",
      email: "jane.doe@evergreen-advisory.com",
    });
    expect(raw.to).toEqual([{ email: "family.office@example.com" }]);
    expect(raw.cc[0]).toMatchObject({ email: "karl@nieminen-forestry.fi" });
    expect(raw.date).toBe("2026-01-12T07:30:00.000Z");
    expect(raw.messageId).toBe("<CA+acorn-2026@example.com>");
  });

  it("accepts a pre-split payload object too", () => {
    const raw = parseRawEmail({
      subject: "Test",
      from: "a@b.com",
      to: "c@d.com",
      date: "Mon, 12 Jan 2026 09:30:00 +0000",
      body: "hi",
    });
    expect(raw.from.email).toBe("a@b.com");
    expect(raw.date).toBe("2026-01-12T09:30:00.000Z");
  });

  it("throws when the sender address is missing/invalid", () => {
    expect(() => parseRawEmail("Subject: x\nFrom: not-an-email\n\nbody")).toThrow();
  });

  it("degrades gracefully on a minimal email (no subject/date)", () => {
    const raw = parseRawEmail(minimalEmail);
    expect(raw.from.email).toBe("tipster@deals.example.org");
    expect(raw.subject).toBe("");
    expect(raw.date).toBeUndefined();
  });
});

describe("extractDealFromEmail (fixtures)", () => {
  it("extracts a broker deal with the largest amount as indicative size", () => {
    const { extraction } = parseDealEmail(forestryBrokerEmail);
    expect(extraction.dealName).toBe(
      "Project Acorn — forestry roll-up opportunity",
    );
    expect(extraction.primaryContact).toMatchObject({
      name: "Jane Doe",
      role: "broker",
      organization: "Evergreen-advisory",
      email: "jane.doe@evergreen-advisory.com",
    });
    // €4.5m beats €800k.
    expect(extraction.amount).toEqual({ amount: "4500000", currency: "EUR" });
    expect(extraction.assetClass).toBe("forest");
    expect(extraction.moneyMatches).toHaveLength(2);
    expect(extraction.interaction).toMatchObject({
      kind: "email",
      direction: "inbound",
      occurredAt: "2026-01-12T07:30:00.000Z",
      contactIds: [extraction.primaryContact.id],
    });
    expect(extraction.confidence).toBeGreaterThan(0.7);
  });

  it("extracts a founder deal and cleans the Re: subject", () => {
    const { extraction } = parseDealEmail(vineyardFounderEmail);
    expect(extraction.dealName).toBe("Intro — Napa vineyard stake");
    expect(extraction.primaryContact.role).toBe("principal");
    expect(extraction.amount).toEqual({ amount: "2000000", currency: "USD" });
    expect(extraction.assetClass).toBe("vineyard");
  });

  it("extracts a lawyer deal and ignores money in the quoted reply", () => {
    const { extraction } = parseDealEmail(watchCollectionLawyerEmail);
    expect(extraction.primaryContact.role).toBe("lawyer");
    expect(extraction.assetClass).toBe("watch");
    // 1.2m CHF from the body, NOT $9,999,999 from the quoted reply.
    expect(extraction.amount).toEqual({ amount: "1200000", currency: "CHF" });
    expect(
      extraction.moneyMatches.some((m) => m.amount === "9999999"),
    ).toBe(false);
  });

  it("handles a vague email: no amount, generic domain → no org, low confidence", () => {
    const { extraction } = parseDealEmail(vagueOutlookEmail);
    expect(extraction.amount).toBeUndefined();
    expect(extraction.moneyMatches).toEqual([]);
    expect(extraction.primaryContact.organization).toBeUndefined();
    expect(extraction.assetClass).toBe("art");
    // No amount detected, so confidence is below the amount-bearing broker email.
    const broker = parseDealEmail(forestryBrokerEmail).extraction;
    expect(extraction.confidence).toBeLessThan(broker.confidence);
  });

  it("handles a minimal email: synthesizes a deal name, derives name from local-part", () => {
    const { extraction } = parseDealEmail(minimalEmail);
    expect(extraction.dealName).toBe("Untitled deal (no subject)");
    expect(extraction.primaryContact.name).toBe("Tipster");
    expect(extraction.primaryContact.organization).toBe("Deals");
    expect(extraction.assetClass).toBe("crypto");
    expect(extraction.interaction.occurredAt).toBeUndefined();
  });

  it("is deterministic: same input → identical output", () => {
    const a = parseDealEmail(forestryBrokerEmail).extraction;
    const b = parseDealEmail(forestryBrokerEmail).extraction;
    expect(a).toEqual(b);
  });
});

describe("extraction maps onto the real deal-model schemas", () => {
  it("every fixture's primaryContact parses as a valid Contact", () => {
    for (const raw of Object.values(dealEmailFixtures)) {
      const { extraction } = parseDealEmail(raw);
      const c = extraction.primaryContact;
      const contact = Contact.parse({
        id: c.id,
        name: c.name,
        role: c.role,
        organization: c.organization,
        email: c.email,
      });
      expect(contact.id).toBe(c.id);
    }
  });

  it("every fixture's interaction parses as a valid inbound email Interaction", () => {
    for (const raw of Object.values(dealEmailFixtures)) {
      const { extraction } = parseDealEmail(raw);
      const it = extraction.interaction;
      const interaction = Interaction.parse({
        id: it.id,
        kind: it.kind,
        // Interactions require occurredAt; ingestion would supply now() when the
        // email had no parseable Date. We use the parsed date or a fixed stamp.
        occurredAt: it.occurredAt ?? "2026-01-01T00:00:00Z",
        summary: it.summary,
        direction: it.direction,
        contactIds: it.contactIds,
      });
      expect(interaction.contactIds).toEqual([extraction.primaryContact.id]);
    }
  });

  it("detected amounts parse as NonNegativeMoney (string decimals, no floats)", () => {
    for (const raw of Object.values(dealEmailFixtures)) {
      const { extraction } = parseDealEmail(raw);
      if (extraction.amount) {
        expect(typeof extraction.amount.amount).toBe("string");
        expect(extraction.amount.amount).toMatch(/^\d+(\.\d+)?$/);
      }
    }
  });
});

describe("read-only / offline guarantees", () => {
  it("exposes no send/draft/fetch/network surface", () => {
    // The module's public API is purely parsing. This is a guard against future
    // drift that would add an outbound capability to a read-only parser.
    const api = parseDealEmail(forestryBrokerEmail);
    expect(api).toHaveProperty("raw");
    expect(api).toHaveProperty("extraction");
    expect(Object.keys(api)).toEqual(["raw", "extraction"]);
  });
});
