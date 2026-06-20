import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  RECENT_PAGES_LIMIT,
  RECENT_PAGES_STORAGE_KEY,
  readRecentPages,
  recordRecentPage,
  withRecentPage,
} from "./recent-pages";

describe("withRecentPage (pure)", () => {
  it("pushes the path to the front, most-recent-first", () => {
    expect(withRecentPage(["/risk", "/fees"], "/ops")).toEqual([
      "/ops",
      "/risk",
      "/fees",
    ]);
  });

  it("de-duplicates, moving an existing path to the front", () => {
    expect(withRecentPage(["/risk", "/fees"], "/fees")).toEqual([
      "/fees",
      "/risk",
    ]);
  });

  it("caps the list to the limit", () => {
    const many = Array.from(
      { length: RECENT_PAGES_LIMIT + 3 },
      (_, i) => `/p${i}`,
    );
    const next = withRecentPage(many, "/new");
    expect(next).toHaveLength(RECENT_PAGES_LIMIT);
    expect(next[0]).toBe("/new");
  });

  it("ignores a non-route path (must start with '/')", () => {
    expect(withRecentPage(["/risk"], "ops")).toEqual(["/risk"]);
    expect(withRecentPage(["/risk"], "")).toEqual(["/risk"]);
  });

  it("drops malformed entries already present in the list", () => {
    expect(
      withRecentPage(["/risk", 42 as unknown as string, "bad"], "/ops"),
    ).toEqual(["/ops", "/risk"]);
  });
});

describe("recordRecentPage / readRecentPages (storage)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it("starts empty and records visited pages most-recent-first", () => {
    expect(readRecentPages()).toEqual([]);
    recordRecentPage("/risk");
    recordRecentPage("/fees");
    expect(readRecentPages()).toEqual(["/fees", "/risk"]);
  });

  it("does not record a path that is not '/'-prefixed", () => {
    recordRecentPage("nope");
    recordRecentPage("");
    expect(readRecentPages()).toEqual([]);
  });

  it("degrades to [] when storage holds malformed JSON", () => {
    window.localStorage.setItem(RECENT_PAGES_STORAGE_KEY, "{not json");
    expect(readRecentPages()).toEqual([]);
  });

  it("degrades to [] when storage holds a non-array value", () => {
    window.localStorage.setItem(RECENT_PAGES_STORAGE_KEY, '"/risk"');
    expect(readRecentPages()).toEqual([]);
  });
});
