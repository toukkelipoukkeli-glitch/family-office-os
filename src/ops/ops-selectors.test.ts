import { describe, expect, it } from "vitest";

import { tableExport } from "@/lib/export/tables";
import { toCsv } from "@/lib/export/csv";
import type { OpsSnapshot } from "./ops-data";
import { opsSnapshot } from "./ops-data";
import {
  allUnits,
  countByStatus,
  milestoneProgress,
  opsExportRows,
  progressPercent,
  STATUS_ORDER,
  statusLabel,
  unitsByStatus,
} from "./ops-selectors";

const fixture: OpsSnapshot = {
  generation: 2,
  updatedAt: "2026-01-01",
  phase: "test",
  heartbeat: "2026-01-01T00:00:00Z",
  milestones: [
    {
      id: "ma",
      title: "Alpha",
      units: [
        { id: "ma-1", title: "One", oracle: "unit", deps: [], status: "merged" },
        { id: "ma-2", title: "Two", oracle: "unit", deps: ["ma-1"], status: "active" },
        { id: "ma-3", title: "Three", oracle: "unit", deps: [], status: "backlog" },
      ],
    },
    {
      id: "mb",
      title: "Beta",
      units: [
        { id: "mb-1", title: "Four", oracle: "e2e", deps: [], status: "merged" },
        { id: "mb-2", title: "Five", oracle: "unit", deps: [], status: "blocked", note: "stuck" },
      ],
    },
  ],
};

describe("countByStatus", () => {
  it("tallies every status and the total", () => {
    const c = countByStatus(fixture);
    expect(c).toEqual({
      backlog: 1,
      active: 1,
      merged: 2,
      blocked: 1,
      total: 5,
    });
  });

  it("returns all zeros for an empty snapshot", () => {
    const empty: OpsSnapshot = { ...fixture, milestones: [] };
    expect(countByStatus(empty)).toEqual({
      backlog: 0,
      active: 0,
      merged: 0,
      blocked: 0,
      total: 0,
    });
  });
});

describe("progressPercent", () => {
  it("is merged/total rounded to an integer", () => {
    // 2 merged of 5 => 40%
    expect(progressPercent(fixture)).toBe(40);
  });

  it("rounds to the nearest integer", () => {
    const odd: OpsSnapshot = {
      ...fixture,
      milestones: [
        {
          id: "m",
          title: "m",
          units: [
            { id: "1", title: "a", oracle: "unit", deps: [], status: "merged" },
            { id: "2", title: "b", oracle: "unit", deps: [], status: "backlog" },
            { id: "3", title: "c", oracle: "unit", deps: [], status: "backlog" },
          ],
        },
      ],
    };
    // 1/3 = 33.33 => 33
    expect(progressPercent(odd)).toBe(33);
  });

  it("is 0 for an empty snapshot (no division by zero)", () => {
    expect(progressPercent({ ...fixture, milestones: [] })).toBe(0);
  });

  it("is 100 when everything is merged", () => {
    const done: OpsSnapshot = {
      ...fixture,
      milestones: [
        {
          id: "m",
          title: "m",
          units: [
            { id: "1", title: "a", oracle: "unit", deps: [], status: "merged" },
            { id: "2", title: "b", oracle: "unit", deps: [], status: "merged" },
          ],
        },
      ],
    };
    expect(progressPercent(done)).toBe(100);
  });
});

describe("allUnits", () => {
  it("flattens units across milestones in order", () => {
    expect(allUnits(fixture).map((u) => u.id)).toEqual([
      "ma-1",
      "ma-2",
      "ma-3",
      "mb-1",
      "mb-2",
    ]);
  });
});

describe("unitsByStatus", () => {
  it("filters to a single status preserving order", () => {
    expect(unitsByStatus(fixture, "merged").map((u) => u.id)).toEqual([
      "ma-1",
      "mb-1",
    ]);
    expect(unitsByStatus(fixture, "blocked").map((u) => u.id)).toEqual([
      "mb-2",
    ]);
    expect(unitsByStatus(fixture, "active")).toHaveLength(1);
  });
});

describe("milestoneProgress", () => {
  it("computes per-milestone counts and percent", () => {
    const mp = milestoneProgress(fixture);
    expect(mp).toHaveLength(2);

    const [alpha, beta] = mp;
    expect(alpha.milestone.id).toBe("ma");
    expect(alpha.counts.total).toBe(3);
    expect(alpha.counts.merged).toBe(1);
    expect(alpha.percent).toBe(33); // 1/3

    expect(beta.milestone.id).toBe("mb");
    expect(beta.counts.total).toBe(2);
    expect(beta.counts.merged).toBe(1);
    expect(beta.percent).toBe(50);
  });
});

describe("statusLabel", () => {
  it("maps every status to a human label", () => {
    expect(statusLabel("backlog")).toBe("Backlog");
    expect(statusLabel("active")).toBe("In progress");
    expect(statusLabel("merged")).toBe("Merged");
    expect(statusLabel("blocked")).toBe("Blocked");
  });
});

describe("bundled opsSnapshot", () => {
  it("has unique unit ids and valid dependency references", () => {
    const units = allUnits(opsSnapshot);
    const ids = units.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);

    const idSet = new Set(ids);
    for (const u of units) {
      for (const dep of u.deps) {
        expect(idSet.has(dep)).toBe(true);
      }
    }
  });

  it("only uses statuses the UI knows how to render", () => {
    const known = new Set(STATUS_ORDER);
    for (const u of allUnits(opsSnapshot)) {
      expect(known.has(u.status)).toBe(true);
    }
  });

  it("never lists a unit as its own dependency", () => {
    for (const u of allUnits(opsSnapshot)) {
      expect(u.deps).not.toContain(u.id);
    }
  });
});

