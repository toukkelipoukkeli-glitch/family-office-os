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

  describe("formula-injection hardening", () => {
    it("neutralizes string cells beginning with a formula trigger", () => {
      const table: CsvTable = {
        columns: ["payload"],
        rows: [
          ["=1+1"],
          ["+1+1"],
          ["-1+cmd|'x'!A1"],
          ["@SUM(A1:A9)"],
          ["\t=evil"],
          ["\r=evil"],
        ],
      };
      expect(toCsv(table)).toBe(
        "payload\r\n" +
          "'=1+1\r\n" +
          "'+1+1\r\n" +
          "'-1+cmd|'x'!A1\r\n" +
          "'@SUM(A1:A9)\r\n" +
          // Tab and CR triggers are prefixed; the CR also forces RFC quoting.
          "'\t=evil\r\n" +
          '"\'\r=evil"\r\n',
      );
    });

    it("neutralizes a dangerous HEADER cell, not just data cells", () => {
      const table: CsvTable = {
        columns: ["=cmd|'/c calc'!A1", "ok"],
        rows: [["v", "w"]],
      };
      expect(toCsv(table)).toBe("'=cmd|'/c calc'!A1,ok\r\nv,w\r\n");
    });

    it("leaves numeric strings and machine numbers exact (no quote prefix)", () => {
      const table: CsvTable = {
        columns: ["a", "b", "c", "d", "e"],
        rows: [["-12.5", "+10", "1e3", -2.5, 1000000]],
      };
      const out = toCsv(table);
      expect(out).toBe("a,b,c,d,e\r\n-12.5,+10,1e3,-2.5,1000000\r\n");
      expect(out).not.toContain("'");
    });

    it("does not treat a leading-space value as a formula", () => {
      // Spreadsheets do not evaluate a cell that starts with whitespace, so it
      // must pass through unchanged (and not gain a stray quote prefix).
      const table: CsvTable = { columns: ["x"], rows: [[" =1+1"]] };
      expect(toCsv(table)).toBe("x\r\n =1+1\r\n");
    });

    it("applies the quote prefix BEFORE RFC quoting when both apply", () => {
      // A dangerous cell that also contains the delimiter must be neutralized
      // (leading ') and then RFC-quoted, so the ' lives inside the quotes.
      const table: CsvTable = {
        columns: ["x"],
        rows: [['=HYPERLINK("http://e","a, b")']],
      };
      expect(toCsv(table)).toBe(
        'x\r\n"\'=HYPERLINK(""http://e"",""a, b"")"\r\n',
      );
    });

    it("escapeFormulas:false is an opt-out that emits raw triggers", () => {
      const table: CsvTable = { columns: ["x"], rows: [["=1+1"]] };
      expect(toCsv(table, { escapeFormulas: false })).toBe("x\r\n=1+1\r\n");
    });
  });
});

describe("toCsv — formula-injection hardening", () => {
  it("prefixes a single quote on string cells beginning with = + @", () => {
    const table: CsvTable = {
      columns: ["payload"],
      rows: [
        ["=1+1"],
        ["+1+1"],
        ["@SUM(A1:A9)"],
        ["=HYPERLINK(\"http://evil\",\"x\")"],
      ],
    };
    const out = toCsv(table);
    expect(out).toContain("\r\n'=1+1\r\n");
    expect(out).toContain("\r\n'+1+1\r\n");
    expect(out).toContain("\r\n'@SUM(A1:A9)\r\n");
    // The HYPERLINK payload contains a quote, so it is RFC-quoted AND the
    // leading single quote sits inside the quoted field, ahead of the `=`.
    expect(out).toContain("\"'=HYPERLINK(\"\"http://evil\"\",\"\"x\"\")\"");
  });

  it("escapes the classic DDE command-execution payload", () => {
    // The canonical Excel/LibreOffice formula-injection exploit.
    const table: CsvTable = {
      columns: ["c"],
      rows: [["=cmd|'/c calc'!A1"], ["@cmd|'/c calc'!A0"]],
    };
    const out = toCsv(table);
    // Begins with a quote inside the RFC-quoted field (the `|` etc. don't force
    // quoting, but the single quote we prepend does not either — so check raw).
    expect(out).toContain("'=cmd|'/c calc'!A1");
    expect(out).toContain("'@cmd|'/c calc'!A0");
  });

  it("escapes leading TAB and CR string cells (importers can re-expose them)", () => {
    const table: CsvTable = {
      columns: ["c"],
      rows: [["\t=1+1"], ["\r=1+1"]],
    };
    const out = toCsv(table);
    // A leading TAB does not force RFC quoting, so the cell is bare with the
    // neutralizing single quote in front.
    expect(out).toContain("\r\n'\t=1+1\r\n");
    // A leading CR forces RFC quoting; the single quote leads inside the quotes.
    expect(out).toContain('"\'\r=1+1"');
  });

  it("escapes a leading-hyphen string that is NOT a plain number", () => {
    const table: CsvTable = {
      columns: ["c"],
      rows: [["-2+3+cmd|'/c calc'!A1"], ["-foo"]],
    };
    const out = toCsv(table);
    expect(out).toContain("'-2+3+cmd|'/c calc'!A1");
    expect(out).toContain("\r\n'-foo\r\n");
  });

  it("leaves negative and signed NUMERIC strings untouched (they are numbers)", () => {
    const table: CsvTable = {
      columns: ["a", "b", "c", "d"],
      rows: [["-2.5", "+10", "-0.0013369008909980273", "1e-5"]],
    };
    // No leading single quote anywhere — these are spreadsheet numbers.
    expect(toCsv(table)).toBe(
      "a,b,c,d\r\n-2.5,+10,-0.0013369008909980273,1e-5\r\n",
    );
  });

  it("never escapes numeric or boolean cells, even when negative", () => {
    const table: CsvTable = {
      columns: ["neg", "pos", "bool"],
      rows: [[-2.5, 10, true]],
    };
    expect(toCsv(table)).toBe("neg,pos,bool\r\n-2.5,10,true\r\n");
  });

  it("leaves benign string cells exactly as-is", () => {
    const table: CsvTable = {
      columns: ["name", "note"],
      rows: [
        ["Acme, Inc.", "all good"],
        ["a=b is fine mid-string", "plain"],
        ["", "empty stays empty"],
      ],
    };
    expect(toCsv(table)).toBe(
      'name,note\r\n' +
        '"Acme, Inc.",all good\r\n' +
        "a=b is fine mid-string,plain\r\n" +
        ',empty stays empty\r\n',
    );
  });

  it("can be disabled with escapeFormulas:false (opt-out)", () => {
    const table: CsvTable = { columns: ["c"], rows: [["=1+1"]] };
    expect(toCsv(table, { escapeFormulas: false })).toBe("c\r\n=1+1\r\n");
    // Default path still escapes.
    expect(toCsv(table)).toBe("c\r\n'=1+1\r\n");
  });

  it("hardens dangerous header strings too", () => {
    const table: CsvTable = { columns: ["=evil"], rows: [] };
    expect(toCsv(table)).toBe("'=evil\r\n");
  });
});
