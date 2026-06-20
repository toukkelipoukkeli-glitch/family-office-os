import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Money } from "@/lib/money";

import LookThroughPage, { LookThroughView } from "./LookThroughPage";
import { formatMoneyCompact, formatPct } from "./format";

describe("format helpers", () => {
  it("formats fractions as percentages, trimming zeros", () => {
    expect(formatPct(0.375)).toBe("37.5%");
    expect(formatPct(1)).toBe("100%");
    expect(formatPct(0.6)).toBe("60%");
  });

  it("formats money compactly without floating-point drift", () => {
    expect(formatMoneyCompact(Money.of("31792500", "USD"))).toBe("$31.79M");
    expect(formatMoneyCompact(Money.of("2500000", "USD"))).toBe("$2.5M");
    expect(formatMoneyCompact(Money.of("150000", "USD"))).toBe("$150K");
    expect(formatMoneyCompact(Money.of("1200000000", "USD"))).toBe("$1.2B");
    expect(formatMoneyCompact(Money.of("4800000", "EUR"))).toBe("EUR 4.8M");
  });
});

describe("LookThroughPage", () => {
  it("renders the page heading and back link", () => {
    render(<LookThroughPage />);
    expect(
      screen.getByRole("heading", { name: /cross-entity look-through/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /back to dashboard/i }),
    ).toHaveAttribute("href", "#/");
  });
});

describe("LookThroughView", () => {
  it("shows the consolidated total look-through value", () => {
    render(<LookThroughView />);
    // Total = $31.79M for the fixture, reported in the total stat + table.
    expect(screen.getByTestId("lt-table-total")).toHaveTextContent("$31.79M");
  });

  it("renders one donut segment and one table row per asset class", () => {
    render(<LookThroughView />);
    const rows = screen.getAllByTestId("lt-table-row");
    // 6 non-zero asset classes in the fixture.
    expect(rows).toHaveLength(6);
    expect(screen.getAllByTestId("donut-segment")).toHaveLength(6);
  });

  it("orders rows by look-through value, real estate first", () => {
    render(<LookThroughView />);
    const first = screen.getAllByTestId("lt-table-row")[0];
    expect(first).toHaveAttribute("data-asset-class", "real_estate");
    expect(first).toHaveTextContent("$10.88M");
  });

  it("selects the top asset class by default in the drill-down", () => {
    render(<LookThroughView />);
    const contrib = screen.getByTestId("lt-contrib");
    expect(within(contrib).getByTestId("lt-contrib-name")).toHaveTextContent(
      "Real estate",
    );
    // Real estate looks through to 3 entities.
    expect(screen.getAllByTestId("lt-contrib-row")).toHaveLength(3);
  });

  it("drills into a clicked asset class and lists its entities", () => {
    render(<LookThroughView />);
    const equityRow = screen
      .getAllByTestId("lt-table-row")
      .find((r) => r.getAttribute("data-asset-class") === "equity")!;
    fireEvent.click(equityRow);

    expect(equityRow).toHaveAttribute("data-selected", "true");
    const contrib = screen.getByTestId("lt-contrib");
    expect(within(contrib).getByTestId("lt-contrib-name")).toHaveTextContent(
      "Public equity",
    );
    const rows = within(contrib).getAllByTestId("lt-contrib-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveAttribute("data-entity-id", "meridian");
    expect(rows[0]).toHaveTextContent("100%");
  });

  it("re-consolidates when the reporting root changes", () => {
    render(<LookThroughView />);
    const select = screen.getByTestId("lt-root-select") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "harbor" } });

    // Harbor only sees real estate (its own + Pier 9 at 100%) = $14.8M.
    const rows = screen.getAllByTestId("lt-table-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveAttribute("data-asset-class", "real_estate");
    expect(screen.getByTestId("lt-table-total")).toHaveTextContent("$14.8M");
  });

  it("shows the contribution detail's gross-times-ownership math", () => {
    render(<LookThroughView />);
    // Default real-estate selection: Harbor contributes 8M gross × 60%.
    const contrib = screen.getByTestId("lt-contrib");
    const harborRow = within(contrib)
      .getAllByTestId("lt-contrib-row")
      .find((r) => r.getAttribute("data-entity-id") === "harbor")!;
    expect(harborRow).toHaveTextContent("$8M");
    expect(harborRow).toHaveTextContent("60%");
    expect(harborRow).toHaveTextContent("$4.8M");
  });

  it("renders the legend with a weight per class", () => {
    render(<LookThroughView />);
    expect(screen.getAllByTestId("lt-legend-item")).toHaveLength(6);
  });
});
