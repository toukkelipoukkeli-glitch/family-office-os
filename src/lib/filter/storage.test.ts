import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readStoredSelection, writeStoredSelection } from "./storage";

const KEY = "fo-os:tag-filter";

describe("tag-filter storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it("returns an empty selection when nothing is stored", () => {
    expect(readStoredSelection()).toEqual([]);
  });

  it("round-trips a selection", () => {
    writeStoredSelection(["core", "tech"]);
    expect(readStoredSelection()).toEqual(["core", "tech"]);
  });

  it("accepts any iterable (e.g. a Set)", () => {
    writeStoredSelection(new Set(["liquidity"]));
    expect(readStoredSelection()).toEqual(["liquidity"]);
  });

  it("ignores corrupt JSON and degrades to empty", () => {
    window.localStorage.setItem(KEY, "{not json");
    expect(readStoredSelection()).toEqual([]);
  });

  it("ignores a non-array payload", () => {
    window.localStorage.setItem(KEY, JSON.stringify({ a: 1 }));
    expect(readStoredSelection()).toEqual([]);
  });

  it("filters out non-string and empty entries", () => {
    window.localStorage.setItem(KEY, JSON.stringify(["ok", 1, "", null, "two"]));
    expect(readStoredSelection()).toEqual(["ok", "two"]);
  });

  it("degrades to empty (no throw) when accessing localStorage itself throws", () => {
    // Some privacy-restricted contexts throw on the `window.localStorage`
    // property access, before any get/set call. Both helpers must catch that.
    const original = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("denied", "SecurityError");
      },
    });
    try {
      expect(() => readStoredSelection()).not.toThrow();
      expect(readStoredSelection()).toEqual([]);
      expect(() => writeStoredSelection(["core"])).not.toThrow();
    } finally {
      if (original) Object.defineProperty(window, "localStorage", original);
    }
  });
});
