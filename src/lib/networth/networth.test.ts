import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import { allocationByAssetClass } from "@/lib/allocation";
import { seededPortfolio } from "@/fixtures";
import type { Portfolio } from "@/lib/model/portfolio";

import {
  buildNetWorthDashboard,
  DEFAULT_WINDOW_MONTHS,
} from "./networth";
import { networthRateTable } from "./fixtures";

describe("buildNetWorthDashboard", () => {
  const model = buildNetWorthDashboard(seededPortfolio, networthRateTable);

  it("produces a total series of the default window length, oldest first", () => {
    expect(model.total.points).toHaveLength(DEFAULT_WINDOW_MONTHS);
    expect(model.total.baseCurrency).toBe("USD");
    const dates = model.total.points.map((p) => p.date);
    const sorted = [...dates].sort();
    expect(dates).toEqual(sorted);
    // First point is the oldest, last is the most recent.
    expect(dates[0] < dates[dates.length - 1]).toBe(true);
    expect(dates[dates.length - 1]).toBe("2026-06-01");
  });

  it("ends at the real current allocation total (the series reconciles)", () => {
    const allocation = allocationByAssetClass(seededPortfolio, networthRateTable);
    // The final total point equals the rounded allocation total.
    expect(model.current.currency).toBe("USD");
    expect(model.current.amount.toFixed(2)).toBe(
      allocation.total.amount.toFixed(2),
    );
    // `current` is the last point of the total series.
    const last = model.total.points[model.total.points.length - 1].value;
    expect(model.current.equals(last)).toBe(true);
  });

  it("makes the total series the point-wise sum of the per-class series", () => {
    for (let i = 0; i < model.total.points.length; i++) {
      const classSum = model.byAssetClass.reduce(
        (acc, d) => acc.plus(d.series.points[i].value.amount),
        new Decimal(0),
      );
      expect(model.total.points[i].value.amount.toFixed(2)).toBe(
        classSum.toFixed(2),
      );
    }
  });

  it("covers every valued asset class with a weight summing to ~1", () => {
    // Seeded portfolio has 13 distinct asset classes (cash appears twice).
    const classes = new Set(model.byAssetClass.map((d) => d.assetClass));
    expect(classes.size).toBe(13);
    const weightSum = model.byAssetClass.reduce(
      (acc, d) => acc.plus(d.weight),
      new Decimal(0),
    );
    expect(weightSum.minus(1).abs().lessThan("0.0001")).toBe(true);
  });

  it("sorts drill-down rows by descending current value", () => {
    for (let i = 1; i < model.byAssetClass.length; i++) {
      expect(
        model.byAssetClass[i - 1].value.amount.greaterThanOrEqualTo(
          model.byAssetClass[i].value.amount,
        ),
      ).toBe(true);
    }
  });

  it("counts the two cash holdings under the cash class", () => {
    const cash = model.byAssetClass.find((d) => d.assetClass === "cash");
    expect(cash).toBeDefined();
    expect(cash?.holdingCount).toBe(2);
  });

  it("each per-class series ends at that class's current value", () => {
    for (const detail of model.byAssetClass) {
      const last = detail.series.points[detail.series.points.length - 1].value;
      expect(last.amount.toFixed(2)).toBe(detail.value.amount.toFixed(2));
      expect(detail.series.points).toHaveLength(DEFAULT_WINDOW_MONTHS);
    }
  });

  it("back-projects a growing (non-flat) history for volatile classes", () => {
    const crypto = model.byAssetClass.find((d) => d.assetClass === "crypto");
    expect(crypto).toBeDefined();
    const pts = crypto!.series.points;
    // Crypto grows month over month in the model, so opening < current.
    expect(pts[0].value.amount.lessThan(pts[pts.length - 1].value.amount)).toBe(
      true,
    );
  });

  it("reports a positive cumulative time-weighted return over the window", () => {
    expect(model.totalReturn.greaterThan(0)).toBe(true);
    // Opening is strictly below current given the upward projection.
    expect(model.opening.amount.lessThan(model.current.amount)).toBe(true);
  });

  it("is deterministic — same inputs yield an identical model", () => {
    const again = buildNetWorthDashboard(seededPortfolio, networthRateTable);
    expect(again.current.amount.toFixed(2)).toBe(model.current.amount.toFixed(2));
    expect(again.total.points.map((p) => p.value.amount.toFixed(2))).toEqual(
      model.total.points.map((p) => p.value.amount.toFixed(2)),
    );
  });

  it("respects a custom window length and anchor", () => {
    const small = buildNetWorthDashboard(seededPortfolio, networthRateTable, {
      windowMonths: 6,
      anchor: { year: 2025, month: 12 },
    });
    expect(small.total.points).toHaveLength(6);
    expect(small.total.points[small.total.points.length - 1].date).toBe(
      "2025-12-01",
    );
    // Window of 6 ending Dec 2025 starts 5 months earlier: Jul 2025.
    expect(small.total.points[0].date).toBe("2025-07-01");
  });

  it("clamps a degenerate window of <2 up to 2 points", () => {
    const tiny = buildNetWorthDashboard(seededPortfolio, networthRateTable, {
      windowMonths: 1,
    });
    expect(tiny.total.points.length).toBeGreaterThanOrEqual(2);
  });

  it("handles an empty portfolio without throwing (flat zero net worth)", () => {
    const empty: Portfolio = {
      id: "pf-empty",
      name: "Empty",
      baseCurrency: "USD",
      holdings: [],
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-06-01T00:00:00Z",
    };
    const emptyModel = buildNetWorthDashboard(empty, networthRateTable);
    expect(emptyModel.byAssetClass).toHaveLength(0);
    expect(emptyModel.current.amount.isZero()).toBe(true);
    expect(emptyModel.totalReturn.isZero()).toBe(true);
    expect(emptyModel.total.points).toHaveLength(DEFAULT_WINDOW_MONTHS);
  });
});
