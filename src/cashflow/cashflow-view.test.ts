import { describe, expect, it } from "vitest";

import {
  SAMPLE_FORECAST_INPUT,
  TIGHT_FORECAST_INPUT,
  forecastCashflow,
} from "@/lib/cashflow";
import {
  compactCurrency,
  flowRows,
  runwayKpis,
  runwayPhrase,
  runwayPoints,
  signedCompactCurrency,
} from "./cashflow-view";

const base = forecastCashflow(SAMPLE_FORECAST_INPUT);
const tight = forecastCashflow(TIGHT_FORECAST_INPUT);

describe("currency formatting", () => {
  it("renders compact and signed-compact currency", () => {
    expect(compactCurrency(8_000_000, "USD")).toBe("$8M");
    expect(signedCompactCurrency(-1_200_000, "USD")).toBe("-$1.2M");
    expect(signedCompactCurrency(900_000, "USD")).toBe("+$900K");
  });
});

describe("runwayPhrase", () => {
  it("says N+ months when the runway is never exhausted", () => {
    expect(runwayPhrase(base)).toBe("12+ months");
  });
  it("says the exact month count when exhausted", () => {
    expect(runwayPhrase(tight)).toBe("1 month");
  });
});

describe("runwayKpis", () => {
  it("summarizes the surviving base case with up tones", () => {
    const k = runwayKpis(base);
    expect(k.openingCash).toBe("$8M");
    expect(k.runway).toBe("12+ months");
    expect(k.runwayTone).toBe("up");
    expect(k.endingTone).toBe("up");
    expect(k.lowestTone).toBe("up");
    expect(k.lowestPeriodLabel).toBe("M10");
  });

  it("flags the depleting tight case with down tones", () => {
    const k = runwayKpis(tight);
    expect(k.runway).toBe("1 month");
    expect(k.runwayTone).toBe("down");
    expect(k.endingTone).toBe("down");
    expect(k.lowestTone).toBe("down");
  });
});

describe("runwayPoints", () => {
  it("prepends the opening point labelled 'Now' then one point per period", () => {
    const pts = runwayPoints(base);
    expect(pts).toHaveLength(base.periods + 1);
    expect(pts[0]).toMatchObject({ period: -1, label: "Now", negative: false });
    expect(pts[0].value).toBe(8_000_000);
    expect(pts[1].label).toBe("M0");
    expect(pts.at(-1)?.label).toBe("M11");
  });

  it("marks negative points in the tight scenario", () => {
    const pts = runwayPoints(tight);
    expect(pts.some((p) => p.negative)).toBe(true);
    // The opening point is positive.
    expect(pts[0].negative).toBe(false);
  });
});

describe("flowRows", () => {
  it("produces one row per period with a signed per-kind breakdown", () => {
    const rows = flowRows(base);
    expect(rows).toHaveLength(base.periods);
    const r0 = rows[0];
    expect(r0.label).toBe("M0");
    // p0: distribution +180k (rent), expense -570k (opex 260k + advisory 310k).
    expect(r0.byKind.distribution).toBe(180_000);
    expect(r0.byKind.expense).toBe(-570_000);
    expect(r0.byKind.commitment).toBe(0);
    // net = 180k - 570k = -390k
    expect(r0.net).toBe(-390_000);
    expect(r0.breached).toBe(false);
  });

  it("flags breached rows where the closing balance is negative", () => {
    const rows = flowRows(tight);
    const breached = rows.filter((r) => r.breached);
    expect(breached.length).toBeGreaterThan(0);
    expect(breached.every((r) => r.closing < 0)).toBe(true);
  });
});
