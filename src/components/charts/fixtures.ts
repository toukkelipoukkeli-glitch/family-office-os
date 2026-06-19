/**
 * Static, deterministic fixtures used by the chart tests and the demo gallery.
 * No live data — these are fixed arrays so tests stay offline and stable.
 */
import type { BarDatum } from "./bar-chart";
import type { CandlestickDatum } from "./candlestick-chart";
import type { DonutDatum } from "./donut-chart";
import type { LineSeries } from "./line-chart";
import type { TreemapDatum } from "./treemap";

export const SPARKLINE_VALUES: number[] = [4, 6, 5, 8, 7, 9, 11, 10, 13, 12];

export const LINE_SERIES: LineSeries[] = [
  { label: "Equities", values: [100, 104, 102, 110, 115, 113, 120] },
  { label: "Bonds", values: [100, 99, 101, 100, 102, 103, 102] },
];

export const AREA_VALUES: number[] = [
  12.4, 12.6, 12.5, 13.1, 13.0, 13.6, 14.2, 14.0,
];

export const BAR_DATA: BarDatum[] = [
  { label: "Cash", value: 8 },
  { label: "Equities", value: 42 },
  { label: "Bonds", value: 18 },
  { label: "Real estate", value: 22 },
  { label: "Alternatives", value: 10 },
];

export const SIGNED_BAR_DATA: BarDatum[] = [
  { label: "Jan", value: 3.2 },
  { label: "Feb", value: -1.4 },
  { label: "Mar", value: 2.1 },
  { label: "Apr", value: -0.8 },
  { label: "May", value: 4.0 },
];

export const DONUT_DATA: DonutDatum[] = [
  { label: "US", value: 55 },
  { label: "EU", value: 25 },
  { label: "APAC", value: 15 },
  { label: "EM", value: 5 },
];

export const TREEMAP_DATA: TreemapDatum[] = [
  { label: "AAPL", value: 30 },
  { label: "MSFT", value: 26 },
  { label: "NVDA", value: 18 },
  { label: "AMZN", value: 12 },
  { label: "GOOG", value: 9 },
  { label: "META", value: 5 },
];

export const CANDLE_DATA: CandlestickDatum[] = [
  { label: "D1", open: 100, high: 105, low: 98, close: 103 },
  { label: "D2", open: 103, high: 106, low: 101, close: 102 },
  { label: "D3", open: 102, high: 104, low: 99, close: 100 },
  { label: "D4", open: 100, high: 108, low: 100, close: 107 },
  { label: "D5", open: 107, high: 110, low: 105, close: 109 },
];
