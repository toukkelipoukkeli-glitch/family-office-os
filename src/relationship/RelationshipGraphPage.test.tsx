import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { sampleRelationshipGraph } from "@/lib/relationship/fixtures";
import { countNodeKinds } from "@/lib/relationship/relationship-graph";

import {
  RelationshipGraphPage,
  RelationshipGraphView,
} from "./RelationshipGraphPage";

describe("RelationshipGraphView", () => {
  it("renders the headline stats from the graph", () => {
    render(<RelationshipGraphView />);
    const counts = countNodeKinds(sampleRelationshipGraph);
    const stats = screen.getByTestId("relationship-stats");
    expect(within(stats).getByText("People").previousSibling).toHaveTextContent(
      String(counts.person),
    );
    expect(
      within(stats).getByText("Founders / investors").previousSibling,
    ).toHaveTextContent(String(counts.contact));
  });

  it("renders one SVG node per graph node and a legend", () => {
    render(<RelationshipGraphView />);
    expect(screen.getAllByTestId("relationship-node")).toHaveLength(
      sampleRelationshipGraph.nodes.length,
    );
    expect(screen.getAllByTestId("legend-item")).toHaveLength(4);
  });

  it("renders one SVG edge per graph edge", () => {
    render(<RelationshipGraphView />);
    expect(screen.getAllByTestId("relationship-edge")).toHaveLength(
      sampleRelationshipGraph.edges.length,
    );
  });

  it("shows a placeholder detail panel before any selection", () => {
    render(<RelationshipGraphView />);
    const panel = screen.getByTestId("detail-panel");
    expect(within(panel).getByText(/select a node/i)).toBeInTheDocument();
  });

  it("selects a node on click and lists its neighbours in the detail panel", async () => {
    const user = userEvent.setup();
    render(<RelationshipGraphView />);

    const topco = screen
      .getAllByTestId("relationship-node")
      .find((el) => el.getAttribute("data-node-id") === "company:co-topco");
    expect(topco).toBeTruthy();
    await user.click(topco!);

    expect(topco).toHaveAttribute("data-selected", "true");

    const panel = screen.getByTestId("detail-panel");
    // topco has degree 4 (2 owners + 2 subsidiaries).
    expect(within(panel).getByTestId("detail-degree")).toHaveTextContent(
      "4 direct connections",
    );
    const neighbors = within(panel).getAllByTestId("detail-neighbor");
    expect(neighbors).toHaveLength(4);
    expect(within(panel).getByText("Ursin Holdings Oy")).toBeInTheDocument();
  });

  it("toggles the selection off when the same node is clicked twice", async () => {
    const user = userEvent.setup();
    render(<RelationshipGraphView />);
    const node = screen
      .getAllByTestId("relationship-node")
      .find((el) => el.getAttribute("data-node-id") === "company:co-topco")!;

    await user.click(node);
    expect(node).toHaveAttribute("data-selected", "true");
    await user.click(node);
    expect(node).toHaveAttribute("data-selected", "false");
    expect(
      within(screen.getByTestId("detail-panel")).getByText(/select a node/i),
    ).toBeInTheDocument();
  });
});

describe("RelationshipGraphPage", () => {
  it("renders the page chrome with a heading and back link", () => {
    render(<RelationshipGraphPage />);
    expect(
      screen.getByRole("heading", { name: /relationship graph/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("relationships-back")).toHaveAttribute(
      "href",
      "#/",
    );
    expect(screen.getByTestId("relationship-graph")).toBeInTheDocument();
  });
});
