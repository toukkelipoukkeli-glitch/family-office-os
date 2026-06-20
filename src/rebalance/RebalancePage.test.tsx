import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import RebalancePage from "./RebalancePage";

describe("RebalancePage", () => {
  it("renders the heading and a back link", () => {
    render(<RebalancePage />);
    expect(
      screen.getByRole("heading", { name: /rebalancing proposal/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("rebalance-back")).toHaveAttribute("href", "#/");
  });

  it("summarises the proposal (sell, buy, tax, savings)", () => {
    render(<RebalancePage />);
    expect(screen.getByTestId("summary-sold-value")).toHaveTextContent(
      "$16,000.00",
    );
    expect(screen.getByTestId("summary-bought-value")).toHaveTextContent(
      "$16,000.00",
    );
    // HIFO default: $160 tax, $1,600 short-term gain.
    expect(screen.getByTestId("summary-tax-value")).toHaveTextContent("$160.00");
    expect(screen.getByTestId("realized-gain")).toHaveTextContent("+$1,600.00");
    expect(screen.getByTestId("realized-short")).toHaveTextContent("$1,600.00");
  });

  it("defaults to HIFO and shows the reconcile status", () => {
    render(<RebalancePage />);
    expect(screen.getByTestId("rebalance-method")).toHaveTextContent("HIFO");
    expect(screen.getByTestId("method-hifo")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const status = screen.getByTestId("reconcile-status");
    expect(status).toHaveAttribute("data-reconciles", "true");
  });

  it("lists one sell and two buy trades", () => {
    render(<RebalancePage />);
    const rows = screen.getAllByTestId("trade-row");
    expect(rows).toHaveLength(3);
    const sells = rows.filter((r) => r.getAttribute("data-side") === "sell");
    const buys = rows.filter((r) => r.getAttribute("data-side") === "buy");
    expect(sells).toHaveLength(1);
    expect(buys).toHaveLength(2);
    expect(within(sells[0]).getByTestId("trade-name")).toHaveTextContent(
      "Apple Inc.",
    );
    expect(within(sells[0]).getByTestId("trade-gain")).toHaveTextContent(
      "+$1,600.00",
    );
  });

  it("shows the equity row as overweight (sell) and others as buys", () => {
    render(<RebalancePage />);
    const rows = screen.getAllByTestId("allocation-row");
    const equity = rows.find((r) => r.getAttribute("data-asset-class") === "equity")!;
    expect(equity).toHaveAttribute("data-action", "Sell");
    expect(within(equity).getByTestId("allocation-drift")).toHaveTextContent(
      "+20.0%",
    );
  });

  it("switches to FIFO and shows a larger long-term realized gain", async () => {
    const user = userEvent.setup();
    render(<RebalancePage />);
    expect(screen.getByTestId("realized-long")).toHaveTextContent("$0.00");

    await user.click(screen.getByTestId("method-fifo"));
    expect(screen.getByTestId("rebalance-method")).toHaveTextContent("FIFO");
    expect(screen.getByTestId("realized-long")).toHaveTextContent("$8,000.00");
    expect(screen.getByTestId("realized-short")).toHaveTextContent("$0.00");
  });
});
