import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { seededPrivateMarketsModel } from "@/lib/privatemarkets";

import PrivateMarketsPage from "./PrivateMarketsPage";

describe("PrivateMarketsPage", () => {
  it("renders the heading and the six headline KPIs", () => {
    render(<PrivateMarketsPage />);
    expect(
      screen.getByRole("heading", { name: /private-markets commitments/i }),
    ).toBeInTheDocument();
    for (const id of [
      "kpi-committed",
      "kpi-paidin",
      "kpi-distributed",
      "kpi-unfunded",
      "kpi-tvpi",
      "kpi-irr",
    ]) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
  });

  it("draws the per-fund bar chart with one bar per commitment", () => {
    render(<PrivateMarketsPage />);
    const bar = screen.getByTestId("bar-chart");
    expect(bar).toHaveAttribute(
      "data-bars",
      String(seededPrivateMarketsModel.commitments.length),
    );
  });

  it("draws the J-curve line chart with two series and a drawdown summary", () => {
    render(<PrivateMarketsPage />);
    expect(screen.getByTestId("line-chart")).toBeInTheDocument();
    expect(screen.getByTestId("jcurve-summary")).toBeInTheDocument();
  });

  it("lists every commitment in the table, largest committed first", () => {
    render(<PrivateMarketsPage />);
    const rows = screen.getAllByTestId("privatemarkets-row");
    expect(rows).toHaveLength(seededPrivateMarketsModel.commitments.length);
    expect(rows.map((r) => r.getAttribute("data-fund"))).toEqual(
      seededPrivateMarketsModel.commitments.map((c) => c.id),
    );
    // The 10M buyout commitment heads the table.
    expect(rows[0].getAttribute("data-fund")).toBe("pe-buyout-2017");
  });

  it("shows the TVPI multiple from the seeded model", () => {
    render(<PrivateMarketsPage />);
    const expected = `${seededPrivateMarketsModel.kpis.tvpi.toFixed(2)}x`;
    expect(screen.getByTestId("kpi-tvpi")).toHaveTextContent(expected);
  });

  it("renders an em-dash for an undefined IRR", () => {
    const model = {
      ...seededPrivateMarketsModel,
      kpis: { ...seededPrivateMarketsModel.kpis, irr: null },
    };
    render(<PrivateMarketsPage model={model} />);
    expect(screen.getByTestId("kpi-irr")).toHaveTextContent("—");
  });

  it("renders from a custom model prop", () => {
    const model = {
      ...seededPrivateMarketsModel,
      commitments: [seededPrivateMarketsModel.commitments[0]],
      jcurves: [seededPrivateMarketsModel.jcurves[0]],
    };
    render(<PrivateMarketsPage model={model} />);
    expect(screen.getAllByTestId("privatemarkets-row")).toHaveLength(1);
  });
});
