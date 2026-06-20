/**
 * Adversarial tests for the export toolkit (independent tester).
 *
 * These probe determinism, edge cases, and the read-only/offline contract that
 * the primary suite does not assert directly:
 *  - JSON canonicalization is truly key-order independent and recurses into
 *    nested objects inside arrays;
 *  - `toJSON` honouring is recursive (a Money-like value nested deeply);
 *  - non-finite numbers are rejected from every position (nested, in arrays,
 *    and even when `sortKeys` is off);
 *  - CSV custom newline + delimiter that itself needs no quoting;
 *  - `slugifyFilename` collapses/strips and never yields an empty stem;
 *  - `triggerDownload` revokes the object URL even when the click throws, and
 *    never leaves the transient anchor attached.
 */
import { describe, expect, it, vi } from "vitest";

import { toCsv, type CsvTable } from "./csv";
import { toJson } from "./json";
import {
  triggerDownload,
  slugifyFilename,
  type DownloadDeps,
} from "./download";

describe("toJson — adversarial determinism", () => {
  it("is byte-identical regardless of key insertion order, recursively", () => {
    const a = { z: 1, a: { y: 2, x: 3 }, m: [{ b: 1, a: 2 }] };
    const b = { m: [{ a: 2, b: 1 }], a: { x: 3, y: 2 }, z: 1 };
    expect(toJson(a)).toBe(toJson(b));
    // Spot-check the canonical bytes so a regression in ordering is visible.
    expect(toJson(a)).toBe(
      '{\n  "a": {\n    "x": 3,\n    "y": 2\n  },\n  "m": [\n    {\n      "a": 2,\n      "b": 1\n    }\n  ],\n  "z": 1\n}\n',
    );
  });

  it("preserves array order (arrays are sequences, not sets)", () => {
    expect(toJson([3, 1, 2])).toBe("[\n  3,\n  1,\n  2\n]\n");
  });

  it("honours a nested toJSON (Money-like) before sorting", () => {
    const money = { amount: 12.5, toJSON: () => "12.50" };
    const out = toJson({ wrap: { value: money } });
    expect(out).toContain('"value": "12.50"');
  });

  it("rejects a non-finite number nested in an array", () => {
    expect(() => toJson({ xs: [1, Number.POSITIVE_INFINITY] })).toThrow(
      /non-finite/,
    );
  });

  it("rejects a non-finite number even when sortKeys is off", () => {
    expect(() => toJson({ x: Number.NaN }, { sortKeys: false })).toThrow(
      /non-finite/,
    );
  });

  it("respects a custom indent width", () => {
    expect(toJson({ a: 1 }, { indent: 4 })).toBe('{\n    "a": 1\n}\n');
  });
});

describe("toCsv — adversarial", () => {
  it("supports a custom newline without altering quoting rules", () => {
    const table: CsvTable = { columns: ["a"], rows: [["x\ny"]] };
    // LF embedded in a cell still forces quoting even when newline is LF.
    expect(toCsv(table, { newline: "\n" })).toBe('a\n"x\ny"\n');
  });

  it("does not quote a field that lacks the configured delimiter", () => {
    const table: CsvTable = { columns: ["a"], rows: [["b,c"]] };
    // With a tab delimiter a comma is just data — no quoting.
    expect(toCsv(table, { delimiter: "\t" })).toBe("a\r\nb,c\r\n");
  });

  it("rejects -Infinity as well as NaN", () => {
    const table: CsvTable = { columns: ["x"], rows: [[Number.NEGATIVE_INFINITY]] };
    expect(() => toCsv(table)).toThrow(/non-finite/);
  });

  it("emits an empty body (header only) for zero rows", () => {
    const table: CsvTable = { columns: ["a", "b"], rows: [] };
    expect(toCsv(table)).toBe("a,b\r\n");
  });
});

describe("slugifyFilename", () => {
  it("lowercases, collapses runs, and strips leading/trailing separators", () => {
    expect(slugifyFilename("  Net Worth — 2026/06/19  ")).toBe(
      "net-worth-2026-06-19",
    );
  });

  it("falls back to 'export' when nothing survives sanitization", () => {
    expect(slugifyFilename("***")).toBe("export");
    expect(slugifyFilename("")).toBe("export");
  });
});

describe("triggerDownload — resource safety", () => {
  function fakeDeps(): {
    deps: DownloadDeps;
    revoked: string[];
    appended: HTMLElement[];
    removed: HTMLElement[];
    anchor: { href?: string; download?: string; rel?: string; click: () => void };
  } {
    const revoked: string[] = [];
    const appended: HTMLElement[] = [];
    const removed: HTMLElement[] = [];
    const anchor = { click: vi.fn() } as unknown as HTMLAnchorElement & {
      href?: string;
      download?: string;
      rel?: string;
    };
    const deps: DownloadDeps = {
      createObjectURL: () => "blob:fake-url",
      revokeObjectURL: (u) => revoked.push(u),
      createElement: () => anchor,
      appendChild: (el) => appended.push(el),
      removeChild: (el) => removed.push(el),
    };
    return { deps, revoked, appended, removed, anchor };
  }

  it("revokes the object URL after a normal download", () => {
    const { deps, revoked, appended, removed } = fakeDeps();
    triggerDownload({ filename: "x.csv", content: "a,b\r\n" }, deps);
    expect(revoked).toEqual(["blob:fake-url"]);
    expect(appended).toHaveLength(1);
    expect(removed).toHaveLength(1);
  });

  it("revokes the object URL even when click() throws", () => {
    const { deps, revoked } = fakeDeps();
    const throwing: DownloadDeps = {
      ...deps,
      createElement: () =>
        ({
          click: () => {
            throw new Error("boom");
          },
        }) as unknown as HTMLAnchorElement,
    };
    expect(() =>
      triggerDownload({ filename: "x.json", content: "{}" }, throwing),
    ).toThrow(/boom/);
    expect(revoked).toEqual(["blob:fake-url"]);
  });
});
