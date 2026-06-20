import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import HomePage, { HomeOverview } from "./HomePage";

describe("HomePage", () => {
  it("renders the page heading and a back link to the full dashboard", () => {
    render(<HomePage />);
    expect(
      screen.getByRole("heading", { name: /executive overview/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /full dashboard/i }),
    ).toHaveAttribute("href", "#/");
  });
});

describe("HomeOverview", () => {
  it("renders the at-a-glance overview body", () => {
    render(<HomeOverview />);
    expect(screen.getByTestId("home-overview")).toBeInTheDocument();
  });

  it("renders six headline KPI tiles in cockpit order", () => {
    render(<HomeOverview />);
    const tiles = screen.getAllByTestId("home-kpi");
    expect(tiles.map((t) => t.getAttribute("data-kpi"))).toEqual([
      "net-worth",
      "twr",
      "volatility",
      "ips",
      "liquidity",
      "alerts",
    ]);
  });

  it("surfaces the seeded net worth and a positive window TWR", () => {
    render(<HomeOverview />);
    const nw = screen
      .getAllByTestId("home-kpi")
      .find((t) => t.getAttribute("data-kpi") === "net-worth")!;
    expect(within(nw).getByTestId("home-kpi-value")).toHaveTextContent("$7.22M");

    const twr = screen
      .getAllByTestId("home-kpi")
      .find((t) => t.getAttribute("data-kpi") === "twr")!;
    expect(within(twr).getByTestId("home-kpi-value")).toHaveTextContent(
      "+16.27%",
    );
  });

  it("marks the IPS and alerts tiles critical from the engine reports", () => {
    render(<HomeOverview />);
    const ips = screen
      .getAllByTestId("home-kpi")
      .find((t) => t.getAttribute("data-kpi") === "ips")!;
    expect(ips).toHaveAttribute("data-status", "critical");
    expect(within(ips).getByTestId("home-kpi-value")).toHaveTextContent(
      "3 breaches",
    );

    const alerts = screen
      .getAllByTestId("home-kpi")
      .find((t) => t.getAttribute("data-kpi") === "alerts")!;
    expect(alerts).toHaveAttribute("data-status", "critical");
  });

  it("links every tile into its module route", () => {
    render(<HomeOverview />);
    const hrefByKpi = Object.fromEntries(
      screen
        .getAllByTestId("home-kpi")
        .map((t) => [t.getAttribute("data-kpi"), t.getAttribute("href")]),
    );
    expect(hrefByKpi["net-worth"]).toBe("#/");
    expect(hrefByKpi["twr"]).toBe("#/benchmark");
    expect(hrefByKpi["volatility"]).toBe("#/risk");
    expect(hrefByKpi["ips"]).toBe("#/ips");
    expect(hrefByKpi["liquidity"]).toBe("#/cashflow");
    expect(hrefByKpi["alerts"]).toBe("#/alerts");
  });

  it("rolls the worst KPI status up to the page banner and shows open breaches", () => {
    render(<HomeOverview />);
    const banner = screen.getByTestId("home-status-banner");
    expect(banner).toHaveAttribute("data-status", "critical");
    // 3 (ips) + 3 (alerts) + 4 (risk) = 10 open governance breaches.
    expect(screen.getByTestId("home-open-breaches")).toHaveTextContent("10");
  });

  it("draws the net-worth trend sparkline", () => {
    render(<HomeOverview />);
    expect(screen.getByTestId("sparkline")).toBeInTheDocument();
  });
});
