import { describe, expect, it } from "vitest";

import {
  barLayout,
  candlestickLayout,
  clamp,
  donutLayout,
  extent,
  linearScale,
  pointsFromValues,
  round,
  toAreaPath,
  toLinePath,
  toPolyline,
  treemapLayout,
} from "./chart-utils";

describe("extent", () => {
  it("returns min/max of values", () => {
    expect(extent([3, 1, 4, 1, 5, 9, 2])).toEqual({ min: 1, max: 9 });
  });
  it("handles a single value", () => {
    expect(extent([7])).toEqual({ min: 7, max: 7 });
  });
  it("returns a safe default for empty input", () => {
    expect(extent([])).toEqual({ min: 0, max: 1 });
  });
});

describe("linearScale", () => {
  it("maps domain ends to range ends", () => {
    const s = linearScale({ min: 0, max: 10 }, 0, 100);
    expect(s(0)).toBe(0);
    expect(s(10)).toBe(100);
    expect(s(5)).toBe(50);
  });
  it("inverts when range is reversed", () => {
    const s = linearScale({ min: 0, max: 10 }, 100, 0);
    expect(s(0)).toBe(100);
    expect(s(10)).toBe(0);
  });
  it("maps a zero-width domain to the range midpoint", () => {
    const s = linearScale({ min: 5, max: 5 }, 0, 100);
    expect(s(5)).toBe(50);
    expect(s(999)).toBe(50);
  });
});

describe("clamp / round", () => {
  it("clamps into range", () => {
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
    expect(clamp(5, 0, 10)).toBe(5);
  });
  it("rounds to decimals", () => {
    expect(round(1.23456, 2)).toBe(1.23);
    expect(round(1.235, 2)).toBe(1.24);
  });
});

describe("pointsFromValues", () => {
  it("spreads points evenly across the inner width", () => {
    const pts = pointsFromValues(
      [0, 1, 2],
      100,
      100,
      { top: 0, right: 0, bottom: 0, left: 0 },
      0,
    );
    expect(pts).toHaveLength(3);
    expect(pts[0].x).toBe(0);
    expect(pts[2].x).toBe(100);
    expect(pts[1].x).toBe(50);
  });
  it("inverts y so larger values sit higher (smaller pixel y)", () => {
    const pts = pointsFromValues(
      [0, 10],
      100,
      100,
      { top: 0, right: 0, bottom: 0, left: 0 },
      0,
    );
    expect(pts[0].y).toBeGreaterThan(pts[1].y);
  });
  it("respects an explicit shared domain", () => {
    const margin = { top: 0, right: 0, bottom: 0, left: 0 };
    const own = pointsFromValues([0, 5], 100, 100, margin, 0);
    const shared = pointsFromValues([0, 5], 100, 100, margin, 0, {
      min: 0,
      max: 10,
    });
    // Value 5 sits at the bottom in its own domain, but mid-height under [0,10].
    expect(own[1].y).toBeLessThan(shared[1].y);
  });
});

describe("path builders", () => {
  it("builds a polyline string", () => {
    expect(
      toPolyline([
        { x: 0, y: 0 },
        { x: 1, y: 2 },
      ]),
    ).toBe("0,0 1,2");
  });
  it("builds a line path with M then L commands", () => {
    expect(
      toLinePath([
        { x: 0, y: 0 },
        { x: 10, y: 5 },
      ]),
    ).toBe("M0,0 L10,5");
  });
  it("returns empty path for no points", () => {
    expect(toLinePath([])).toBe("");
    expect(toAreaPath([], 100)).toBe("");
  });
  it("closes an area path back to the baseline", () => {
    const d = toAreaPath(
      [
        { x: 0, y: 10 },
        { x: 10, y: 20 },
      ],
      100,
    );
    expect(d).toContain("M0,10");
    expect(d).toContain("L10,100");
    expect(d).toContain("L0,100");
    expect(d.endsWith("Z")).toBe(true);
  });
});

