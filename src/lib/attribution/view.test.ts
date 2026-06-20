import { describe, expect, it } from "vitest";

import { FAMILY_OFFICE_ATTRIBUTION } from "./fixtures";
import { buildAttributionView } from "./view";

describe("buildAttributionView", () => {
  it("flattens the engine result to plain numbers", () => {
    const v = buildAttributionView(FAMILY_OFFICE_ATTRIBUTION);
    expect(v.method).toBe("BF");
    expect(v.portfolioReturn).toBeCloseTo(0.0471, 10);
    expect(v.benchmarkReturn).toBeCloseTo(0.03885, 10);
    expect(v.activeReturn).toBeCloseTo(0.00825, 10);
    expect(v.totalAllocation).toBeCloseTo(0.0045, 10);
    expect(v.totalSelection).toBeCloseTo(0.00225, 10);
    expect(v.totalInteraction).toBeCloseTo(0.0015, 10);
  });

  it("preserves one row per segment with effects that reconcile per row", () => {
    const v = buildAttributionView(FAMILY_OFFICE_ATTRIBUTION);
    expect(v.segments).toHaveLength(FAMILY_OFFICE_ATTRIBUTION.segments.length);
    for (const s of v.segments) {
      expect(s.allocation + s.selection + s.interaction).toBeCloseTo(
        s.total,
        12,
      );
      expect(s.activeWeight).toBeCloseTo(
        s.portfolioWeight - s.benchmarkWeight,
        12,
      );
    }
  });

  it("the row totals sum to the active return", () => {
    const v = buildAttributionView(FAMILY_OFFICE_ATTRIBUTION);
    const sum = v.segments.reduce((s, r) => s + r.total, 0);
    expect(sum).toBeCloseTo(v.activeReturn, 12);
    expect(v.totalEffect).toBeCloseTo(v.activeReturn, 12);
  });

  it("respects the BHB method override", () => {
    const v = buildAttributionView({
      ...FAMILY_OFFICE_ATTRIBUTION,
      method: "BHB",
    });
    expect(v.method).toBe("BHB");
    // Totals still reconcile to the active return.
    expect(v.totalEffect).toBeCloseTo(v.activeReturn, 12);
  });
});
