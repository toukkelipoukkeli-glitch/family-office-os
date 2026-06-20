import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { Vault } from "@/lib/vault";

import VaultPage from "./VaultPage";

/** A tiny vault with one document that yields a single capital call. */
function tinyVault(): Vault {
  return {
    entities: [{ id: "trust", name: "Test Trust", kind: "trust" }],
    documents: [
      {
        id: "d1",
        title: "Tiny Sub Agreement",
        kind: "subscription-agreement",
        entityIds: ["trust"],
        counterparty: "Acme GP",
        executedOn: "2025-01-01",
        currency: "USD",
        text: "Capital call of $1,000,000 is due on 2026-05-01.",
      },
    ],
  };
}

describe("VaultPage", () => {
  it("renders the heading and the four headline KPIs", () => {
    render(<VaultPage />);
    expect(
      screen.getByRole("heading", { name: /document & obligation vault/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("kpi-documents")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-obligations")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-capital-calls")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-fees")).toBeInTheDocument();
  });

  it("totals the seeded vault's capital calls as $5.5M", () => {
    render(<VaultPage />);
    expect(screen.getByTestId("kpi-capital-calls")).toHaveTextContent("$5.5M");
  });

  it("lists every seeded document in the registry", () => {
    render(<VaultPage />);
    const rows = within(screen.getByTestId("document-list")).getAllByTestId(
      "document-row",
    );
    expect(rows).toHaveLength(5);
  });

  it("selects the first document by default and shows its entities", () => {
    render(<VaultPage />);
    const detail = screen.getByTestId("document-detail");
    expect(within(detail).getByTestId("detail-title")).toHaveTextContent(
      /subscription agreement/i,
    );
    const chips = within(screen.getByTestId("entity-list")).getAllByTestId(
      "entity-chip",
    );
    expect(chips.length).toBeGreaterThan(0);
  });

  it("shows the selected document's extracted obligations with amounts", () => {
    render(<VaultPage />);
    const list = screen.getByTestId("obligation-list");
    const rows = within(list).getAllByTestId("obligation-row");
    // The seeded subscription agreement yields four obligations.
    expect(rows).toHaveLength(4);
    // A capital call row carries a formatted amount.
    const call = rows.find((r) => r.getAttribute("data-kind") === "capital-call");
    expect(call).toBeTruthy();
    expect(within(call!).getByTestId("obligation-amount")).toHaveTextContent(
      "$2,500,000",
    );
  });

  it("switches the detail panel when another document is clicked", async () => {
    const user = userEvent.setup();
    render(<VaultPage />);
    const insRow = screen
      .getAllByTestId("document-row")
      .find((r) => r.getAttribute("data-document") === "doc-ins-zurich")!;
    await user.click(insRow);
    expect(insRow).toHaveAttribute("data-active", "true");
    expect(screen.getByTestId("detail-title")).toHaveTextContent(/life policy/i);
    // The CHF premium obligation should surface with a CHF amount.
    const amounts = screen.getAllByTestId("obligation-amount");
    expect(amounts.some((a) => /CHF|120,000/.test(a.textContent ?? ""))).toBe(
      true,
    );
  });

  it("renders a global timeline sorted by due date", () => {
    render(<VaultPage />);
    const rows = within(screen.getByTestId("timeline")).getAllByTestId(
      "timeline-row",
    );
    expect(rows).toHaveLength(11);
  });

  it("handles a custom vault and shows a single obligation", () => {
    render(<VaultPage vault={tinyVault()} />);
    expect(
      within(screen.getByTestId("document-list")).getAllByTestId("document-row"),
    ).toHaveLength(1);
    const rows = within(screen.getByTestId("obligation-list")).getAllByTestId(
      "obligation-row",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveAttribute("data-kind", "capital-call");
  });

  it("links back to the dashboard", () => {
    render(<VaultPage />);
    expect(screen.getByTestId("vault-back")).toHaveAttribute("href", "#/");
  });
});
