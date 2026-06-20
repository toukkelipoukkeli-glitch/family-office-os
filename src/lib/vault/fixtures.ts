/**
 * Deterministic, offline fixtures for the document & obligation vault.
 *
 * A small but representative {@link Vault} for the Ursin family office: a
 * private-fund subscription agreement, a side letter, an insurance policy, a
 * trust deed and a lasting power of attorney — each linked to the owning
 * entities and each carrying a short, hand-written `text` body whose clauses
 * the obligation extractor parses into exact dates and amounts.
 *
 * Every clause is pinned by literal so a fixture change is a visible diff and
 * the extractor's output is trivially checkable. READ-ONLY: this only
 * describes documents the family already holds.
 */

import type { Vault } from "./vault";

export const seededVault: Vault = {
  entities: [
    { id: "trust", name: "Ursin Family Trust", kind: "trust" },
    { id: "holdco", name: "Ursin Holdings AG", kind: "holdco" },
    { id: "foundation", name: "Ursin Family Foundation", kind: "foundation" },
    { id: "touko", name: "Touko Ursin", kind: "person" },
  ],
  documents: [
    {
      id: "doc-sub-meridian",
      title: "Meridian Growth Fund IV — Subscription Agreement",
      kind: "subscription-agreement",
      entityIds: ["trust"],
      counterparty: "Meridian Capital Partners",
      executedOn: "2025-03-15",
      currency: "USD",
      text: [
        "The Subscriber commits a total capital commitment of USD 10,000,000 to the Fund.",
        "First capital call of $2,500,000 is due on 2026-09-30.",
        "Second capital call of $3,000,000 is due on 2027-03-31.",
        "A management fee of 2,000,000 is payable annually on 2026-01-15.",
        "The Subscriber may make a co-investment election on or before 2026-08-15.",
      ].join("\n"),
    },
    {
      id: "doc-side-meridian",
      title: "Meridian Growth Fund IV — Side Letter",
      kind: "side-letter",
      entityIds: ["trust", "holdco"],
      counterparty: "Meridian Capital Partners",
      executedOn: "2025-03-15",
      currency: "USD",
      text: [
        "The Fund shall pay a quarterly distribution estimated at $750,000 on 2026-12-31.",
        "Most-favoured-nation review deadline is 2026-06-30.",
        "The reduced management fee of $1,500,000 supersedes the base agreement.",
      ].join("\n"),
    },
    {
      id: "doc-ins-zurich",
      title: "Zurich Key-Person Life Policy",
      kind: "insurance-policy",
      entityIds: ["holdco", "touko"],
      counterparty: "Zurich Insurance Group",
      executedOn: "2024-11-01",
      currency: "CHF",
      text: [
        "The annual premium of CHF 120,000 is due on 2026-11-01.",
        "Policy renewal notice must be served by no later than 2026-10-01.",
        "The sum assured is CHF 25,000,000.",
      ].join("\n"),
    },
    {
      id: "doc-trust-deed",
      title: "Ursin Family Trust — Deed of Settlement",
      kind: "trust-deed",
      entityIds: ["trust"],
      counterparty: "Lindqvist & Co (Trustees)",
      executedOn: "2018-06-20",
      currency: "USD",
      text: [
        "The trust deed was executed on 20 June 2018 and is irrevocable.",
        "A trustee review of the investment policy is required by 2026-06-20.",
        "The annual trustee administration fee of $45,000 is due on 2026-06-20.",
      ].join("\n"),
    },
    {
      id: "doc-lpa-touko",
      title: "Lasting Power of Attorney — Touko Ursin",
      kind: "lpa",
      entityIds: ["touko"],
      counterparty: "Office of the Public Guardian",
      executedOn: "2023-02-10",
      currency: "GBP",
      text: [
        "This LPA was registered on February 10, 2023.",
        "The attorney's certification renewal is due on 2027-02-10.",
        "No financial obligation arises under this instrument.",
      ].join("\n"),
    },
  ],
};
