import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { deterministicNarrative, type InsightResult } from "@/lib/ai";
import { seededBoardReport } from "@/lib/reporting";

import InsightsPage from "./InsightsPage";

const okResult: InsightResult = {
  status: "ok",
  narrative: "The portfolio is healthy and within policy limits.",
  model: "gemini-1.5-flash",
  deterministic: deterministicNarrative(seededBoardReport),
};

const unavailableResult: InsightResult = {
  status: "unavailable",
  reason: "missing-key",
  detail: "GEMINI_API_KEY is not configured.",
  deterministic: deterministicNarrative(seededBoardReport),
};

describe("InsightsPage", () => {
  it("renders the AI narrative when a successful result is injected", () => {
    render(<InsightsPage result={okResult} />);
    expect(screen.getByTestId("insights-page")).toBeInTheDocument();
    expect(screen.getByTestId("ai-narrative")).toHaveTextContent(
      okResult.narrative,
    );
    // No unavailable notice in the success path.
    expect(screen.queryByTestId("ai-unavailable")).not.toBeInTheDocument();
  });

  it("renders the graceful 'AI insights unavailable' notice on degradation", () => {
    render(<InsightsPage result={unavailableResult} />);
    const notice = screen.getByTestId("ai-unavailable");
    expect(notice).toBeInTheDocument();
    expect(notice).toHaveAttribute("data-reason", "missing-key");
    expect(screen.getByText(/AI insights unavailable/i)).toBeInTheDocument();
    expect(screen.queryByTestId("ai-narrative")).not.toBeInTheDocument();
  });

  it("always shows the deterministic summary, AI or not", () => {
    const { rerender } = render(<InsightsPage result={okResult} />);
    expect(screen.getByTestId("deterministic-narrative")).toHaveTextContent(
      seededBoardReport.asOf,
    );
    rerender(<InsightsPage result={unavailableResult} />);
    expect(screen.getByTestId("deterministic-narrative")).toHaveTextContent(
      seededBoardReport.asOf,
    );
  });

  it("degrades gracefully with no key when no result is injected (live default)", async () => {
    // No GEMINI_API_KEY and no injected result: the real adapter is invoked and
    // must resolve to the unavailable path (never a crash, never a blank panel).
    render(<InsightsPage />);
    await waitFor(() =>
      expect(screen.getByTestId("ai-unavailable")).toBeInTheDocument(),
    );
    expect(screen.getByText(/AI insights unavailable/i)).toBeInTheDocument();
    expect(screen.getByTestId("deterministic-narrative")).toHaveTextContent(
      seededBoardReport.asOf,
    );
  });
});