describe("barLayout", () => {
  it("creates one rect per value", () => {
    const bars = barLayout([1, 2, 3], 100, 100);
    expect(bars).toHaveLength(3);
  });
  it("shares a zero baseline for signed data", () => {
    const bars = barLayout(
      [10, -10],
      100,
      100,
      { top: 0, right: 0, bottom: 0, left: 0 },
      0,
    );
    // The positive bar's bottom equals the negative bar's top (the baseline).
    const posBottom = bars[0].y + bars[0].height;
    expect(posBottom).toBeCloseTo(bars[1].y, 5);
  });
  it("never produces negative heights", () => {
    const bars = barLayout([-3, -1, -7], 200, 100);
    for (const b of bars) expect(b.height).toBeGreaterThanOrEqual(0);
  });
  it("returns nothing for empty input", () => {
    expect(barLayout([], 100, 100)).toEqual([]);
  });
});

describe("donutLayout", () => {
  it("creates one segment per positive value summing to the full circle", () => {
    const segs = donutLayout([1, 1, 2], 50, 50, 50, 25);
    expect(segs).toHaveLength(3);
    expect(segs[0].startFraction).toBe(0);
    expect(segs[2].endFraction).toBeCloseTo(1, 6);
  });
  it("allocates fractions proportional to value", () => {
    const segs = donutLayout([3, 1], 50, 50, 50, 25);
    expect(segs[0].endFraction).toBeCloseTo(0.75, 6);
  });
  it("clamps negatives to zero", () => {
    const segs = donutLayout([1, -5, 1], 50, 50, 50, 25);
    expect(segs[1].value).toBe(0);
  });
  it("returns empty for non-positive totals", () => {
    expect(donutLayout([0, 0], 50, 50, 50, 25)).toEqual([]);
    expect(donutLayout([-1, -2], 50, 50, 50, 25)).toEqual([]);
  });
  it("emits a ring path with two arcs when innerRadius > 0", () => {
    const [seg] = donutLayout([1, 1], 50, 50, 50, 25);
    expect((seg.path.match(/A/g) ?? []).length).toBe(2);
  });
  it("emits a wedge path from the centre when innerRadius is 0", () => {
    const [seg] = donutLayout([1, 1], 50, 50, 50, 0);
    expect(seg.path.startsWith("M50,50")).toBe(true);
  });
  it("renders a lone 100% segment as a full ring instead of a collapsed arc", () => {
    // A single full-circle slice has identical start/end points; a naive single
    // arc would draw nothing. It must be split into two arcs (one ring per half).
    const [seg] = donutLayout([5], 50, 50, 50, 25);
    expect(seg.startFraction).toBe(0);
    expect(seg.endFraction).toBeCloseTo(1, 6);
    expect((seg.path.match(/A/g) ?? []).length).toBe(4);
    // The split passes through the antipodal midpoint (6 o'clock at cy + r).
    expect(seg.path).toContain("50,100");
  });
  it("renders a lone 100% pie slice as two wedges", () => {
    const [seg] = donutLayout([5], 50, 50, 50, 0);
    expect((seg.path.match(/A/g) ?? []).length).toBe(2);
    expect((seg.path.match(/Z/g) ?? []).length).toBe(2);
  });
  it("keeps normal partial segments as single arcs (no spurious split)", () => {
    const segs = donutLayout([1, 1, 2], 50, 50, 50, 25);
    for (const seg of segs) {
      expect((seg.path.match(/A/g) ?? []).length).toBe(2);
    }
  });
  it("treats one positive value among zeros as a full ring", () => {
    const segs = donutLayout([0, 4, 0], 50, 50, 50, 25);
    const ring = segs[1];
    expect(ring.value).toBe(4);
    expect(ring.endFraction - ring.startFraction).toBeCloseTo(1, 6);
    expect((ring.path.match(/A/g) ?? []).length).toBe(4);
  });
});

