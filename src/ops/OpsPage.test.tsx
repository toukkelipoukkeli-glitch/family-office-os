import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { opsSnapshot } from "./ops-data";
import OpsPage from "./OpsPage";
import { countByStatus, progressPercent } from "./ops-selectors";

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

  it("places the m4-ops unit in the in-progress column", () => {
    render(<OpsPage />);
    const activeColumn = screen.getByTestId("column-active");
    const opsRow = within(activeColumn)
      .getAllByTestId("unit-row")
      .find((row) => row.getAttribute("data-unit-id") === "m4-ops");
    expect(opsRow).toBeDefined();
    expect(opsRow).toHaveAttribute("data-status", "active");
  });

  it("shows blocked units with their note", () => {
    render(<OpsPage />);
    const blockedColumn = screen.getByTestId("column-blocked");
    expect(
      within(blockedColumn).getByText(/needs convex project provisioning/i),
    ).toBeInTheDocument();
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
