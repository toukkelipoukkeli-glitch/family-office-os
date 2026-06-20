import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import HarvestPage from "./HarvestPage";

describe("HarvestPage", () => {
  it("renders the heading and method selector", () => {
    render(<HarvestPage />);
    expect(
      screen.getByRole("heading", { name: /tax-loss harvesting/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("method-selector")).toBeInTheDocument();
    expect(screen.getByTestId("method-fifo")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("shows the summary metrics", () => {
    render(<HarvestPage />);
    expect(screen.getByTestId("metric-candidates")).toHaveTextContent("4");
    expect(screen.getByTestId("metric-clean")).toHaveTextContent("$21,000.00");
    expect(screen.getByTestId("metric-flagged")).toHaveTextContent("3");
    expect(screen.getByTestId("metric-blocked")).toHaveTextContent("$14,060.00");
    expect(screen.getByTestId("total-loss")).toHaveTextContent("$35,060.00");
  });

  it("lists candidates worst-loss first", () => {
    render(<HarvestPage />);
    const lots = screen
      .getAllByTestId("candidate-row")
      .map((r) => r.getAttribute("data-lot"));
    expect(lots).toEqual(["tsla-1", "baba-1", "meta-1", "baba-2"]);
  });

  it("flags wash-sale risk and shows the conflicting purchase", () => {
    render(<HarvestPage />);
    const baba = screen
      .getAllByTestId("candidate-row")
      .find((r) => r.getAttribute("data-lot") === "baba-1")!;
    expect(baba).toHaveAttribute("data-washsale", "true");
    expect(within(baba).getByTestId("status-pill")).toHaveTextContent(
      "Wash-sale risk",
    );
    expect(within(baba).getByTestId("conflict-list")).toHaveTextContent(
      /12 days before/,
    );

    const tsla = screen
      .getAllByTestId("candidate-row")
      .find((r) => r.getAttribute("data-lot") === "tsla-1")!;
    expect(tsla).toHaveAttribute("data-washsale", "false");
    expect(within(tsla).getByTestId("status-pill")).toHaveTextContent("Clean");
  });

  it("keeps the candidate set stable across lot methods (no disposals)", async () => {
    const user = userEvent.setup();
    render(<HarvestPage />);
    await user.click(screen.getByTestId("method-hifo"));
    expect(screen.getByTestId("method-hifo")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // With no disposals every lot stays open, so candidates are unchanged.
    const lots = screen
      .getAllByTestId("candidate-row")
      .map((r) => r.getAttribute("data-lot"));
    expect(lots).toEqual(["tsla-1", "baba-1", "meta-1", "baba-2"]);
  });

  it("links back to the dashboard", () => {
    render(<HarvestPage />);
    expect(screen.getByTestId("harvest-back")).toHaveAttribute("href", "#/");
  });
});
