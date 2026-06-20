import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildHash,
  currentHashParams,
  currentHashPathname,
  readHashParam,
  setHashParam,
  splitHash,
  useHashQueryParam,
} from "./hash-location";

function setHash(hash: string) {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}

afterEach(() => {
  act(() => {
    // Reset to a clean URL so tests do not leak hash state into one another.
    window.history.replaceState(null, "", window.location.pathname);
  });
});

describe("splitHash", () => {
  it("returns root path and empty query for an empty hash", () => {
    expect(splitHash("")).toEqual({ path: "/", query: "" });
    expect(splitHash("#")).toEqual({ path: "/", query: "" });
    expect(splitHash("#/")).toEqual({ path: "/", query: "" });
  });

  it("splits path from query at the first ?", () => {
    expect(splitHash("#/scenarios?s=rates-up")).toEqual({
      path: "/scenarios",
      query: "s=rates-up",
    });
  });

  it("keeps a path with no query intact", () => {
    expect(splitHash("#/managers")).toEqual({ path: "/managers", query: "" });
  });

  it("prefixes a leading slash when omitted", () => {
    expect(splitHash("#managers?m=x")).toEqual({
      path: "/managers",
      query: "m=x",
    });
  });

  it("only splits on the first ? (later ones stay in the query)", () => {
    expect(splitHash("#/p?a=1?b=2").query).toBe("a=1?b=2");
  });
});

describe("currentHashPathname / currentHashParams / readHashParam", () => {
  it("reads the pathname without the query suffix", () => {
    window.location.hash = "#/stress?e=gfc-2008";
    expect(currentHashPathname()).toBe("/stress");
  });

  it("parses query params from the hash", () => {
    window.location.hash = "#/managers?m=helios&x=1";
    expect(currentHashParams().get("m")).toBe("helios");
    expect(readHashParam("m")).toBe("helios");
    expect(readHashParam("absent")).toBeNull();
  });
});

describe("buildHash", () => {
  it("drops empty/null/undefined params and sorts the rest", () => {
    expect(buildHash("/managers", { m: "helios", x: "", y: null })).toBe(
      "#/managers?m=helios",
    );
    expect(buildHash("/managers", { b: "2", a: "1" })).toBe(
      "#/managers?a=1&b=2",
    );
  });

  it("omits the ? entirely when no params remain", () => {
    expect(buildHash("/managers", { m: "" })).toBe("#/managers");
  });
});

describe("setHashParam", () => {
  it("sets a param while preserving the path", () => {
    window.location.hash = "#/scenarios";
    setHashParam("s", "rates-up");
    expect(window.location.hash).toBe("#/scenarios?s=rates-up");
  });

  it("removes a param when given null or empty", () => {
    window.location.hash = "#/scenarios?s=rates-up";
    setHashParam("s", null);
    expect(window.location.hash).toBe("#/scenarios");
  });

  it("preserves other params when changing one", () => {
    window.location.hash = "#/p?a=1&b=2";
    setHashParam("a", "9");
    const params = new URLSearchParams(splitHash(window.location.hash).query);
    expect(params.get("a")).toBe("9");
    expect(params.get("b")).toBe("2");
  });

  it("does not use pushState (no extra history entry per change)", () => {
    window.location.hash = "#/scenarios";
    const before = window.history.length;
    setHashParam("s", "a");
    setHashParam("s", "b");
    expect(window.history.length).toBe(before);
  });

  it("no-ops when the value is unchanged", () => {
    window.location.hash = "#/scenarios?s=a";
    const spy = window.location.hash;
    setHashParam("s", "a");
    expect(window.location.hash).toBe(spy);
  });
});

describe("useHashQueryParam", () => {
  it("returns the fallback when the param is absent", () => {
    window.location.hash = "#/scenarios";
    const { result } = renderHook(() => useHashQueryParam("s", "worst"));
    expect(result.current[0]).toBe("worst");
  });

  it("reads the initial value from a deep link", () => {
    window.location.hash = "#/scenarios?s=rates-up";
    const { result } = renderHook(() => useHashQueryParam("s", "worst"));
    expect(result.current[0]).toBe("rates-up");
  });

  it("writing updates the URL and the returned value", () => {
    window.location.hash = "#/scenarios";
    const { result } = renderHook(() => useHashQueryParam("s", "worst"));
    act(() => result.current[1]("rates-up"));
    expect(result.current[0]).toBe("rates-up");
    expect(window.location.hash).toBe("#/scenarios?s=rates-up");
  });

  it("writing the fallback clears the param (clean URL)", () => {
    window.location.hash = "#/scenarios?s=rates-up";
    const { result } = renderHook(() => useHashQueryParam("s", "worst"));
    act(() => result.current[1]("worst"));
    expect(result.current[0]).toBe("worst");
    expect(window.location.hash).toBe("#/scenarios");
  });

  it("re-renders when the hash changes externally (back/forward)", () => {
    window.location.hash = "#/scenarios?s=a";
    const { result } = renderHook(() => useHashQueryParam("s", "worst"));
    expect(result.current[0]).toBe("a");
    setHash("#/scenarios?s=b");
    expect(result.current[0]).toBe("b");
  });

  it("stops listening after unmount", () => {
    window.location.hash = "#/scenarios?s=a";
    const { result, unmount } = renderHook(() => useHashQueryParam("s", "w"));
    expect(result.current[0]).toBe("a");
    unmount();
    setHash("#/scenarios?s=b");
    expect(result.current[0]).toBe("a");
  });
});
