import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ReportingCurrencyProvider } from "@/lib/reporting-currency";

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

describe("HomeOverview — reporting currency", () => {
  /** The net-worth tile's primary value element. */
  function netWorthValue() {
    const nw = screen
      .getAllByTestId("home-kpi")
      .find((t) => t.getAttribute("data-kpi") === "net-worth")!;
    return within(nw).getByTestId("home-kpi-value");
  }

  /** The liquidity tile (its detail line carries the min-balance figure). */
  function liquidityTile() {
    return screen
      .getAllByTestId("home-kpi")
      .find((t) => t.getAttribute("data-kpi") === "liquidity")!;
  }

  it("shows base-currency (USD) figures without a provider (no-op path)", () => {
    render(<HomeOverview />);
    expect(netWorthValue()).toHaveTextContent("$7.22M");
    expect(screen.getByTestId("home-banner-networth")).toHaveTextContent(
      "$7.22M",
    );
    expect(liquidityTile()).toHaveTextContent("min balance $480K");
  });

  it("re-expresses every monetary figure when the reporting base is EUR", () => {
    render(
      <ReportingCurrencyProvider initialCurrency="EUR">
        <HomeOverview />
      </ReportingCurrencyProvider>,
    );

    // Net worth: $7.22M base -> €6.69M at the seeded EUR rate. The headline tile
    // and the banner mirror each other.
    expect(netWorthValue()).toHaveTextContent("€6.69M");
    expect(screen.getByTestId("home-banner-networth")).toHaveTextContent(
      "€6.69M",
    );

    // The min-balance figure embedded in the liquidity detail re-expresses too,
    // while the surrounding template (and the runway month count) is preserved.
    const liq = liquidityTile();
    expect(liq).toHaveTextContent(/min balance €/);
    expect(liq).not.toHaveTextContent("$");
  });

  it("reverts to USD figures when the reporting base is switched back", () => {
    const eur = render(
      <ReportingCurrencyProvider initialCurrency="EUR">
        <HomeOverview />
      </ReportingCurrencyProvider>,
    );
    expect(netWorthValue()).toHaveTextContent("€6.69M");
    eur.unmount();

    render(
      <ReportingCurrencyProvider initialCurrency="USD">
        <HomeOverview />
      </ReportingCurrencyProvider>,
    );
    expect(netWorthValue()).toHaveTextContent("$7.22M");
  });

  it("leaves non-monetary tiles (TWR, runway) unchanged under conversion", () => {
    render(
      <ReportingCurrencyProvider initialCurrency="EUR">
        <HomeOverview />
      </ReportingCurrencyProvider>,
    );

    const twr = screen
      .getAllByTestId("home-kpi")
      .find((t) => t.getAttribute("data-kpi") === "twr")!;
    expect(within(twr).getByTestId("home-kpi-value")).toHaveTextContent(
      "+16.27%",
    );

    // The runway tile's primary value is a month count, not money: it must not
    // grow a currency symbol when the reporting base changes.
    const liqValue = within(liquidityTile()).getByTestId("home-kpi-value");
    expect(liqValue).toHaveTextContent(/mo$/);
    expect(liqValue).not.toHaveTextContent(/[€$£]/);
  });
});
