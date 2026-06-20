import { describe, expect, it } from "vitest";

import { tableExport, buildExportFile } from "./tables";
import { toCsv } from "./csv";
import { toJson } from "./json";
import { MIME } from "./download";

/**
 * Unit tests for the generic {@link tableExport} adapter that the export
 * rollout uses to wire an Export control onto every data-heavy page. These
 * pin the contract every page relies on: a slugified name, a CSV table whose
 * rows align to its columns, and a JSON payload that serializes deterministically.
 */
describe("tableExport", () => {
  const columns = ["id", "label", "value"] as const;
  const rows = [
    ["a", "Alpha", 1],
    ["b", "Beta", 2.5],
  ];

  it("slugifies the name into a file-name stem", () => {
    const ds = tableExport("Net Worth 2026-06-19", columns, rows);
    expect(ds.name).toBe("net-worth-2026-06-19");
  });

  it("carries the supplied columns and rows into the CSV table", () => {
    const ds = tableExport("x", columns, rows);
    expect(ds.table.columns).toEqual(columns);
    expect(ds.table.rows).toEqual(rows);
  });

  it("defaults the JSON payload to a {columns, rows} wrapper", () => {
    const ds = tableExport("x", columns, rows);
    expect(ds.json).toEqual({ columns, rows });
  });

  it("uses an explicit JSON payload when given", () => {
    const full = { meta: "ok", rows };
    const ds = tableExport("x", columns, rows, full);
    expect(ds.json).toBe(full);
  });

  it("produces a CSV file whose rows align to the header", () => {
    const ds = tableExport("x", columns, rows);
    const file = buildExportFile(ds, "csv");
    expect(file.filename).toBe("x.csv");
    expect(file.mimeType).toBe(MIME.csv);
    const lines = toCsv(ds.table).trimEnd().split("\r\n");
    expect(lines[0]).toBe("id,label,value");
    // header + one line per row.
    expect(lines).toHaveLength(rows.length + 1);
  });

  it("produces deterministic, re-runnable JSON", () => {
    const ds = tableExport("x", columns, rows, { z: 1, a: 2 });
    const file = buildExportFile(ds, "json");
    expect(file.filename).toBe("x.json");
    expect(file.mimeType).toBe(MIME.json);
    // Stable across calls (keys sorted by toJson).
    expect(toJson(ds.json)).toBe(toJson(ds.json));
    expect(toJson(ds.json)).toContain('"a": 2');
  });

  it("rejects a ragged table at serialization time", () => {
    // A row missing a cell is a programming error; toCsv must surface it.
    const ds = tableExport("x", columns, [["only-one-cell"]]);
    expect(() => toCsv(ds.table)).toThrow(/cells but there are/);
  });

  it("falls back to 'export' for an empty name", () => {
    const ds = tableExport("   ", columns, rows);
    expect(ds.name).toBe("export");
  });
});
