import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import PrivateMarketsPage from "./PrivateMarketsPage";

describe("PrivateMarketsPage", () => {
  it("renders the heading, fund selector, and default buyout fund", () => {
    render(<PrivateMarketsPage />);
    expect(
      screen.getByRole("heading", { name: /private markets/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("fund-selector")).toBeInTheDocument();
    expect(screen.getByTestId("fund-buyout")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("pe-fund-name")).toHaveTextContent(
      "Evergreen Buyout Fund IV",
    );
  });

  it("shows the hand-computed multiples for the buyout fund", () => {
    render(<PrivateMarketsPage />);
    expect(screen.getByTestId("metric-tvpi")).toHaveTextContent("1.75x");
    expect(screen.getByTestId("metric-dpi")).toHaveTextContent("1.12x");
    expect(screen.getByTestId("metric-rvpi")).toHaveTextContent("0.62x");
    expect(screen.getByTestId("metric-irr")).toHaveTextContent(/\+1[0-9]\.[0-9]%/);
    expect(screen.getByTestId("unfunded-amount")).toHaveTextContent(
      "$2,000,000",
    );
  });

  it("renders the J-curve chart with one point per cashflow", () => {
    render(<PrivateMarketsPage />);
    expect(screen.getByTestId("jcurve-chart")).toBeInTheDocument();
    expect(screen.getAllByTestId("jcurve-point")).toHaveLength(5);
  });

  it("lists the cashflow ledger in date order", () => {
    render(<PrivateMarketsPage />);
    const rows = screen.getAllByTestId("ledger-row");
    expect(rows).toHaveLength(5);
    expect(within(rows[0]).getByText("2019-03-15")).toBeInTheDocument();
    expect(rows[0]).toHaveAttribute("data-kind", "call");
  });

  it("switches to the venture fund and updates the metrics", async () => {
    const user = userEvent.setup();
    render(<PrivateMarketsPage />);

    await user.click(screen.getByTestId("fund-venture"));
    expect(screen.getByTestId("fund-venture")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("fund-buyout")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByTestId("pe-fund-name")).toHaveTextContent(
      "Northstar Ventures II",
    );
    // Fully realized: RVPI 0, DPI == TVPI == 2.50x.
    expect(screen.getByTestId("metric-rvpi")).toHaveTextContent("0.00x");
    expect(screen.getByTestId("metric-tvpi")).toHaveTextContent("2.50x");
    expect(screen.getByTestId("metric-dpi")).toHaveTextContent("2.50x");
    // 3 cashflows for the venture fund.
    expect(screen.getAllByTestId("ledger-row")).toHaveLength(3);
  });

  it("exposes a progress bar reflecting called capital", () => {
    render(<PrivateMarketsPage />);
    const bar = screen.getByTestId("called-bar");
    expect(bar).toHaveAttribute("aria-valuenow", "80");
  });
});
