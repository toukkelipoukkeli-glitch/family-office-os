import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import TaxLotsPage from "./TaxLotsPage";

describe("TaxLotsPage", () => {
  it("renders the heading and method selector", () => {
    render(<TaxLotsPage />);
    expect(screen.getByRole("heading", { name: /tax lots/i })).toBeInTheDocument();
    expect(screen.getByTestId("method-selector")).toBeInTheDocument();
    expect(screen.getByTestId("method-fifo")).toHaveAttribute("aria-pressed", "true");
  });

  it("shows realized and unrealized metrics", () => {
    render(<TaxLotsPage />);
    expect(screen.getByTestId("metric-realized")).toBeInTheDocument();
    expect(screen.getByTestId("metric-short")).toBeInTheDocument();
    expect(screen.getByTestId("metric-long")).toBeInTheDocument();
    expect(screen.getByTestId("metric-unrealized")).toBeInTheDocument();
  });

  it("renders open lots under FIFO (lot-b, lot-c remain)", () => {
    render(<TaxLotsPage />);
    const rows = screen.getAllByTestId("lot-row");
    const lots = rows.map((r) => r.getAttribute("data-lot"));
    expect(lots).toEqual(["lot-b", "lot-c"]);
  });

  it("switches the selected lot method and updates open lots", async () => {
    const user = userEvent.setup();
    render(<TaxLotsPage />);

    // HIFO sells the highest-cost lots first (lot-c @180, then lot-b @160),
    // leaving lot-a and the remainder of lot-b open.
    await user.click(screen.getByTestId("method-hifo"));
    expect(screen.getByTestId("method-hifo")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("method-fifo")).toHaveAttribute("aria-pressed", "false");

    const lots = screen.getAllByTestId("lot-row").map((r) => r.getAttribute("data-lot"));
    expect(lots).toContain("lot-a");
  });

  it("shows disposal detail with at least one slice", () => {
    render(<TaxLotsPage />);
    const disposals = screen.getAllByTestId("disposal-row");
    expect(disposals.length).toBeGreaterThanOrEqual(1);
    const slices = within(disposals[0]).getAllByTestId("slice-row");
    expect(slices.length).toBeGreaterThanOrEqual(1);
  });

  it("updates the method blurb when switching to LIFO", async () => {
    const user = userEvent.setup();
    render(<TaxLotsPage />);
    await user.click(screen.getByTestId("method-lifo"));
    expect(screen.getByTestId("method-blurb")).toHaveTextContent(/newest lots first/i);
  });
});
