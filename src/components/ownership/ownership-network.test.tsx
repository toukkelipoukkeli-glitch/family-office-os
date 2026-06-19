import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  crossHoldingCompanies,
  sampleCompanies,
} from "@/lib/company/fixtures";

import { entityTypeLabel } from "./entity-type-label";
import { OwnershipGraphView } from "./ownership-graph-page";
import { OwnershipNetwork } from "./ownership-network";

describe("entityTypeLabel", () => {
  it("maps known entity types to friendly labels", () => {
    expect(entityTypeLabel("holding_company")).toBe("Holding");
    expect(entityTypeLabel("llc")).toBe("LLC");
    expect(entityTypeLabel("corporation")).toBe("Corporation");
    expect(entityTypeLabel("fund")).toBe("Fund");
  });
});

describe("OwnershipNetwork", () => {
  it("renders one node group per company and reports counts", () => {
    render(<OwnershipNetwork companies={sampleCompanies} />);
    const svg = screen.getByTestId("ownership-network");
    expect(svg).toHaveAttribute("data-node-count", "4");
    expect(svg).toHaveAttribute("data-edge-count", "3");
    expect(screen.getAllByTestId("ownership-node")).toHaveLength(4);
    expect(screen.getAllByTestId("ownership-edge")).toHaveLength(3);
  });

  it("labels each edge with its direct stake percentage", () => {
    render(<OwnershipNetwork companies={sampleCompanies} />);
    const edges = screen.getAllByTestId("ownership-edge");
    const labels = edges.map((e) => e.getAttribute("data-percentage")).sort();
    expect(labels).toEqual(["100", "50", "75"].sort());
    // Percentage text is shown.
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("renders the cross-holding as two edges into the shared child", () => {
    render(<OwnershipNetwork companies={crossHoldingCompanies} />);
    const intoOpco = screen
      .getAllByTestId("ownership-edge")
      .filter((e) => e.getAttribute("data-child") === "co-opco");
    expect(intoOpco).toHaveLength(2);
  });

  it("marks the selected node and its touching edges active", () => {
    render(
      <OwnershipNetwork
        companies={sampleCompanies}
        selectedId="co-ventures"
      />,
    );
    const selected = screen
      .getAllByTestId("ownership-node")
      .find((n) => n.getAttribute("data-node-id") === "co-ventures");
    expect(selected).toHaveAttribute("data-selected", "true");

    // Edges touching co-ventures (topco->ventures, ventures->opco) are active.
    const activeEdges = screen
      .getAllByTestId("ownership-edge")
      .filter((e) => e.getAttribute("data-active") === "true");
    expect(activeEdges).toHaveLength(2);
  });

  it("fires onSelect when a node is clicked", () => {
    const onSelect = vi.fn();
    render(
      <OwnershipNetwork companies={sampleCompanies} onSelect={onSelect} />,
    );
    const opco = screen
      .getAllByTestId("ownership-node")
      .find((n) => n.getAttribute("data-node-id") === "co-opco")!;
    fireEvent.click(opco);
    expect(onSelect).toHaveBeenCalledWith("co-opco");
  });

  it("activates onSelect via keyboard (Enter)", () => {
    const onSelect = vi.fn();
    render(
      <OwnershipNetwork companies={sampleCompanies} onSelect={onSelect} />,
    );
    const node = screen
      .getAllByTestId("ownership-node")
      .find((n) => n.getAttribute("data-node-id") === "co-topco")!;
    fireEvent.keyDown(node, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("co-topco");
  });

  it("flags the root entity", () => {
    render(<OwnershipNetwork companies={sampleCompanies} />);
    const roots = screen
      .getAllByTestId("ownership-node")
      .filter((n) => n.getAttribute("data-root") === "true");
    expect(roots).toHaveLength(1);
    expect(roots[0]).toHaveAttribute("data-node-id", "co-topco");
  });
});

describe("OwnershipGraphView", () => {
  it("defaults the selection to the root and shows look-through ownership", () => {
    render(<OwnershipGraphView companies={crossHoldingCompanies} />);
    const detail = screen.getByTestId("ownership-detail");
    expect(within(detail).getByTestId("detail-name")).toHaveTextContent(
      "Ursin Holdings Oy",
    );
    // Root effective ownership of itself is 100%.
    expect(within(detail).getByTestId("detail-effective")).toHaveTextContent(
      "100%",
    );
    // Root is a top-level entity: no direct owners.
    expect(screen.getByTestId("detail-no-owners")).toBeInTheDocument();
  });

  it("updates the detail panel when a node is selected", () => {
    render(<OwnershipGraphView companies={crossHoldingCompanies} />);
    const opco = screen
      .getAllByTestId("ownership-node")
      .find((n) => n.getAttribute("data-node-id") === "co-opco")!;
    fireEvent.click(opco);

    const detail = screen.getByTestId("ownership-detail");
    expect(within(detail).getByTestId("detail-name")).toHaveTextContent(
      "Acme Operating Ltd",
    );
    // 75% * 50% (via ventures) + 100% * 30% (via real estate) = 67.5%.
    expect(within(detail).getByTestId("detail-effective")).toHaveTextContent(
      "67.5%",
    );
    // Two direct owners for the cross-held operating company.
    const owners = screen.getAllByTestId("detail-owner");
    expect(owners).toHaveLength(2);
    const ownerIds = owners
      .map((o) => o.getAttribute("data-owner-id"))
      .sort();
    expect(ownerIds).toEqual(["co-realestate", "co-ventures"].sort());
  });
});
