import { describe, expect, it } from "vitest";

import { Money } from "@/lib/money";

import {
  buildRegistry,
  documentKindLabel,
  extractObligations,
  extractVaultObligations,
  obligationKindLabel,
  parseAmount,
  parseDate,
  totalByKind,
  type VaultDocument,
} from "./vault";
import { seededVault } from "./fixtures";

const usd = (a: string) => Money.of(a, "USD");

describe("parseDate", () => {
  it("parses ISO dates", () => {
    expect(parseDate("...due on 2026-09-30.")).toBe("2026-09-30");
  });

  it("parses '30 September 2026'", () => {
    expect(parseDate("executed on 20 June 2018 and")).toBe("2018-06-20");
  });

  it("parses 'September 30, 2026'", () => {
    expect(parseDate("registered on February 10, 2023.")).toBe("2023-02-10");
  });

  it("rejects an impossible ISO date", () => {
    expect(parseDate("no date 2026-13-40 here")).toBeNull();
  });

  it("returns null when there is no date", () => {
    expect(parseDate("a clause with no temporal anchor")).toBeNull();
  });
});

describe("parseAmount", () => {
  it("parses a $ amount with thousands separators", () => {
    expect(parseAmount("call of $2,500,000 is due", "USD")?.equals(usd("2500000"))).toBe(
      true,
    );
  });

  it("honours an explicit currency code over the default", () => {
    const m = parseAmount("premium of CHF 120,000 is due", "USD");
    expect(m?.currency).toBe("CHF");
    expect(m?.amount.toNumber()).toBe(120000);
  });

  it("expands a 'million' scale word", () => {
    expect(parseAmount("EUR 2.5 million", "USD")?.equals(Money.of("2500000", "EUR"))).toBe(
      true,
    );
  });

  it("expands a 'k' suffix", () => {
    expect(parseAmount("£500k", "GBP")?.equals(Money.of("500000", "GBP"))).toBe(true);
  });

  it("returns null when there is no number", () => {
    expect(parseAmount("no amount here", "USD")).toBeNull();
  });

  it("does not mistake a bare year inside an ISO date for an amount", () => {
    // The `2026` in the date must NOT be read as money.
    expect(parseAmount("renewal by no later than 2026-10-01", "USD")).toBeNull();
  });

  it("skips a leading non-money year and finds the real tokenised amount", () => {
    // Amount appears AFTER the date in the clause.
    const m = parseAmount("Premium due on 2026-01-15 of $50,000", "USD");
    expect(m?.equals(usd("50000"))).toBe(true);
  });

  it("requires a token, separator, decimal or scale for default-currency amounts", () => {
    // A bare untokenised integer is ambiguous (could be a year) → conservative null.
    expect(parseAmount("fee of 45000 annually", "USD")).toBeNull();
    // …but a thousands separator makes it unambiguous.
    expect(
      parseAmount("fee of 45,000 annually", "USD")?.equals(usd("45000")),
    ).toBe(true);
  });
});

describe("extractObligations — single document", () => {
  const doc = seededVault.documents.find((d) => d.id === "doc-sub-meridian")!;

  it("extracts exactly four obligations from the subscription agreement", () => {
    const obs = extractObligations(doc);
    expect(obs).toHaveLength(4);
  });

  it("parses each obligation's kind, date and amount exactly", () => {
    const obs = extractObligations(doc);
    // Sorted by dueOn ascending.
    expect(
      obs.map((o) => ({
        kind: o.kind,
        dueOn: o.dueOn,
        amount: o.amount?.toString() ?? null,
      })),
    ).toEqual([
      { kind: "fee", dueOn: "2026-01-15", amount: "2000000 USD" },
      { kind: "deadline", dueOn: "2026-08-15", amount: null },
      { kind: "capital-call", dueOn: "2026-09-30", amount: "2500000 USD" },
      { kind: "capital-call", dueOn: "2027-03-31", amount: "3000000 USD" },
    ]);
  });

  it("skips the commitment headline line (no due date) and the deadline carries no amount", () => {
    const obs = extractObligations(doc);
    expect(obs.every((o) => o.dueOn)).toBe(true);
    const deadline = obs.find((o) => o.kind === "deadline");
    expect(deadline?.amount).toBeUndefined();
  });

  it("emits stable, document-scoped ids", () => {
    const obs = extractObligations(doc);
    expect(obs.every((o) => o.id.startsWith("doc-sub-meridian-ob"))).toBe(true);
    expect(new Set(obs.map((o) => o.id)).size).toBe(obs.length);
  });
});

