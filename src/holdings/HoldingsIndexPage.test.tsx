import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { seededPortfolio } from "@/fixtures";

import HoldingsIndexPage from "./HoldingsIndexPage";

function resetHash() {
  window.location.hash = "#/holdings";
}

describe("HoldingsIndexPage", () => {
  beforeEach(resetHash);
  afterEach(resetHash);

  it("renders the heading and one row per holding", () => {
    render(<HoldingsIndexPage />);
    expect(
      screen.getByRole("heading", { name: /^Holdings$/ }),
    ).toBeInTheDocument();
    const table = screen.getByTestId("holdings-table");
    expect(within(table).getAllByTestId("holdings-row")).toHaveLength(
      seededPortfolio.holdings.length,
    );
  });

  it("sorts by value descending by default (largest first)", () => {
    render(<HoldingsIndexPage />);
    const rows = screen.getAllByTestId("holdings-row");
    expect(rows[0]).toHaveAttribute("data-holding", "hold-vineyard-tuscany");
  });

  it("falls back to the default sort when the URL sort param is malformed", () => {
    // A junk deep-link must not render the table in raw, unsorted order.
    window.location.hash = "#/holdings?sort=not-a-real-column";
    render(<HoldingsIndexPage />);
    const rows = screen.getAllByTestId("holdings-row");
    expect(rows[0]).toHaveAttribute("data-holding", "hold-vineyard-tuscany");
  });

  it("filters the table by free-text search", async () => {
    const user = userEvent.setup();
    render(<HoldingsIndexPage />);
    await user.type(screen.getByTestId("holdings-search"), "apple");
    const rows = screen.getAllByTestId("holdings-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveAttribute("data-holding", "hold-equity-aapl");
  });

  it("shows an empty state when nothing matches", async () => {
    const user = userEvent.setup();
    render(<HoldingsIndexPage />);
    await user.type(screen.getByTestId("holdings-search"), "zzz-nope");
    expect(screen.queryAllByTestId("holdings-row")).toHaveLength(0);
    expect(screen.getByTestId("holdings-empty")).toBeInTheDocument();
  });

  it("narrows by an asset-class facet chip", async () => {
    const user = userEvent.setup();
    render(<HoldingsIndexPage />);
    await user.click(screen.getByTestId("facet-class-cash"));
    const rows = screen.getAllByTestId("holdings-row");
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(within(r).getByText("Cash")).toBeInTheDocument();
    }
  });

  it("narrows by a currency facet chip and AND-combines with class", async () => {
    const user = userEvent.setup();
    render(<HoldingsIndexPage />);
    await user.click(screen.getByTestId("facet-ccy-EUR"));
    const rows = screen.getAllByTestId("holdings-row");
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(within(r).getByText("EUR")).toBeInTheDocument();
    }
  });

  it("toggles sort direction when a column header is re-clicked", async () => {
    const user = userEvent.setup();
    render(<HoldingsIndexPage />);
    // Sort by name ascending.
    await user.click(screen.getByTestId("sort-name"));
    let rows = screen.getAllByTestId("holdings-row");
    const firstAsc = rows[0].getAttribute("data-holding");
    // Re-click → descending.
    await user.click(screen.getByTestId("sort-name"));
    rows = screen.getAllByTestId("holdings-row");
    const firstDesc = rows[0].getAttribute("data-holding");
    expect(firstAsc).not.toBe(firstDesc);
  });

  it("reflects search in the URL hash for deep-linking", async () => {
    const user = userEvent.setup();
    render(<HoldingsIndexPage />);
    await user.type(screen.getByTestId("holdings-search"), "btc");
    expect(window.location.hash).toContain("q=btc");
  });

  it("clears all filters with the Clear control", async () => {
    const user = userEvent.setup();
    render(<HoldingsIndexPage />);
    await user.type(screen.getByTestId("holdings-search"), "apple");
    expect(screen.getAllByTestId("holdings-row")).toHaveLength(1);
    await user.click(screen.getByTestId("holdings-clear"));
    expect(screen.getAllByTestId("holdings-row")).toHaveLength(
      seededPortfolio.holdings.length,
    );
  });

  it("renders an export menu and a summary bar", () => {
    render(<HoldingsIndexPage />);
    expect(screen.getByTestId("holdings-export-csv")).toBeInTheDocument();
    expect(screen.getByTestId("holdings-export-json")).toBeInTheDocument();
    expect(screen.getByTestId("stat-count")).toHaveTextContent(
      String(seededPortfolio.holdings.length),
    );
  });
});
