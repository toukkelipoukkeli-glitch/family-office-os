/**
 * Pure, deterministic geometry helpers shared by the chart components.
 *
 * Everything here is side-effect free and framework-agnostic so the math can be
 * unit-tested in isolation (the "oracle" for these visual components). No chart
 * component should compute layout math inline — it should call into here.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Margin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const DEFAULT_MARGIN: Margin = { top: 8, right: 8, bottom: 8, left: 8 };

/** Inclusive numeric range. */
export interface Extent {
  min: number;
  max: number;
}

/**
 * Compute the [min, max] extent of a list of numbers. Returns a zero-width
 * extent centred on the single value when only one (or repeated) value exists,
 * and a safe [0, 1] when the list is empty.
 */
export function extent(values: readonly number[]): Extent {
  if (values.length === 0) return { min: 0, max: 1 };
  let min = values[0];
  let max = values[0];
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}

/**
 * Build a linear scale function mapping a value in [domainMin, domainMax] to
 * [rangeMin, rangeMax]. A zero-width domain maps everything to the range
 * midpoint to avoid division by zero.
 */
export function linearScale(
  domain: Extent,
  rangeMin: number,
  rangeMax: number,
): (value: number) => number {
  const span = domain.max - domain.min;
  if (span === 0) {
    const mid = (rangeMin + rangeMax) / 2;
    return () => mid;
  }
  const ratio = (rangeMax - rangeMin) / span;
  return (value: number) => rangeMin + (value - domain.min) * ratio;
}

/** Clamp a number into the inclusive [lo, hi] range. */
export function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/** Round to a fixed number of decimals (default 2) to keep SVG paths compact. */
export function round(value: number, decimals = 2): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/**
 * Map an array of y-values to evenly spaced points across an inner plot area.
 * `padY` (0..0.5) reserves vertical headroom so peaks/troughs are not clipped.
 *
 * Pass `domain` to map against an explicit y-extent (e.g. a shared extent across
 * several series) instead of the values' own min/max.
 */
export function pointsFromValues(
  values: readonly number[],
  width: number,
  height: number,
  margin: Margin = DEFAULT_MARGIN,
  padY = 0,
  domain?: Extent,
): Point[] {
  const innerW = Math.max(0, width - margin.left - margin.right);
  const innerH = Math.max(0, height - margin.top - margin.bottom);
  const yExtent = domain ?? extent(values);
  const pad = (yExtent.max - yExtent.min) * padY;
  const padded: Extent = {
    min: yExtent.min - pad,
    max: yExtent.max + pad,
  };
  const x = linearScale(
    { min: 0, max: Math.max(1, values.length - 1) },
    margin.left,
    margin.left + innerW,
  );
  // y is inverted: larger values sit higher (smaller pixel y).
  const y = linearScale(padded, margin.top + innerH, margin.top);
  return values.map((v, i) => ({ x: round(x(i)), y: round(y(v)) }));
}

