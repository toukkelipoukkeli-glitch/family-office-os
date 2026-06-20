import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { opsSnapshot } from "./ops-data";
import OpsPage from "./OpsPage";
import { countByStatus, progressPercent, unitsByStatus } from "./ops-selectors";

describe("OpsPage", () => {
  it("renders the cockpit heading", () => {
    render(<OpsPage />);
    expect(
      screen.getByRole("heading", { name: /ops cockpit/i }),
    ).toBeInTheDocument();
  });

  it("shows overall build progress matching the snapshot", () => {
    render(<OpsPage />);
    const percent = progressPercent(opsSnapshot);
    expect(screen.getByTestId("progress-percent")).toHaveTextContent(
      `${percent}%`,
    );

    const overall = screen.getByRole("progressbar", {
      name: /overall build progress/i,
    });
    expect(overall).toHaveAttribute("aria-valuenow", String(percent));
  });

  it("renders a summary tile per status with the right counts", () => {
    render(<OpsPage />);
    const counts = countByStatus(opsSnapshot);
    expect(screen.getByTestId("summary-backlog")).toHaveTextContent(
      String(counts.backlog),
    );
    expect(screen.getByTestId("summary-active")).toHaveTextContent(
      String(counts.active),
    );
    expect(screen.getByTestId("summary-merged")).toHaveTextContent(
      String(counts.merged),
    );
    expect(screen.getByTestId("summary-blocked")).toHaveTextContent(
      String(counts.blocked),
    );
  });

  it("renders one row per unit across the status columns", () => {
    render(<OpsPage />);
    const rows = screen.getAllByTestId("unit-row");
    expect(rows).toHaveLength(countByStatus(opsSnapshot).total);
  });

  it("places each unit in the column matching its derived status", () => {
    render(<OpsPage />);
    // Pick any unit the live snapshot reports as active and assert it shows up
    // in the in-progress column under that status. This stays correct as the
    // harness advances, instead of pinning a specific (drift-prone) unit id.
    const active = unitsByStatus(opsSnapshot, "active");
    if (active.length === 0) {
      // Nothing in flight right now; the column should still render empty.
      expect(screen.getByTestId("column-active")).toHaveTextContent(/no units/i);
      return;
    }
    const activeColumn = screen.getByTestId("column-active");
    const ids = within(activeColumn)
      .getAllByTestId("unit-row")
      .map((row) => row.getAttribute("data-unit-id"));
    for (const unit of active) {
      expect(ids).toContain(unit.id);
    }
  });

  it("renders blocked units in the blocked column when any exist", () => {
    render(<OpsPage />);
    const blocked = unitsByStatus(opsSnapshot, "blocked");
    const blockedColumn = screen.getByTestId("column-blocked");
    if (blocked.length === 0) {
      expect(blockedColumn).toHaveTextContent(/no units/i);
      return;
    }
    const ids = within(blockedColumn)
      .getAllByTestId("unit-row")
      .map((row) => row.getAttribute("data-unit-id"));
    for (const unit of blocked) {
      expect(ids).toContain(unit.id);
    }
  });

  it("renders a milestone progress bar per milestone", () => {
    render(<OpsPage />);
    for (const m of opsSnapshot.milestones) {
      expect(screen.getByTestId(`milestone-${m.id}`)).toBeInTheDocument();
    }
  });

  it("links back to the dashboard", () => {
    render(<OpsPage />);
    expect(
      screen.getByRole("link", { name: /back to dashboard/i }),
    ).toHaveAttribute("href", "#/");
  });
});
