import { describe, expect, it } from "vitest";

import {
  buildBoardReport,
  exportReportJson,
  exportReportMarkdown,
  type BoardReport,
} from "./index";

/**
 * Adversarial coverage for {@link exportReportMarkdown} / {@link exportReportJson}
 * branches the seeded fixture never hits: a fully compliant policy (no breach
 * table) and a private-markets section with an undefined pooled IRR.
 *
 * These construct edge-case reports by overriding only the relevant sections of
 * the real (deterministic) seeded report, so the rest of the document stays
 * realistic while the targeted branch is exercised.
 */
describe("export — edge-case branches", () => {
  const base = buildBoardReport();

  function withOverrides(overrides: Partial<BoardReport>): BoardReport {
    return { ...base, ...overrides };
  }

  it("renders a COMPLIANT policy without emitting a breach table", () => {
    const compliant = withOverrides({
      policy: {
        compliant: true,
        breachCount: 0,
        criticalBreaches: 0,
        warningBreaches: 0,
        total: base.policy.total,
        breaches: [],
      },
    });
    const md = exportReportMarkdown(compliant);
    expect(md).toContain("Status: COMPLIANT — no constraints breached.");
    // The breach table header must NOT appear when compliant.
    expect(md).not.toContain("| Subject | Constraint | Weight | Limit |");
  });

  it("renders an undefined pooled IRR as n/a", () => {
    const noIrr = withOverrides({
      privateMarkets: { ...base.privateMarkets, irr: null },
    });
    const md = exportReportMarkdown(noIrr);
    expect(md).toContain("Pooled IRR: n/a");
  });

  it("formats a negative excess return with a signed-bps minus", () => {
    const laggard = withOverrides({
      benchmark: { ...base.benchmark, excessReturn: -0.0123, alpha: -0.0045 },
    });
    const md = exportReportMarkdown(laggard);
    expect(md).toContain("Excess (active): -123 bps");
    expect(md).toContain("Alpha: -45 bps");
  });

  it("JSON export survives a round-trip for an edge-case report", () => {
    const edge = withOverrides({
      privateMarkets: { ...base.privateMarkets, irr: null },
    });
    const json = exportReportJson(edge);
    const parsed = JSON.parse(json) as BoardReport;
    expect(parsed.privateMarkets.irr).toBeNull();
    expect(parsed).toEqual(edge);
  });

  it("an explicit asOf date flows through to both exports", () => {
    const dated = buildBoardReport({ asOf: "2024-01-01" });
    expect(exportReportMarkdown(dated)).toContain(
      "# Board Report — 2024-01-01",
    );
    expect(JSON.parse(exportReportJson(dated)).asOf).toBe("2024-01-01");
  });
});
