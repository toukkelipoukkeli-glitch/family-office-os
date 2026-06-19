import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AreaChart } from "./area-chart";
import { BarChart } from "./bar-chart";
import { CandlestickChart } from "./candlestick-chart";
import { DonutChart } from "./donut-chart";
import { LineChart } from "./line-chart";
import { Sparkline } from "./sparkline";
import { Treemap } from "./treemap";
import {
  AREA_VALUES,
  BAR_DATA,
  CANDLE_DATA,
  DONUT_DATA,
  LINE_SERIES,
  SIGNED_BAR_DATA,
  SPARKLINE_VALUES,
  TREEMAP_DATA,
} from "./fixtures";

describe("Sparkline", () => {
  it("renders a path with one point per value and a last dot", () => {
    const { container } = render(<Sparkline values={SPARKLINE_VALUES} />);
    const svg = screen.getByTestId("sparkline");
    expect(svg).toHaveAttribute(
      "data-points",
      String(SPARKLINE_VALUES.length),
    );
    expect(container.querySelector("path")).toBeInTheDocument();
    expect(container.querySelector("circle")).toBeInTheDocument();
  });
  it("omits the last dot when disabled", () => {
    const { container } = render(
      <Sparkline values={SPARKLINE_VALUES} showLastDot={false} />,
    );
    expect(container.querySelector("circle")).not.toBeInTheDocument();
  });
});

describe("LineChart", () => {
  it("renders one path per series plus gridlines", () => {
    render(<LineChart series={LINE_SERIES} />);
    expect(screen.getByTestId("line-chart")).toHaveAttribute(
      "data-series",
      String(LINE_SERIES.length),
    );
    expect(screen.getAllByTestId("line-series")).toHaveLength(
      LINE_SERIES.length,
    );
    expect(screen.getAllByTestId("grid-line").length).toBeGreaterThan(0);
  });
  it("omits gridlines when grid is false", () => {
    render(<LineChart series={LINE_SERIES} grid={false} />);
    expect(screen.queryByTestId("grid-line")).not.toBeInTheDocument();
  });
  it("exposes each series label for accessibility", () => {
    render(<LineChart series={LINE_SERIES} />);
    const labels = screen
      .getAllByTestId("line-series")
      .map((p) => p.getAttribute("data-label"));
    expect(labels).toEqual(["Equities", "Bonds"]);
  });
});

describe("AreaChart", () => {
  it("renders both a fill and a stroke path", () => {
    render(<AreaChart values={AREA_VALUES} />);
    expect(screen.getByTestId("area-fill")).toBeInTheDocument();
    expect(screen.getByTestId("area-line")).toBeInTheDocument();
  });
});

describe("BarChart", () => {
  it("renders one rect per datum with value data attributes", () => {
    render(<BarChart data={BAR_DATA} />);
    const bars = screen.getAllByTestId("bar");
    expect(bars).toHaveLength(BAR_DATA.length);
    expect(bars[1]).toHaveAttribute("data-label", "Equities");
  });
  it("colours signed bars by sign", () => {
    render(<BarChart data={SIGNED_BAR_DATA} signed />);
    const bars = screen.getAllByTestId("bar");
    const negative = bars.find(
      (b) => Number(b.getAttribute("data-value")) < 0,
    );
    const positive = bars.find(
      (b) => Number(b.getAttribute("data-value")) > 0,
    );
    expect(negative).toHaveAttribute("fill", "var(--color-chart-down)");
    expect(positive).toHaveAttribute("fill", "var(--color-chart-up)");
  });
});

describe("DonutChart", () => {
  it("renders one segment per datum and a centre label", () => {
    render(<DonutChart data={DONUT_DATA} centerLabel="100%" />);
    expect(screen.getAllByTestId("donut-segment")).toHaveLength(
      DONUT_DATA.length,
    );
    expect(screen.getByTestId("donut-center-label")).toHaveTextContent("100%");
  });
  it("skips zero/negative-only data gracefully", () => {
    const { rerender } = render(<DonutChart data={[{ label: "x", value: 0 }]} />);
    expect(screen.queryByTestId("donut-segment")).not.toBeInTheDocument();
    rerender(
      <DonutChart
        data={[
          { label: "a", value: -3 },
          { label: "b", value: -1 },
        ]}
      />,
    );
    expect(screen.queryByTestId("donut-segment")).not.toBeInTheDocument();
  });
});

describe("Treemap", () => {
  it("renders one tile per datum", () => {
    render(<Treemap data={TREEMAP_DATA} />);
    expect(screen.getAllByTestId("treemap-tile")).toHaveLength(
      TREEMAP_DATA.length,
    );
  });
  it("labels the largest tiles", () => {
    render(<Treemap data={TREEMAP_DATA} />);
    const labels = screen
      .getAllByTestId("treemap-label")
      .map((t) => t.textContent);
    expect(labels).toContain("AAPL");
  });
});

describe("CandlestickChart", () => {
  it("renders a wick and body per candle with direction", () => {
    render(<CandlestickChart data={CANDLE_DATA} />);
    expect(screen.getAllByTestId("candle")).toHaveLength(CANDLE_DATA.length);
    expect(screen.getAllByTestId("candle-wick")).toHaveLength(
      CANDLE_DATA.length,
    );
    expect(screen.getAllByTestId("candle-body")).toHaveLength(
      CANDLE_DATA.length,
    );
    const directions = screen
      .getAllByTestId("candle")
      .map((c) => c.getAttribute("data-direction"));
    expect(directions).toContain("up");
    expect(directions).toContain("down");
  });
});
