import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { assetClassLabel } from "@/lib/model/asset-class";
import { seededNetWorth } from "@/lib/networth";

import { NetWorthDashboard } from "./NetWorthDashboard";

describe("NetWorthDashboard", () => {
  it("renders the consolidated net-worth chart and KPIs by default", () => {
    render(<NetWorthDashboard model={seededNetWorth} />);

    expect(screen.getByTestId("networth-dashboard")).toBeInTheDocument();
    expect(screen.getByTestId("networth-chart-title")).toHaveTextContent(
      "Total net worth",
    );
    // Area chart drawn with one point per series observation.
    const area = screen.getByTestId("networth-area");
    expect(area).toBeInTheDocument();
    expect(area).toHaveAttribute(
      "data-points",
      String(seededNetWorth.total.points.length),
    );
    // KPI panel present.
    expect(screen.getByTestId("kpi-current")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-return")).toBeInTheDocument();
  });

  it("renders an allocation donut with one segment per asset class", () => {
    render(<NetWorthDashboard model={seededNetWorth} />);
    const donut = screen.getByTestId("networth-donut");
    expect(donut).toHaveAttribute(
      "data-segments",
      String(seededNetWorth.byAssetClass.length),
    );
  });

  it("lists every asset class as a drill-down row, sorted by value", () => {
    render(<NetWorthDashboard model={seededNetWorth} />);
    const rows = screen.getAllByTestId("asset-class-row");
    expect(rows).toHaveLength(seededNetWorth.byAssetClass.length);
    expect(rows[0]).toHaveAttribute(
      "data-asset-class",
      seededNetWorth.byAssetClass[0].assetClass,
    );
  });

  it("drills into an asset class when its row is clicked", async () => {
    const user = userEvent.setup();
    render(<NetWorthDashboard model={seededNetWorth} />);

    // The largest class is first; drill into a known one (crypto).
    const cryptoRow = screen
      .getAllByTestId("asset-class-row")
      .find((r) => r.getAttribute("data-asset-class") === "crypto")!;
    expect(cryptoRow).toBeDefined();

    await user.click(cryptoRow);

    // Title switches to the asset class label.
    expect(screen.getByTestId("networth-chart-title")).toHaveTextContent(
      assetClassLabel("crypto"),
    );
    expect(cryptoRow).toHaveAttribute("data-selected", "true");
    expect(cryptoRow).toHaveAttribute("aria-pressed", "true");

    // A "back to total" control appears.
    expect(
      screen.getByTestId("networth-clear-selection"),
    ).toBeInTheDocument();
  });

  it("returns to the consolidated view via the back control", async () => {
    const user = userEvent.setup();
    render(<NetWorthDashboard model={seededNetWorth} />);

    const firstRow = screen.getAllByTestId("asset-class-row")[0];
    await user.click(firstRow);
    expect(screen.getByTestId("networth-chart-title")).not.toHaveTextContent(
      "Total net worth",
    );

    await user.click(screen.getByTestId("networth-clear-selection"));
    expect(screen.getByTestId("networth-chart-title")).toHaveTextContent(
      "Total net worth",
    );
  });

  it("toggles a selected class off when its row is clicked again", async () => {
    const user = userEvent.setup();
    render(<NetWorthDashboard model={seededNetWorth} />);

    const firstRow = screen.getAllByTestId("asset-class-row")[0];
    await user.click(firstRow);
    expect(firstRow).toHaveAttribute("data-selected", "true");
    await user.click(firstRow);
    expect(firstRow).toHaveAttribute("data-selected", "false");
    expect(screen.getByTestId("networth-chart-title")).toHaveTextContent(
      "Total net worth",
    );
  });

  it("shows the holding count for the cash class in its row", () => {
    render(<NetWorthDashboard model={seededNetWorth} />);
    const cashRow = screen
      .getAllByTestId("asset-class-row")
      .find((r) => r.getAttribute("data-asset-class") === "cash")!;
    expect(within(cashRow).getByText(/2 holdings/i)).toBeInTheDocument();
  });
});