describe("treemapLayout", () => {
  it("creates one tile per node in input order", () => {
    const tiles = treemapLayout(
      [
        { value: 1, label: "a" },
        { value: 1, label: "b" },
      ],
      100,
      100,
    );
    expect(tiles).toHaveLength(2);
    expect(tiles[0].label).toBe("a");
    expect(tiles[1].label).toBe("b");
  });
  it("fills the whole area (tile areas sum to width*height)", () => {
    const data = [
      { value: 30 },
      { value: 20 },
      { value: 10 },
      { value: 5 },
    ];
    const tiles = treemapLayout(data, 200, 100);
    const totalArea = tiles.reduce((s, t) => s + t.width * t.height, 0);
    expect(totalArea).toBeCloseTo(200 * 100, 0);
  });
  it("keeps tile area proportional to value", () => {
    const tiles = treemapLayout([{ value: 75 }, { value: 25 }], 200, 100);
    const a0 = tiles[0].width * tiles[0].height;
    const a1 = tiles[1].width * tiles[1].height;
    expect(a0 / (a0 + a1)).toBeCloseTo(0.75, 2);
  });
  it("returns nothing for empty or zero-total input", () => {
    expect(treemapLayout([], 100, 100)).toEqual([]);
    expect(treemapLayout([{ value: 0 }], 100, 100)).toEqual([]);
  });
  it("gives zero-area tiles to zero-value nodes without dropping them", () => {
    const tiles = treemapLayout(
      [{ value: 10 }, { value: 0 }, { value: 5 }],
      200,
      100,
    );
    expect(tiles).toHaveLength(3);
    expect(tiles[1].width * tiles[1].height).toBe(0);
    const totalArea = tiles.reduce((s, t) => s + t.width * t.height, 0);
    expect(totalArea).toBeCloseTo(200 * 100, 0);
  });
  it("clamps negative values to zero area", () => {
    const tiles = treemapLayout([{ value: 10 }, { value: -7 }], 200, 100);
    expect(tiles[1].value).toBe(0);
    expect(tiles[1].width * tiles[1].height).toBe(0);
  });
});

describe("candlestickLayout", () => {
  it("creates one candle per datum", () => {
    const candles = candlestickLayout(
      [
        { open: 1, high: 2, low: 0, close: 1.5 },
        { open: 1.5, high: 2, low: 1, close: 1.2 },
      ],
      100,
      100,
    );
    expect(candles).toHaveLength(2);
  });
  it("marks bullish vs bearish correctly", () => {
    const [up, down] = candlestickLayout(
      [
        { open: 1, high: 2, low: 0, close: 2 },
        { open: 2, high: 2, low: 0, close: 1 },
      ],
      100,
      100,
    );
    expect(up.bullish).toBe(true);
    expect(down.bullish).toBe(false);
  });
  it("places the high above the low (smaller pixel y)", () => {
    const [c] = candlestickLayout(
      [{ open: 1, high: 3, low: 0, close: 2 }],
      100,
      100,
    );
    expect(c.highY).toBeLessThan(c.lowY);
  });
  it("gives a minimum body height of 1 for doji candles", () => {
    const [c] = candlestickLayout(
      [{ open: 2, high: 3, low: 1, close: 2 }],
      100,
      100,
    );
    expect(c.bodyHeight).toBeGreaterThanOrEqual(1);
  });
  it("returns nothing for empty input", () => {
    expect(candlestickLayout([], 100, 100)).toEqual([]);
  });
  it("survives a flat (zero-range) domain without NaN geometry", () => {
    const [c] = candlestickLayout(
      [{ open: 5, high: 5, low: 5, close: 5 }],
      100,
      100,
    );
    for (const n of [c.cx, c.bodyX, c.bodyY, c.bodyWidth, c.bodyHeight, c.highY, c.lowY]) {
      expect(Number.isFinite(n)).toBe(true);
    }
    expect(c.bodyHeight).toBeGreaterThanOrEqual(1);
    expect(c.bullish).toBe(true);
  });
});
