import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  buildBoard,
  formatMoney,
  summarizePipeline,
} from "@/lib/deals";
import { sampleDeals, samplePipeline } from "@/lib/deals/fixtures";

import PipelinePage from "./PipelinePage";

describe("PipelinePage — board", () => {
  it("renders the pipeline heading and name", () => {
    render(<PipelinePage path="/pipeline" />);
    expect(
      screen.getByRole("heading", { name: /deal pipeline/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/direct private equity/i)).toBeInTheDocument();
  });

  it("renders one column per pipeline stage in order", () => {
    render(<PipelinePage path="/pipeline" />);
    const columns = screen.getAllByTestId("stage-column");
    expect(columns.map((c) => c.getAttribute("data-stage-id"))).toEqual([
      "stage-sourced",
      "stage-diligence",
      "stage-negotiation",
      "stage-won",
      "stage-lost",
    ]);
  });

  it("places each deal card in its stage column", () => {
    render(<PipelinePage path="/pipeline" />);
    const negotiation = screen
      .getAllByTestId("stage-column")
      .find((c) => c.getAttribute("data-stage-id") === "stage-negotiation")!;
    const cards = within(negotiation).getAllByTestId("deal-card");
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveAttribute("data-deal-id", "deal-summit");
  });

  it("shows the summary stats computed from the selectors", () => {
    render(<PipelinePage path="/pipeline" />);
    const summary = summarizePipeline(samplePipeline, sampleDeals, "EUR");
    expect(screen.getByTestId("stat-open-count")).toHaveTextContent(
      String(summary.openCount),
    );
    expect(screen.getByTestId("stat-open-total")).toHaveTextContent(
      formatMoney(summary.openTotal),
    );
    expect(screen.getByTestId("stat-weighted-total")).toHaveTextContent(
      formatMoney(summary.weightedTotal),
    );
    expect(screen.getByTestId("stat-win-rate")).toHaveTextContent("50%");
  });

  it("renders weighted column totals matching buildBoard", () => {
    render(<PipelinePage path="/pipeline" />);
    const board = buildBoard(samplePipeline, sampleDeals, "EUR");
    const negotiation = board.find((c) => c.stage.id === "stage-negotiation")!;
    const column = screen
      .getAllByTestId("stage-column")
      .find((c) => c.getAttribute("data-stage-id") === "stage-negotiation")!;
    expect(within(column).getByTestId("stage-weighted")).toHaveTextContent(
      formatMoney(negotiation.weighted),
    );
  });

  it("links every deal card to its drill-down route", () => {
    render(<PipelinePage path="/pipeline" />);
    const card = screen
      .getAllByTestId("deal-card")
      .find((c) => c.getAttribute("data-deal-id") === "deal-acorn")!;
    expect(card).toHaveAttribute("href", "#/pipeline/deal-acorn");
  });
});

describe("PipelinePage — drill-down", () => {
  it("renders the deal detail when a deal id is in the path", () => {
    render(<PipelinePage path="/pipeline/deal-acorn" />);
    const detail = screen.getByTestId("deal-detail");
    expect(detail).toHaveAttribute("data-deal-id", "deal-acorn");
    expect(
      within(detail).getByText(/project acorn/i),
    ).toBeInTheDocument();
  });

  it("shows the deal's contacts and interactions", () => {
    render(<PipelinePage path="/pipeline/deal-acorn" />);
    expect(screen.getAllByTestId("contact-row")).toHaveLength(2);
    expect(screen.getAllByTestId("interaction-row")).toHaveLength(2);
  });

  it("orders interactions newest-first", () => {
    render(<PipelinePage path="/pipeline/deal-acorn" />);
    const rows = screen.getAllByTestId("interaction-row");
    // int-call (2026-01-20) is newer than int-intro (2026-01-12).
    expect(rows[0]).toHaveTextContent("2026-01-20");
    expect(rows[1]).toHaveTextContent("2026-01-12");
  });

  it("offers a back link to the board", () => {
    render(<PipelinePage path="/pipeline/deal-acorn" />);
    expect(screen.getByTestId("detail-back")).toHaveAttribute(
      "href",
      "#/pipeline",
    );
  });

  it("shows a not-found message for an unknown deal id", () => {
    render(<PipelinePage path="/pipeline/does-not-exist" />);
    expect(screen.getByTestId("deal-not-found")).toBeInTheDocument();
  });
});
