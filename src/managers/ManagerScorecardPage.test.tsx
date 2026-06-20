import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { MANAGERS } from "@/lib/managers";

import ManagerScorecardPage from "./ManagerScorecardPage";

describe("ManagerScorecardPage", () => {
  it("renders the heading and the ranked roster", () => {
    render(<ManagerScorecardPage />);
    expect(
      screen.getByRole("heading", { name: /manager & fund scorecard/i }),
    ).toBeInTheDocument();
    const table = screen.getByTestId("roster-table");
    expect(within(table).getAllByTestId("roster-row")).toHaveLength(
      MANAGERS.length,
    );
  });

  it("ranks Meridian first and selects it by default", () => {
    render(<ManagerScorecardPage />);
    const rows = screen.getAllByTestId("roster-row");
    expect(rows[0]).toHaveAttribute("data-manager", "meridian-global-equity");
    expect(rows[0]).toHaveAttribute("data-selected", "true");
    // detail header shows the selected manager
    expect(screen.getByTestId("detail-header")).toHaveTextContent(
      "Meridian Global Equity",
    );
  });

  it("renders the four headline KPIs and the three-series growth chart", () => {
    render(<ManagerScorecardPage />);
    expect(screen.getByTestId("kpi-net")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-fee-drag")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-excess")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-info-ratio")).toBeInTheDocument();

    const chart = screen.getByTestId("growth-chart");
    const svg = within(chart).getByTestId("line-chart");
    expect(svg).toHaveAttribute("data-series", "3");
  });

  it("draws the score-breakdown bar chart", () => {
    render(<ManagerScorecardPage />);
    const chart = screen.getByTestId("score-chart");
    expect(within(chart).getByTestId("bar-chart")).toBeInTheDocument();
  });

  it("selecting another manager drills into its scorecard", async () => {
    const user = userEvent.setup();
    render(<ManagerScorecardPage />);

    const aurora = screen
      .getAllByTestId("roster-row")
      .find((r) => r.getAttribute("data-manager") === "aurora-ventures")!;
    await user.click(aurora);

    expect(aurora).toHaveAttribute("data-selected", "true");
    expect(screen.getByTestId("detail-header")).toHaveTextContent(
      "Aurora Ventures",
    );
    // Aurora trails its benchmark net of fees → negative excess shown.
    expect(screen.getByTestId("kpi-excess")).toHaveTextContent("-");
  });

  it("shows the fee terms for the selected manager", () => {
    render(<ManagerScorecardPage />);
    const terms = screen.getByTestId("terms-detail");
    // Meridian: 1.50% management, 15% carry.
    expect(terms).toHaveTextContent("1.50%");
    expect(terms).toHaveTextContent("15.00%");
  });

  // --- Deep-linkable sub-view state (m13) --------------------------------

  it("selects the manager named in the hash deep link on mount", () => {
    window.location.hash = "#/managers?m=aurora-ventures";
    render(<ManagerScorecardPage />);
    const aurora = screen
      .getAllByTestId("roster-row")
      .find((r) => r.getAttribute("data-manager") === "aurora-ventures");
    expect(aurora).toHaveAttribute("data-selected", "true");
    expect(screen.getByTestId("detail-header")).toHaveTextContent(
      "Aurora Ventures",
    );
  });

  it("writes the selected manager to the hash so it is shareable", async () => {
    window.location.hash = "#/managers";
    const user = userEvent.setup();
    render(<ManagerScorecardPage />);
    const aurora = screen
      .getAllByTestId("roster-row")
      .find((r) => r.getAttribute("data-manager") === "aurora-ventures")!;
    await user.click(aurora);
    expect(window.location.hash).toBe("#/managers?m=aurora-ventures");
  });
});
