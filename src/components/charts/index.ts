/**
 * m0-charts — reusable, themed, dependency-free SVG charting kit.
 *
 * All components are pure SVG (no recharts/d3 runtime), theme-aware via the
 * `--color-chart-*` CSS variables, and deterministic so they can be snapshot-
 * and DOM-asserted offline.
 */
export { Sparkline, type SparklineProps } from "./sparkline";
export { LineChart, type LineChartProps, type LineSeries } from "./line-chart";
export { AreaChart, type AreaChartProps } from "./area-chart";
export { BarChart, type BarChartProps, type BarDatum } from "./bar-chart";
export {
  DonutChart,
  type DonutChartProps,
  type DonutDatum,
} from "./donut-chart";
export { Treemap, type TreemapProps, type TreemapDatum } from "./treemap";
export {
  CandlestickChart,
  type CandlestickChartProps,
  type CandlestickDatum,
} from "./candlestick-chart";

export {
  ChartFigure,
  type ChartFigureProps,
  type ChartTableColumn,
  type ChartTableRow,
} from "./chart-figure";

export { CHART_COLORS, seriesColor } from "./palette";
export * from "./chart-utils";
