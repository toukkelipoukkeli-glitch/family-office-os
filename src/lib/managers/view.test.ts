import { describe, expect, it } from "vitest";

import { MANAGERS, PERIODS_PER_YEAR } from "./fixtures";
import { buildScorecardView } from "./view";

const OPTS = { periodsPerYear: PERIODS_PER_YEAR };

describe("buildScorecardView", () => {
  it("ranks the roster and selects the top manager by default", () => {
    const view = buildScorecardView({ managers: MANAGERS, options: OPTS });
    expect(view.roster).toHaveLength(MANAGERS.length);
    expect(view.roster[0].rank).toBe(1);
    expect(view.roster[0].id).toBe("meridian-global-equity");
    expect(view.selectedId).toBe("meridian-global-equity");
    // ranks are 1..n contiguous
    expect(view.roster.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
  });

  it("honours an explicit selectedId without changing the ranking", () => {
    const view = buildScorecardView({
      managers: MANAGERS,
      selectedId: "aurora-ventures",
      options: OPTS,
    });
    expect(view.selectedId).toBe("aurora-ventures");
    expect(view.detail.name).toBe("Aurora Ventures");
    // ranking unaffected — top is still Meridian
    expect(view.roster[0].id).toBe("meridian-global-equity");
  });

  it("builds a per-period detail with cumulative growth curves", () => {
    const view = buildScorecardView({ managers: MANAGERS, options: OPTS });
    const pts = view.detail.points;
    expect(pts).toHaveLength(24);
    // growth multiples are monotone in compounding direction at the end
    expect(pts[pts.length - 1].grossGrowth).toBeGreaterThan(1);
    expect(pts[pts.length - 1].netGrowth).toBeGreaterThan(1);
    // net growth tracks below gross growth (fees drag it down)
    expect(pts[pts.length - 1].netGrowth).toBeLessThan(
      pts[pts.length - 1].grossGrowth,
    );
    // detail headline numbers agree with the roster row for the selected manager
    const row = view.roster.find((r) => r.id === view.selectedId)!;
    expect(view.detail.netTotal).toBeCloseTo(row.netTotal, 10);
    expect(view.detail.score.composite).toBeCloseTo(row.score, 10);
  });

  it("throws on an empty roster", () => {
    expect(() => buildScorecardView({ managers: [] })).toThrow();
  });
});
