import { describe, expect, it } from "vitest";

import { tableExport, buildExportFile } from "./tables";
import { toJson } from "./json";

import { analyzeConcentration, SAMPLE_CONCENTRATION_BOOK } from "@/lib/concentration";
import { analyzeEstate, seededEstatePlan } from "@/lib/estate";
import { analyzeGivingPlan, seededGivingPlan } from "@/lib/giving";
import { opsSnapshot } from "@/ops/ops-data";
import { opsExportRows } from "@/ops/ops-selectors";

/**
 * Export-data-shape oracle for the money-heavy rollout pages.
 *
 * The risk with these pages is that exact-`Decimal` money would leak into the
 * export as either a float (losing precision) or a non-serializable object
 * (`[object Object]`). These tests rebuild each page's primary export table the
 * same way the page wires it — money crosses the boundary as a `Money.amount`
 * fixed string — and assert the serialized output contains exact decimal
 * strings and no object placeholders. Pure, deterministic and offline.
 */

const moneyish = /^-?\d+(\.\d+)?$/;

describe("concentration export shape", () => {
  const report = analyzeConcentration(SAMPLE_CONCENTRATION_BOOK);
  const ds = tableExport(
    `concentration-${report.bookId}`,
    ["issuerId", "name", "sector", "value", "weight", "residual"],
    report.singleNames.map((n) => [
      n.issuerId,
      n.name,
      n.sector,
      n.value.amount.toFixed(),
      n.weight,
      n.residual,
    ]),
    {
      total: report.total.amount.toFixed(),
      singleNames: report.singleNames.map((n) => ({
        name: n.name,
        value: n.value.amount.toFixed(),
        weight: n.weight,
      })),
    },
  );

  it("emits exact-decimal money strings in the CSV value column", () => {
    const csv = buildExportFile(ds, "csv").content;
    expect(csv).not.toContain("[object Object]");
    // Every value cell (4th column) is an exact decimal string.
    const valueCol = ds.table.rows.map((r) => r[2 + 1]);
    for (const v of valueCol) expect(String(v)).toMatch(moneyish);
  });

  it("serializes JSON deterministically with no object placeholders", () => {
    const json = toJson(ds.json);
    expect(json).not.toContain("[object Object]");
    expect(toJson(ds.json)).toBe(json);
    const parsed = JSON.parse(json) as { total: string };
    expect(parsed.total).toMatch(moneyish);
  });

  it("has a CSV table whose rows align to the header", () => {
    for (const row of ds.table.rows) {
      expect(row).toHaveLength(ds.table.columns.length);
    }
  });
});

describe("estate export shape", () => {
  const analysis = analyzeEstate(seededEstatePlan);
  const ds = tableExport(
    "estate-beneficiaries",
    ["beneficiaryId", "name", "relation", "gross", "tax", "net"],
    analysis.beneficiaryShares.map((b) => [
      b.beneficiaryId,
      b.name,
      b.relation,
      b.gross.amount.toFixed(),
      b.tax.amount.toFixed(),
      b.net.amount.toFixed(),
    ]),
    analysis,
  );

  it("renders beneficiary money as exact decimal strings", () => {
    expect(ds.table.rows.length).toBeGreaterThan(0);
    for (const row of ds.table.rows) {
      expect(String(row[3])).toMatch(moneyish);
      expect(String(row[4])).toMatch(moneyish);
      expect(String(row[5])).toMatch(moneyish);
    }
  });

  it("serializes the full analysis JSON through Money.toJSON (no floats lost)", () => {
    // The full EstateAnalysis carries Money/Decimal objects; toJson must route
    // them through their canonical representation rather than [object Object].
    const json = toJson(ds.json);
    expect(json).not.toContain("[object Object]");
    expect(json).toContain("grossEstate");
  });
});

describe("giving export shape", () => {
  const analysis = analyzeGivingPlan(seededGivingPlan);
  const ds = tableExport(
    "giving-plan",
    [
      "giftId",
      "label",
      "kind",
      "fairMarketValue",
      "embeddedGain",
      "capitalGainsAvoided",
      "deductibleAmount",
    ],
    analysis.giftBenefits.map((g) => [
      g.giftId,
      g.label,
      g.kind,
      g.fairMarketValue.amount.toFixed(),
      g.embeddedGain.amount.toFixed(),
      g.capitalGainsAvoided.amount.toFixed(),
      g.deductibleAmount.amount.toFixed(),
    ]),
    analysis,
  );

  it("exports each gift's money columns as exact decimal strings", () => {
    expect(ds.table.rows.length).toBeGreaterThan(0);
    for (const row of ds.table.rows) {
      for (const i of [3, 4, 5, 6]) expect(String(row[i])).toMatch(moneyish);
    }
  });

  it("produces stable JSON for the whole giving analysis", () => {
    const json = toJson(ds.json);
    expect(json).not.toContain("[object Object]");
    expect(toJson(ds.json)).toBe(json);
  });
});

describe("ops cockpit export shape", () => {
  const rows = opsExportRows(opsSnapshot);
  const columns = [
    "milestoneId",
    "milestoneTitle",
    "id",
    "title",
    "status",
    "oracle",
    "deps",
    "pr",
    "note",
  ];
  const ds = tableExport(
    "ops-cockpit",
    columns,
    rows.map((r) => [
      r.milestoneId,
      r.milestoneTitle,
      r.id,
      r.title,
      r.status,
      r.oracle,
      r.deps,
      r.pr,
      r.note,
    ]),
    { units: rows },
  );

  it("has a CSV table whose every row aligns to the 9-column header", () => {
    expect(ds.table.rows.length).toBeGreaterThan(0);
    expect(ds.table.columns).toHaveLength(9);
    for (const row of ds.table.rows) {
      expect(row).toHaveLength(9);
    }
  });

  it("emits no object placeholders and serializes deterministically", () => {
    const csv = buildExportFile(ds, "csv").content;
    expect(csv).not.toContain("[object Object]");
    expect(csv).not.toContain("undefined");
    const json = toJson(ds.json);
    expect(json).not.toContain("[object Object]");
    expect(toJson(ds.json)).toBe(json);
  });

  it("round-trips the unit roster through JSON without loss", () => {
    const parsed = JSON.parse(toJson(ds.json)) as {
      units: { id: string; status: string }[];
    };
    expect(parsed.units).toHaveLength(rows.length);
    expect(parsed.units[0]?.id).toBe(rows[0]?.id);
  });
});