describe("count invariants", () => {
  it("per-milestone counts sum to the global counts", () => {
    const global = countByStatus(fixture);
    const summed = milestoneProgress(fixture).reduce(
      (acc, { counts }) => ({
        backlog: acc.backlog + counts.backlog,
        active: acc.active + counts.active,
        merged: acc.merged + counts.merged,
        blocked: acc.blocked + counts.blocked,
        total: acc.total + counts.total,
      }),
      { backlog: 0, active: 0, merged: 0, blocked: 0, total: 0 },
    );
    expect(summed).toEqual(global);
  });

  it("status buckets partition every unit exactly once", () => {
    const counts = countByStatus(fixture);
    const bucketed = STATUS_ORDER.reduce(
      (sum, status) => sum + unitsByStatus(fixture, status).length,
      0,
    );
    expect(bucketed).toBe(counts.total);
    expect(bucketed).toBe(allUnits(fixture).length);
  });
});

describe("opsExportRows", () => {
  it("emits one row per unit, tagged with its milestone, in snapshot order", () => {
    const rows = opsExportRows(fixture);
    expect(rows).toHaveLength(allUnits(fixture).length);
    expect(rows.map((r) => r.id)).toEqual([
      "ma-1",
      "ma-2",
      "ma-3",
      "mb-1",
      "mb-2",
    ]);
    expect(rows[0]).toEqual({
      milestoneId: "ma",
      milestoneTitle: "Alpha",
      id: "ma-1",
      title: "One",
      status: "merged",
      oracle: "unit",
      deps: "",
      pr: "",
      note: "",
    });
  });

  it("joins deps and collapses optional pr/note to empty strings (no undefined)", () => {
    const rows = opsExportRows(fixture);
    const withDeps = rows.find((r) => r.id === "ma-2")!;
    expect(withDeps.deps).toBe("ma-1");
    const blocked = rows.find((r) => r.id === "mb-2")!;
    expect(blocked.note).toBe("stuck");
    expect(blocked.pr).toBe("");
    for (const r of rows) {
      expect(r.pr).not.toBeUndefined();
      expect(r.note).not.toBeUndefined();
      expect(typeof r.deps).toBe("string");
    }
  });

  it("derives a deterministic, JSON-safe table from the live snapshot", () => {
    const rows = opsExportRows(opsSnapshot);
    expect(rows.length).toBeGreaterThan(0);
    // Stable across repeated derivation (pure).
    expect(opsExportRows(opsSnapshot)).toEqual(rows);
    // No nested objects leak into the flat row.
    for (const r of rows) {
      for (const v of Object.values(r)) {
        expect(["string", "number"]).toContain(typeof v);
      }
    }
  });

  // Adversarial: real unit titles/notes contain commas ("Decimal money type +
  // currency utils", "Net worth ... TWR, ...") and could contain quotes or
  // newlines. Prove the full ops export pipeline (rows -> tableExport -> CSV)
  // keeps each row's cell count intact under RFC-4180 quoting, so a comma in a
  // title never shifts columns and corrupts the export.
  it("survives commas/quotes/newlines in unit fields through to RFC-4180 CSV", () => {
    const hostile: OpsSnapshot = {
      ...fixture,
      milestones: [
        {
          id: "mx",
          title: "Has, comma",
          units: [
            {
              id: "mx-1",
              title: 'Comma, and "quote"',
              oracle: "line1\nline2",
              deps: ["a", "b"],
              status: "merged",
              note: "trailing,",
            },
          ],
        },
      ],
    };
    const rows = opsExportRows(hostile);
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
    ] as const;
    const ds = tableExport(
      "ops-build",
      columns,
      rows.map((r) => columns.map((c) => r[c])),
      rows,
    );
    const csv = toCsv(ds.table);
    // Header + one data line per unit, split on the RFC-4180 record separator.
    // (Embedded \n inside a quoted field must NOT create an extra record.)
    const records = csv.replace(/\r\n/g, "\n").trimEnd().split("\n");
    // The hostile title contains a literal newline, so a naive line-split would
    // see an extra row; assert the *parsed* table round-trips to one data row.
    const parsed = parseCsv(csv);
    expect(parsed).toHaveLength(rows.length + 1); // header + 1 data row
    for (const rec of parsed) expect(rec).toHaveLength(columns.length);
    // The comma-bearing title survived intact, not split across cells.
    const titleIdx = columns.indexOf("title");
    expect(parsed[1][titleIdx]).toBe('Comma, and "quote"');
    // The header is always exactly one physical line.
    expect(records[0]).toBe(columns.join(","));
    expect(csv).not.toContain("[object Object]");
  });
});

/**
 * Minimal RFC-4180 CSV parser for tests: handles quoted fields containing
 * commas, escaped quotes (`""`), and embedded CR/LF. Returns an array of
 * records, each an array of cell strings. Deterministic and dependency-free.
 */
function parseCsv(input: string): string[][] {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      record.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (ch === "\r" && input[i + 1] === "\n") {
      record.push(field);
      records.push(record);
      field = "";
      record = [];
      i += 2;
      continue;
    }
    if (ch === "\n") {
      record.push(field);
      records.push(record);
      field = "";
      record = [];
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records;
}
