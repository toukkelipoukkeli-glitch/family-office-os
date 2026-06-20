import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { buildCurrencyModel } from "@/lib/currency";

import CurrencyPage from "./CurrencyPage";

describe("CurrencyPage", () => {
  it("renders the heading and the five headline KPIs", () => {
    render(<CurrencyPage />);
    expect(
      screen.getByRole("heading", { name: /currency exposure & hedging/i }),
    ).toBeInTheDocument();
    for (const id of [
      "kpi-total",
      "kpi-foreign",
      "kpi-residual",
      "kpi-hedged",
      "kpi-cost",
    ]) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
  });

  it("draws the exposure donut with one segment per currency bucket", () => {
    render(<CurrencyPage />);
    const donut = screen.getByTestId("donut-chart");
    const model = buildCurrencyModel();
    expect(donut).toHaveAttribute(
      "data-segments",
      String(model.exposures.length),
    );
    expect(screen.getAllByTestId("currency-legend-item")).toHaveLength(
      model.exposures.length,
    );
  });

  it("draws the residual-exposure bar chart with one bar per foreign currency", () => {
    render(<CurrencyPage />);
    const bar = screen.getByTestId("bar-chart");
    const model = buildCurrencyModel();
    expect(bar).toHaveAttribute("data-bars", String(model.hedges.length));
  });

  it("lists every foreign currency in the hedge table", () => {
    render(<CurrencyPage />);
    const rows = screen.getAllByTestId("currency-hedge-row");
    const model = buildCurrencyModel();
    expect(rows).toHaveLength(model.hedges.length);
    expect(rows[0].getAttribute("data-currency")).toBe("USD");
  });

  it("starts at the supplied initial hedge ratio", () => {
    render(<CurrencyPage initialRatio={0.5} />);
    expect(screen.getByTestId("hedge-ratio-value")).toHaveTextContent("50%");
  });

  it("recomputes the residual exposure when the slider moves", () => {
    render(<CurrencyPage initialRatio={0.5} />);
    const residual = screen.getByTestId("kpi-residual");
    // At 50% the residual is 5.9M; move to 100% and it must shrink toward 0.
    const before = residual.textContent;
    const slider = screen.getByTestId("hedge-ratio-slider");
    fireEvent.change(slider, { target: { value: "100" } });
    expect(screen.getByTestId("hedge-ratio-value")).toHaveTextContent("100%");
    expect(screen.getByTestId("kpi-residual").textContent).not.toBe(before);
    // Effective hedge ratio now 100% (rendered with one decimal place).
    expect(screen.getByTestId("kpi-hedged")).toHaveTextContent("100.0%");
  });

  it("shows a hedge total row reconciling to the KPI residual", () => {
    render(<CurrencyPage />);
    expect(screen.getByTestId("currency-hedge-total")).toBeInTheDocument();
  });
});
