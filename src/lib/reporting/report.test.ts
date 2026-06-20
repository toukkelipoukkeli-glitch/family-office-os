import { describe, expect, it } from "vitest";

import {
  buildBoardReport,
  DEFAULT_REPORT_DATE,
  exportReportJson,
  exportReportMarkdown,
  REPORT_CURRENCY,
  seededBoardReport,
} from "./index";

describe("buildBoardReport", () => {
  it("is deterministic — two builds are deeply equal", () => {
    expect(buildBoardReport()).toEqual(buildBoardReport());
  });

  it("matches the exported seeded report", () => {
    expect(seededBoardReport).toEqual(buildBoardReport());
  });

  it("honours an explicit asOf date without touching the wall clock", () => {
    const report = buildBoardReport({ asOf: "2025-12-31" });
    expect(report.asOf).toBe("2025-12-31");
    // Everything else is unchanged by the date override.
    expect({ ...report, asOf: DEFAULT_REPORT_DATE }).toEqual(seededBoardReport);
  });

  it("defaults the asOf date and currency", () => {
    expect(seededBoardReport.asOf).toBe(DEFAULT_REPORT_DATE);
    expect(seededBoardReport.currency).toBe(REPORT_CURRENCY);
  });

  it("composes every board section", () => {
    const r = seededBoardReport;
    expect(r.netWorth).toBeDefined();
    expect(r.policy).toBeDefined();
    expect(r.benchmark).toBeDefined();
    expect(r.attribution).toBeDefined();
    expect(r.fees).toBeDefined();
    expect(r.privateMarkets).toBeDefined();
  });

  it("surfaces a headline KPI strip keyed across the sections", () => {
    const keys = seededBoardReport.kpis.map((k) => k.key);
    expect(keys).toEqual([
      "net-worth",
      "twr",
      "excess-return",
      "info-ratio",
      "policy-breaches",
      "fee-rate",
      "pe-tvpi",
    ]);
    // Every KPI carries both a raw number and a non-empty display string.
    for (const k of seededBoardReport.kpis) {
      expect(Number.isFinite(k.raw)).toBe(true);
      expect(k.display.length).toBeGreaterThan(0);
    }
  });

  it("net-worth section reconciles class weights to ~1 and to the total series", () => {
    const nw = seededBoardReport.netWorth;
    expect(nw.months).toBe(24);
    expect(nw.series).toHaveLength(nw.months);
    // The last series point equals the current net worth.
    expect(nw.series[nw.series.length - 1].value).toBe(nw.current);
    // Class weights sum to ~1.
    const totalWeight = nw.byAssetClass.reduce((s, a) => s + a.weight, 0);
    expect(totalWeight).toBeCloseTo(1, 6);
    // Classes are sorted by descending value.
    const values = nw.byAssetClass.map((a) => a.value);
    expect([...values].sort((a, b) => b - a)).toEqual(values);
  });

  it("benchmark section reports a positive active return over policy", () => {
    const b = seededBoardReport.benchmark;
    expect(b.benchmarkId).toBe("family-policy-55-35-10");
    // The portfolio beat the policy benchmark this window.
    expect(b.portfolioReturn).toBeGreaterThan(b.benchmarkReturn);
    expect(b.excessReturn).toBeGreaterThan(0);
    expect(b.trackingError).toBeGreaterThan(0);
    expect(Number.isFinite(b.informationRatio)).toBe(true);
    expect(Number.isFinite(b.beta)).toBe(true);
    expect(Number.isFinite(b.alpha)).toBe(true);
  });

  it("attribution effects sum to the total effect", () => {
    const a = seededBoardReport.attribution;
    expect(
      a.totalAllocation + a.totalSelection + a.totalInteraction,
    ).toBeCloseTo(a.totalEffect, 6);
    expect(a.segments).toHaveLength(5);
  });

  it("policy section reports the breach roll-up", () => {
    const p = seededBoardReport.policy;
    expect(p.compliant).toBe(p.breachCount === 0);
    expect(p.criticalBreaches + p.warningBreaches).toBe(p.breachCount);
    expect(p.breaches).toHaveLength(p.breachCount);
  });

  it("private-markets TVPI = DPI + RVPI", () => {
    const pe = seededBoardReport.privateMarkets;
    expect(pe.dpi + pe.rvpi).toBeCloseTo(pe.tvpi, 5);
  });

  it("snapshot of the full composed report", () => {
    expect(seededBoardReport).toMatchSnapshot();
  });
});

describe("export", () => {
  it("JSON export round-trips to the report object", () => {
    const json = exportReportJson(seededBoardReport);
    expect(JSON.parse(json)).toEqual(seededBoardReport);
  });

  it("JSON export is byte-stable", () => {
    expect(exportReportJson(seededBoardReport)).toBe(
      exportReportJson(buildBoardReport()),
    );
  });

  it("Markdown export is byte-stable and well-formed", () => {
    const md = exportReportMarkdown(seededBoardReport);
    expect(md).toBe(exportReportMarkdown(buildBoardReport()));
    expect(md.startsWith(`# Board Report — ${DEFAULT_REPORT_DATE}`)).toBe(true);
    expect(md.endsWith("\n")).toBe(true);
    // Every board section heading is present.
    for (const heading of [
      "## Headline",
      "## Net worth & TWR",
      "## Allocation vs. policy (IPS)",
      "## Benchmark-relative performance",
      "## Attribution",
      "## Fees & total cost of ownership",
      "## Private markets (PE)",
    ]) {
      expect(md).toContain(heading);
    }
  });

  it("snapshot of the Markdown export", () => {
    expect(exportReportMarkdown(seededBoardReport)).toMatchSnapshot();
  });
});
