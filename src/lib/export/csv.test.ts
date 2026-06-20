import { describe, expect, it } from "vitest";

import { toCsv, type CsvTable } from "./csv";

describe("toCsv", () => {
  it("emits exact RFC 4180 bytes for a simple table", () => {
    const table: CsvTable = {
      columns: ["a", "b", "c"],
      rows: [
        ["1", "2", "3"],
        ["4", "5", "6"],
      ],
    };
    expect(toCsv(table)).toBe("a,b,c\r\n1,2,3\r\n4,5,6\r\n");
  });

  it("quotes fields containing the delimiter, quotes, or newlines", () => {
    const table: CsvTable = {
      columns: ["name", "note"],
      rows: [
        ["Acme, Inc.", 'He said "hi"'],
        ["line1\nline2", "carriage\rreturn"],
      ],
    };
    expect(toCsv(table)).toBe(
      'name,note\r\n' +
        '"Acme, Inc.","He said ""hi"""\r\n' +
        '"line1\nline2","carriage\rreturn"\r\n',
    );
  });

  it("serializes numbers and booleans locale-independently; null/undefined are empty", () => {
    const table: CsvTable = {
      columns: ["n", "neg", "frac", "bool", "nil", "undef"],
      rows: [[1000000, -2.5, 0.125, true, null, undefined]],
    };
    expect(toCsv(table)).toBe(
      "n,neg,frac,bool,nil,undef\r\n1000000,-2.5,0.125,true,,\r\n",
    );
  });

  it("supports a custom delimiter and a UTF-8 BOM", () => {
    const table: CsvTable = {
      columns: ["x", "y"],
      rows: [["a;b", "c"]],
    };
    expect(toCsv(table, { delimiter: ";", bom: true })).toBe(
      '﻿x;y\r\n"a;b";c\r\n',
    );
  });

  it("throws on a ragged row", () => {
    const table: CsvTable = {
      columns: ["a", "b"],
      rows: [["1", "2"], ["3"]],
    };
    expect(() => toCsv(table)).toThrow(/row 1 has 1 cells/);
  });

  it("throws on a non-finite number rather than emitting NaN", () => {
    const table: CsvTable = { columns: ["x"], rows: [[Number.NaN]] };
    expect(() => toCsv(table)).toThrow(/non-finite/);
  });

  it("is deterministic: identical tables produce identical bytes", () => {
    const table: CsvTable = {
      columns: ["k", "v"],
      rows: [["a", 1], ["b", 2]],
    };
    expect(toCsv(table)).toBe(toCsv(table));
  });
});
