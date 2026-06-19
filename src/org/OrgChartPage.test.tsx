import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { buildOrgForest, countNodes, ORG_FIXTURE } from "@/lib/org";

import OrgChartPage from "./OrgChartPage";
import { formatNav, formatPct } from "./org-format";

describe("org-format", () => {
  it("formats whole percentages without decimals", () => {
    expect(formatPct(0.6)).toBe("60%");
    expect(formatPct(1)).toBe("100%");
  });

  it("formats fractional percentages, trimming trailing zeros", () => {
    expect(formatPct(0.375)).toBe("37.5%");
    expect(formatPct(0.8)).toBe("80%");
  });

  it("formats NAV compactly and returns null for zero", () => {
    expect(formatNav({ amount: "4200000", currency: "USD" })).toBe("$4.2M");
    expect(formatNav({ amount: "0", currency: "USD" })).toBeNull();
    expect(formatNav(undefined)).toBeNull();
  });
});

describe("OrgChartPage", () => {
  it("renders the page heading and back link", () => {
    render(<OrgChartPage />);
    expect(
      screen.getByRole("heading", { name: /org hierarchy/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /back to dashboard/i }),
    ).toHaveAttribute("href", "#/");
  });

  it("renders one SVG node per tree node", () => {
    render(<OrgChartPage />);
    const expected = countNodes(buildOrgForest(ORG_FIXTURE));
    expect(screen.getAllByTestId("org-node")).toHaveLength(expected);
  });

  it("draws an edge with a percentage label per parent-child", () => {
    render(<OrgChartPage />);
    const labels = screen
      .getAllByTestId("org-edge-label")
      .map((n) => n.textContent);
    // Harbor is held 60% by holdco.
    expect(labels).toContain("60%");
    // Aurora is held 75%.
    expect(labels).toContain("75%");
  });

  it("selects the root by default and shows it in the detail panel", () => {
    render(<OrgChartPage />);
    const detail = screen.getByTestId("org-detail");
    expect(within(detail).getByText("Vandermeer Family Trust")).toBeInTheDocument();
  });

  it("updates the detail panel and look-through when a node is clicked", () => {
    render(<OrgChartPage />);
    const climate = screen
      .getAllByTestId("org-node")
      .find((n) => n.getAttribute("data-entity-id") === "aurora-climate")!;
    fireEvent.click(climate);

    const detail = screen.getByTestId("org-detail");
    expect(within(detail).getByText("Aurora Climate SPV")).toBeInTheDocument();
    // Look-through from the trust root: 100% * 75% * 50% = 37.5%.
    const rows = within(detail).getAllByTestId("lookthrough-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("37.5%");
    expect(rows[0]).toHaveTextContent("Vandermeer Family Trust");
  });

  it("marks the selected node with data-selected", () => {
    render(<OrgChartPage />);
    const harbor = screen
      .getAllByTestId("org-node")
      .find((n) => n.getAttribute("data-entity-id") === "harbor")!;
    fireEvent.click(harbor);
    expect(harbor).toHaveAttribute("data-selected", "true");
  });

  it("shows root entity has no upstream owner in look-through", () => {
    render(<OrgChartPage />);
    // Default selection is the root trust.
    const detail = screen.getByTestId("org-detail");
    expect(
      within(detail).getByText(/top-level root/i),
    ).toBeInTheDocument();
  });

  it("reports structure stats", () => {
    render(<OrgChartPage />);
    const tiles = screen.getAllByTestId("org-stat");
    // 8 entities, 1 root, depth 3, kinds count.
    expect(tiles[0]).toHaveTextContent("8");
    expect(tiles[1]).toHaveTextContent("1");
    expect(tiles[2]).toHaveTextContent("3");
  });
});
