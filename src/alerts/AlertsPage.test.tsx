import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import AlertsPage from "./AlertsPage";

describe("AlertsPage", () => {
  it("renders the heading and a back link to the dashboard", () => {
    render(<AlertsPage />);
    expect(
      screen.getByRole("heading", { name: /limit alerts/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("alerts-back")).toHaveAttribute("href", "#/");
  });

  it("summarises one critical and two warning breaches for the sample book", () => {
    render(<AlertsPage />);
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
  });

  it("defaults to the breaches filter and shows the 3 breaches", () => {
    render(<AlertsPage />);
    expect(screen.getByTestId("filter-breaches")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getAllByTestId("alert-row")).toHaveLength(3);
  });

  it("puts the critical single-position breach first", () => {
    render(<AlertsPage />);
    const rows = screen.getAllByTestId("alert-row");
    expect(rows[0]).toHaveAttribute("data-severity", "critical");
    expect(within(rows[0]).getByTestId("alert-subject")).toHaveTextContent(
      "USD Cash",
    );
    // 250,000 / 287,920 = 86.8%.
    expect(within(rows[0]).getByTestId("alert-weight")).toHaveTextContent(
      "86.8%",
    );
  });

  it("describes each breach in money terms", () => {
    render(<AlertsPage />);
    const rows = screen.getAllByTestId("alert-row");
    const detail = within(rows[0]).getByTestId("alert-detail");
    // 250,000 - 0.20 * 287,920 = 192,416 over the ceiling.
    expect(detail).toHaveTextContent(/192,416/);
    expect(detail).toHaveTextContent(/over the 20\.0% ceiling/);
  });

  it("shows an equity floor breach phrased as 'short of' the floor", () => {
    render(<AlertsPage />);
    const rows = screen.getAllByTestId("alert-row");
    const floor = rows.find((r) =>
      within(r).queryByText(/Equity floor/),
    );
    expect(floor).toBeDefined();
    expect(within(floor!).getByTestId("alert-detail")).toHaveTextContent(
      /short of the 15\.0% floor/,
    );
  });

  it("switches to the all-rules view and shows every rule including satisfied ones", async () => {
    const user = userEvent.setup();
    render(<AlertsPage />);
    await user.click(screen.getByTestId("filter-all"));
    expect(screen.getByTestId("filter-all")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // Default rule set = 5 rules; one is the per-position rule which expands to
    // 3 holdings, so 4 + 3 = 7 evaluations.
    const rows = screen.getAllByTestId("alert-row");
    expect(rows.length).toBe(7);
    // At least one satisfied (non-breached) row is now visible.
    expect(
      rows.some((r) => r.getAttribute("data-breached") === "false"),
    ).toBe(true);
  });

  it("renders a progress bar per alert with a clamped width", () => {
    render(<AlertsPage />);
    const bars = screen.getAllByTestId("alert-bar");
    expect(bars.length).toBe(3);
    for (const bar of bars) {
      const width = parseFloat((bar as HTMLElement).style.width);
      expect(width).toBeGreaterThanOrEqual(0);
      expect(width).toBeLessThanOrEqual(100);
    }
  });
});