/** Build an SVG polyline `points` string ("x,y x,y ..."). */
export function toPolyline(points: readonly Point[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}

/** Build an SVG path `d` for a line through the points. */
export function toLinePath(points: readonly Point[]): string {
  if (points.length === 0) return "";
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`)
    .join(" ");
}

/**
 * Build a closed area path: the line across the top, then down to `baselineY`
 * and back. Returns "" for empty input.
 */
export function toAreaPath(
  points: readonly Point[],
  baselineY: number,
): string {
  if (points.length === 0) return "";
  const first = points[0];
  const last = points[points.length - 1];
  return (
    toLinePath(points) +
    ` L${round(last.x)},${round(baselineY)}` +
    ` L${round(first.x)},${round(baselineY)} Z`
  );
}

export interface BarRect {
  x: number;
  y: number;
  width: number;
  height: number;
  value: number;
}

/**
 * Lay out vertical bars across the inner plot area. Bars share a common
 * baseline at value 0 when the data spans zero, otherwise at the domain min.
 */
export function barLayout(
  values: readonly number[],
  width: number,
  height: number,
  margin: Margin = DEFAULT_MARGIN,
  gapRatio = 0.2,
): BarRect[] {
  if (values.length === 0) return [];
  const innerW = Math.max(0, width - margin.left - margin.right);
  const innerH = Math.max(0, height - margin.top - margin.bottom);
  const raw = extent(values);
  const domain: Extent = {
    min: Math.min(0, raw.min),
    max: Math.max(0, raw.max),
  };
  const y = linearScale(domain, margin.top + innerH, margin.top);
  const baseline = y(0);
  const slot = innerW / values.length;
  // Clamp the public gap input so out-of-range callers can't yield negative
  // (or full-slot) SVG widths.
  const gap = clamp(gapRatio, 0, 1);
  const barW = round(slot * (1 - gap));
  const offset = (slot - barW) / 2;
  return values.map((v, i) => {
    const vy = y(v);
    const top = Math.min(vy, baseline);
    const h = Math.abs(vy - baseline);
    return {
      x: round(margin.left + i * slot + offset),
      y: round(top),
      width: barW,
      height: round(h),
      value: v,
    };
  });
}

export interface DonutSegment {
  value: number;
  /** Cumulative fraction at which this segment starts (0..1). */
  startFraction: number;
  endFraction: number;
  /** SVG path `d` for the arc segment (filled wedge / ring slice). */
  path: string;
}

const TAU = Math.PI * 2;

/** Point on a circle for a given fraction (0 = 12 o'clock, clockwise). */
function polar(
  cx: number,
  cy: number,
  r: number,
  fraction: number,
): Point {
  const angle = fraction * TAU - Math.PI / 2;
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

/**
 * Build the SVG `d` for a single donut/pie segment between two fractions.
 *
 * A segment whose sweep covers (almost) the whole circle is a special case: an
 * SVG arc whose start and end points coincide draws nothing, so a lone 100%
 * slice would render invisible. We split any near-full-circle segment into two
 * half-sweep arcs through the midpoint so it always renders as a full ring/disc.
 */
function donutSegmentPath(
  cx: number,
  cy: number,
  outerRadius: number,
  innerRadius: number,
  startFraction: number,
  endFraction: number,
  sweep: number,
): string {
  // Endpoints coincide once the sweep reaches a full turn; split to be safe.
  const FULL_CIRCLE_EPS = 1e-6;
  if (sweep >= 1 - FULL_CIRCLE_EPS) {
    const mid = startFraction + sweep / 2;
    return (
      donutSegmentPath(
        cx,
        cy,
        outerRadius,
        innerRadius,
        startFraction,
        mid,
        sweep / 2,
      ) +
      " " +
      donutSegmentPath(
        cx,
        cy,
        outerRadius,
        innerRadius,
        mid,
        endFraction,
        sweep / 2,
      )
    );
  }
  const largeArc = sweep > 0.5 ? 1 : 0;
  const oStart = polar(cx, cy, outerRadius, startFraction);
  const oEnd = polar(cx, cy, outerRadius, endFraction);
  if (innerRadius > 0) {
    const iStart = polar(cx, cy, innerRadius, startFraction);
    const iEnd = polar(cx, cy, innerRadius, endFraction);
    return (
      `M${round(oStart.x)},${round(oStart.y)} ` +
      `A${round(outerRadius)},${round(outerRadius)} 0 ${largeArc} 1 ${round(oEnd.x)},${round(oEnd.y)} ` +
      `L${round(iEnd.x)},${round(iEnd.y)} ` +
      `A${round(innerRadius)},${round(innerRadius)} 0 ${largeArc} 0 ${round(iStart.x)},${round(iStart.y)} Z`
    );
  }
  return (
    `M${round(cx)},${round(cy)} ` +
    `L${round(oStart.x)},${round(oStart.y)} ` +
    `A${round(outerRadius)},${round(outerRadius)} 0 ${largeArc} 1 ${round(oEnd.x)},${round(oEnd.y)} Z`
  );
}

/**
 * Lay out donut/pie segments. `innerRadius` of 0 yields a pie. Negative or zero
 * total yields an empty layout. Each segment is a ring-slice path.
 */
export function donutLayout(
  values: readonly number[],
  cx: number,
  cy: number,
  outerRadius: number,
  innerRadius: number,
): DonutSegment[] {
  const total = values.reduce((sum, v) => sum + Math.max(0, v), 0);
  if (total <= 0) return [];
  const segments: DonutSegment[] = [];
  let acc = 0;
  for (const v of values) {
    const value = Math.max(0, v);
    const startFraction = acc / total;
    acc += value;
    const endFraction = acc / total;
    const sweep = endFraction - startFraction;
    const path = donutSegmentPath(
      cx,
      cy,
      outerRadius,
      innerRadius,
      startFraction,
      endFraction,
      sweep,
    );
    segments.push({ value, startFraction, endFraction, path });
  }
  return segments;
}

export interface TreemapNode {
  value: number;
  label?: string;
}

export interface TreemapTile extends TreemapNode {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Squarified-lite treemap: a simple slice-and-dice that alternates split
 * direction by the longer side at each step, producing reasonably proportioned
 * tiles deterministically. Tiles are returned in input order.
 */
export function treemapLayout(
  nodes: readonly TreemapNode[],
  width: number,
  height: number,
): TreemapTile[] {
  const positive = nodes.map((n) => ({ ...n, value: Math.max(0, n.value) }));
  const total = positive.reduce((s, n) => s + n.value, 0);
  if (total <= 0 || width <= 0 || height <= 0) return [];

  const tiles: TreemapTile[] = [];

  function layout(
    items: { node: TreemapNode; value: number; index: number }[],
    x: number,
    y: number,
    w: number,
    h: number,
  ): void {
    if (items.length === 0) return;
    if (items.length === 1) {
      const it = items[0];
      tiles[it.index] = {
        ...it.node,
        value: it.value,
        x: round(x),
        y: round(y),
        width: round(w),
        height: round(h),
      };
      return;
    }
    const sum = items.reduce((s, it) => s + it.value, 0);
    // All remaining items are zero-value: dividing by `sum` would yield NaN.
    // Give each a zero-area tile at this corner so geometry stays finite.
    if (sum === 0) {
      for (const it of items) {
        tiles[it.index] = {
          ...it.node,
          value: it.value,
          x: round(x),
          y: round(y),
          width: 0,
          height: 0,
        };
      }
      return;
    }
    // Split into two halves by value, recurse along the longer axis.
    let half = 0;
    let splitAt = 0;
    for (let i = 0; i < items.length; i++) {
      half += items[i].value;
      if (half >= sum / 2) {
        splitAt = i + 1;
        break;
      }
    }
    splitAt = clamp(splitAt, 1, items.length - 1);
    const first = items.slice(0, splitAt);
    const second = items.slice(splitAt);
    const firstSum = first.reduce((s, it) => s + it.value, 0);
    const frac = firstSum / sum;
    if (w >= h) {
      const fw = w * frac;
      layout(first, x, y, fw, h);
      layout(second, x + fw, y, w - fw, h);
    } else {
      const fh = h * frac;
      layout(first, x, y, w, fh);
      layout(second, x, y + fh, w, h - fh);
    }
  }

  layout(
    positive.map((node, index) => ({ node, value: node.value, index })),
    0,
    0,
    width,
    height,
  );
  return tiles;
}

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface CandleRect {
  /** Center x of the candle. */
  cx: number;
  /** Body rectangle. */
  bodyX: number;
  bodyY: number;
  bodyWidth: number;
  bodyHeight: number;
  /** Wick line endpoints. */
  highY: number;
  lowY: number;
  /** True when close >= open. */
  bullish: boolean;
  candle: Candle;
}

/** Lay out OHLC candlesticks across the inner plot area. */
export function candlestickLayout(
  candles: readonly Candle[],
  width: number,
  height: number,
  margin: Margin = DEFAULT_MARGIN,
  gapRatio = 0.3,
): CandleRect[] {
  if (candles.length === 0) return [];
  const innerW = Math.max(0, width - margin.left - margin.right);
  const innerH = Math.max(0, height - margin.top - margin.bottom);
  const lows = candles.map((c) => c.low);
  const highs = candles.map((c) => c.high);
  const domain: Extent = {
    min: Math.min(...lows),
    max: Math.max(...highs),
  };
  const y = linearScale(domain, margin.top + innerH, margin.top);
  const slot = innerW / candles.length;
  const gap = clamp(gapRatio, 0, 1);
  const bodyWidth = round(slot * (1 - gap));
  return candles.map((c, i) => {
    const cx = round(margin.left + i * slot + slot / 2);
    const openY = y(c.open);
    const closeY = y(c.close);
    const bullish = c.close >= c.open;
    const top = Math.min(openY, closeY);
    const bodyHeight = Math.max(1, Math.abs(openY - closeY));
    return {
      cx,
      bodyX: round(cx - bodyWidth / 2),
      bodyY: round(top),
      bodyWidth,
      bodyHeight: round(bodyHeight),
      highY: round(y(c.high)),
      lowY: round(y(c.low)),
      bullish,
      candle: c,
    };
  });
}
