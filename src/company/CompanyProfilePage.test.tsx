import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import {
  realEstateProfile,
  topcoProfile,
  venturesProfile,
} from "@/lib/company/profile-fixtures";

import CompanyProfilePage from "./CompanyProfilePage";

describe("CompanyProfilePage", () => {
  it("renders the page heading and a tab per company", () => {
    render(<CompanyProfilePage />);
    expect(
      screen.getByRole("heading", { name: /company profiles/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId("company-tab")).toHaveLength(3);
  });

  it("shows the three profile cards: financials, holdings, people", () => {
    render(<CompanyProfilePage />);
    expect(screen.getByTestId("financials-card")).toBeInTheDocument();
    expect(screen.getByTestId("holdings-card")).toBeInTheDocument();
    expect(screen.getByTestId("people-card")).toBeInTheDocument();
  });

  it("defaults to the top company and renders its identity", () => {
    render(<CompanyProfilePage />);
    const header = screen.getByTestId("company-header");
    expect(header).toHaveAttribute("data-company-id", "co-topco");
    expect(within(header).getByText("Ursin Holdings Oy")).toBeInTheDocument();
  });

  it("renders one financial KPI tile per headline metric", () => {
    render(<CompanyProfilePage />);
    // Revenue, EBITDA, Net income, Total assets, Equity, Net debt.
    expect(screen.getAllByTestId("financial-kpi")).toHaveLength(6);
    expect(screen.getByTestId("revenue-chart")).toBeInTheDocument();
  });

  it("renders one holdings row per holding with a total", () => {
    render(<CompanyProfilePage />);
    expect(screen.getAllByTestId("holding-row")).toHaveLength(
      topcoProfile.holdings.length,
    );
    // 52,400,000 EUR total formatted without fraction digits.
    expect(screen.getByTestId("holdings-total")).toHaveTextContent("52,400,000");
  });

  it("orders holdings largest value first", () => {
    render(<CompanyProfilePage />);
    const rows = screen.getAllByTestId("holding-row");
    expect(rows[0]).toHaveAttribute("data-holding-id", "h-realestate");
  });

  it("renders one person row per linked person", () => {
    render(<CompanyProfilePage />);
    expect(screen.getAllByTestId("person-row")).toHaveLength(
      topcoProfile.people.length,
    );
    expect(screen.getByText("Touko Ursin")).toBeInTheDocument();
  });

  it("switches the displayed company when another tab is clicked", async () => {
    const user = userEvent.setup();
    render(<CompanyProfilePage />);

    await user.click(
      screen.getByRole("tab", { name: "Ursin Ventures Oy" }),
    );

    const header = screen.getByTestId("company-header");
    expect(header).toHaveAttribute("data-company-id", "co-ventures");
    // Ventures has 3 holdings and 2 people.
    expect(screen.getAllByTestId("holding-row")).toHaveLength(
      venturesProfile.holdings.length,
    );
    expect(screen.getAllByTestId("person-row")).toHaveLength(
      venturesProfile.people.length,
    );
  });

  it("marks the active tab with aria-selected", async () => {
    const user = userEvent.setup();
    render(<CompanyProfilePage />);

    const reTab = screen.getByRole("tab", { name: "Ursin Real Estate Oy" });
    await user.click(reTab);
    expect(reTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByTestId("holding-row")).toHaveLength(
      realEstateProfile.holdings.length,
    );
  });

  it("links back to the dashboard", () => {
    render(<CompanyProfilePage />);
    expect(
      screen.getByRole("link", { name: /back to dashboard/i }),
    ).toHaveAttribute("href", "#/");
  });

  it("shows a negative net income in the destructive style for a loss-making entity", async () => {
    const user = userEvent.setup();
    render(<CompanyProfilePage />);
    await user.click(screen.getByRole("tab", { name: "Ursin Ventures Oy" }));

    const kpis = screen.getAllByTestId("financial-kpi");
    const netIncome = kpis.find((k) =>
      within(k).queryByText(/net income/i),
    );
    expect(netIncome).toBeDefined();
    // FY2024 net income is -180,000 → rendered with a minus sign.
    expect(netIncome!.textContent).toMatch(/-/);
  });
});