describe("extractObligations — insurance & trust", () => {
  it("reads a CHF premium and a renewal deadline from the policy", () => {
    const doc = seededVault.documents.find((d) => d.id === "doc-ins-zurich")!;
    const obs = extractObligations(doc);
    expect(
      obs.map((o) => ({ kind: o.kind, dueOn: o.dueOn, amount: o.amount?.toString() ?? null })),
    ).toEqual([
      { kind: "deadline", dueOn: "2026-10-01", amount: null },
      { kind: "premium", dueOn: "2026-11-01", amount: "120000 CHF" },
    ]);
  });

  it("reads the trust-deed review deadline and admin fee", () => {
    const doc = seededVault.documents.find((d) => d.id === "doc-trust-deed")!;
    const obs = extractObligations(doc);
    const kinds = obs.map((o) => o.kind).sort();
    expect(kinds).toEqual(["deadline", "fee"]);
    expect(obs.find((o) => o.kind === "fee")?.amount?.equals(usd("45000"))).toBe(true);
  });

  it("yields no monetary obligation for the LPA", () => {
    const doc = seededVault.documents.find((d) => d.id === "doc-lpa-touko")!;
    const obs = extractObligations(doc);
    expect(obs.every((o) => o.amount === undefined)).toBe(true);
    expect(obs.some((o) => o.kind === "deadline")).toBe(true);
  });
});

describe("extractObligations — adversarial clauses", () => {
  const make = (text: string): VaultDocument => ({
    id: "adv",
    title: "Adversarial",
    kind: "insurance-policy",
    entityIds: [],
    counterparty: "X",
    executedOn: "2025-01-01",
    currency: "USD",
    text,
  });

  it("skips a monetary clause that has a date but no parseable amount", () => {
    // 'premium' is a needsAmount kind; the only number is the date's year, which
    // is not money-shaped, so nothing should be emitted.
    expect(extractObligations(make("Premium is due on 2026-01-15."))).toEqual([]);
  });

  it("extracts the amount even when it follows the date in the clause", () => {
    const [ob] = extractObligations(
      make("Premium due on 2026-01-15 of $50,000."),
    );
    expect(ob.kind).toBe("premium");
    expect(ob.dueOn).toBe("2026-01-15");
    expect(ob.amount?.equals(Money.of("50000", "USD"))).toBe(true);
  });

  it("never reads a date's year as an obligation amount", () => {
    const obs = extractObligations(
      make("Capital call of $1,000,000 due on 2026-09-30."),
    );
    expect(obs).toHaveLength(1);
    expect(obs[0].amount?.equals(usd("1000000"))).toBe(true);
  });
});

describe("extractVaultObligations", () => {
  it("returns every obligation across the vault, globally date-sorted", () => {
    const obs = extractVaultObligations(seededVault);
    // Globally ascending by dueOn.
    const dates = obs.map((o) => o.dueOn);
    expect([...dates].sort()).toEqual(dates);
    // The earliest obligation is the subscription-agreement management fee.
    expect(obs[0].dueOn).toBe("2026-01-15");
    expect(obs[0].kind).toBe("fee");
  });

  it("produces the expected obligation count", () => {
    // Only clauses with a parseable due date survive:
    //   sub:   fee + co-invest deadline + 2 capital calls            = 4
    //   side:  distribution + MFN review deadline                   = 2
    //          (the dateless "reduced management fee" line is dropped)
    //   ins:   premium + renewal deadline                           = 2
    //   trust: review deadline + admin fee                          = 2
    //   lpa:   certification renewal deadline                       = 1
    //                                                           total = 11
    expect(extractVaultObligations(seededVault)).toHaveLength(11);
  });
});

describe("buildRegistry", () => {
  it("joins each document to its resolved entities and obligations", () => {
    const views = buildRegistry(seededVault);
    expect(views).toHaveLength(seededVault.documents.length);
    const side = views.find((v) => v.document.id === "doc-side-meridian")!;
    expect(side.entities.map((e) => e.id).sort()).toEqual(["holdco", "trust"]);
    expect(side.obligations.length).toBeGreaterThan(0);
  });

  it("drops entity ids that do not resolve", () => {
    const vault = {
      entities: seededVault.entities,
      documents: [
        {
          id: "d",
          title: "T",
          kind: "side-letter",
          entityIds: ["trust", "ghost"],
          counterparty: "X",
          executedOn: "2025-01-01",
          currency: "USD",
          text: "no obligations",
        } satisfies VaultDocument,
      ],
    };
    const [view] = buildRegistry(vault);
    expect(view.entities.map((e) => e.id)).toEqual(["trust"]);
  });
});

describe("totalByKind", () => {
  it("totals capital calls across the vault", () => {
    const obs = extractVaultObligations(seededVault);
    expect(totalByKind(obs, "capital-call", "USD").equals(usd("5500000"))).toBe(true);
  });

  it("ignores obligations in a different currency", () => {
    const obs = extractVaultObligations(seededVault);
    // The only premium is in CHF, so the USD premium total is zero.
    expect(totalByKind(obs, "premium", "USD").isZero()).toBe(true);
    expect(
      totalByKind(obs, "premium", "CHF").equals(Money.of("120000", "CHF")),
    ).toBe(true);
  });
});

describe("labels", () => {
  it("labels every document kind", () => {
    expect(documentKindLabel("lpa")).toBe("Lasting power of attorney");
    expect(documentKindLabel("subscription-agreement")).toBe("Subscription agreement");
  });

  it("labels every obligation kind", () => {
    expect(obligationKindLabel("capital-call")).toBe("Capital call");
    expect(obligationKindLabel("deadline")).toBe("Deadline");
  });
});
