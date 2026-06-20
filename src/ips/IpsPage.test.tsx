import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import IpsPage from "./IpsPage";

describe("IpsPage", () => {
  it("renders the heading, policy name, benchmark and a back link", () => {
    render(<IpsPage />);
    expect(
      screen.getByRole("heading", { name: /ips compliance/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("ips-policy-name")).toHaveTextContent(
      "Ursin Family Office IPS 2026",
    );
    expect(screen.getByTestId("ips-benchmark")).toHaveTextContent(
      "Balanced 60/40 policy",
    );
    expect(screen.getByTestId("ips-back")).toHaveAttribute("href", "#/");
  });

  it("summarises one critical and two warning breaches for the sample book", () => {
    render(<IpsPage />);
    expect(
      within(screen.getByTestId("summary-critical")).getByTestId(
        "summary-critical-value",
      ),
    ).toHaveTextContent("1");
    expect(
      within(screen.getByTestId("summary-warning")).getByTestId(
        "summary-warning-value",
      ),
    ).toHaveTextContent("2");
    expect(screen.getByTestId("summary-status-value")).toHaveTextContent(
      "In breach",
    );
  });

  it("defaults to the breaches filter and shows the 3 breaches", () => {
    render(<IpsPage />);
    expect(screen.getByTestId("filter-breaches")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getAllByTestId("ips-row")).toHaveLength(3);
  });

  it("puts the critical single-position breach first", () => {
    render(<IpsPage />);
    const rows = screen.getAllByTestId("ips-row");
    expect(rows[0]).toHaveAttribute("data-severity", "critical");
    expect(within(rows[0]).getByTestId("ips-subject")).toHaveTextContent(
      "USD Cash",
    );
    expect(within(rows[0]).getByTestId("ips-weight")).toHaveTextContent("86.8%");
  });

  it("describes the position-cap breach in money terms", () => {
    render(<IpsPage />);
    const rows = screen.getAllByTestId("ips-row");
    const detail = within(rows[0]).getByTestId("ips-detail");
    // 250,000 - 0.20 * 287,920 = 192,416 over the ceiling.
    expect(detail).toHaveTextContent(/192,416/);
    expect(detail).toHaveTextContent(/over the 20\.0% ceiling/);
  });

  it("shows the equity floor breach phrased as 'short of' the floor", () => {
    render(<IpsPage />);
    const rows = screen.getAllByTestId("ips-row");
    const floor = rows.find((r) =>
      within(r).queryByText(/Equity allocation band/),
    );
    expect(floor).toBeDefined();
    expect(within(floor!).getByTestId("ips-detail")).toHaveTextContent(
      /short of the 15\.0% floor/,
    );
  });

  it("switches to the all-checks view and shows satisfied checks too", async () => {
    const user = userEvent.setup();
    render(<IpsPage />);
    await user.click(screen.getByTestId("filter-all"));
    expect(screen.getByTestId("filter-all")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // 3 position-cap holdings + equity band (2 bounds) + cash band + crypto band
    // + liquidity floor + EUR cap = 9 checks.
    const rows = screen.getAllByTestId("ips-row");
    expect(rows.length).toBe(9);
    expect(
      rows.some((r) => r.getAttribute("data-breached") === "false"),
    ).toBe(true);
  });

  it("renders a clamped progress bar per check", () => {
    render(<IpsPage />);
    const bars = screen.getAllByTestId("ips-bar");
    expect(bars.length).toBe(3);
    for (const bar of bars) {
      const width = parseFloat((bar as HTMLElement).style.width);
      expect(width).toBeGreaterThanOrEqual(0);
      expect(width).toBeLessThanOrEqual(100);
    }
  });
});
