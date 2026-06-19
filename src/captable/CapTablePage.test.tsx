import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { sampleCapTable } from "@/lib/captable";

import CapTablePage from "./CapTablePage";

describe("CapTablePage", () => {
  it("renders the heading and company", () => {
    render(<CapTablePage />);
    expect(
      screen.getByRole("heading", { name: /cap table/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("captable-company")).toHaveTextContent(
      sampleCapTable.companyName,
    );
  });

  it("renders one row per holder with the fully diluted total", () => {
    render(<CapTablePage />);
    expect(screen.getAllByTestId("captable-row")).toHaveLength(
      sampleCapTable.entries.length,
    );
    expect(screen.getByTestId("captable-total")).toHaveTextContent(
      "10,000,000",
    );
  });

  it("draws a donut segment per security class", () => {
    render(<CapTablePage />);
    // common, option, preferred => 3 classes.
    expect(screen.getAllByTestId("donut-segment").length).toBeGreaterThanOrEqual(
      3,
    );
    expect(screen.getByTestId("class-legend")).toBeInTheDocument();
  });

  it("does not show round detail until the round is modelled", () => {
    render(<CapTablePage />);
    expect(screen.queryByTestId("round-detail")).not.toBeInTheDocument();
  });

  it("reveals dilution detail when modelling the round", async () => {
    const user = userEvent.setup();
    render(<CapTablePage />);

    const toggle = screen.getByTestId("toggle-round");
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");

    const detail = screen.getByTestId("round-detail");
    expect(detail).toBeInTheDocument();
    // Series A => 5M at 20M post-money ~ 25% investor ownership.
    expect(screen.getByTestId("metric-investor-percent")).toHaveTextContent(
      /2[45]/,
    );

    // Existing founders are diluted (delta shown).
    const dilution = screen.getByTestId("dilution-list");
    const founderRow = within(dilution)
      .getAllByTestId("dilution-row")
      .find((r) => r.getAttribute("data-holder") === "Touko Ursin");
    expect(founderRow).toBeDefined();
    expect(founderRow).toHaveTextContent(/pp/);
  });

  it("toggles back to the base table", async () => {
    const user = userEvent.setup();
    render(<CapTablePage />);
    const toggle = screen.getByTestId("toggle-round");
    await user.click(toggle);
    expect(screen.getByTestId("round-detail")).toBeInTheDocument();
    await user.click(toggle);
    expect(screen.queryByTestId("round-detail")).not.toBeInTheDocument();
    expect(screen.getByTestId("captable-total")).toHaveTextContent("10,000,000");
  });

  it("links back to the dashboard", () => {
    render(<CapTablePage />);
    expect(screen.getByTestId("captable-back")).toHaveAttribute("href", "#/");
  });
});
