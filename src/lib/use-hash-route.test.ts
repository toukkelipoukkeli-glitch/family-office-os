import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { currentHashPath, useHashRoute } from "./use-hash-route";

function setHash(hash: string) {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}

afterEach(() => {
  // Reset the hash so tests do not leak state into one another.
  act(() => {
    window.location.hash = "";
  });
});

describe("currentHashPath", () => {
  it('defaults to "/" when there is no hash', () => {
    window.location.hash = "";
    expect(currentHashPath()).toBe("/");
  });

  it('treats a bare "#/" as the root path', () => {
    window.location.hash = "#/";
    expect(currentHashPath()).toBe("/");
  });

  it("strips the leading # and keeps an absolute path", () => {
    window.location.hash = "#/ops";
    expect(currentHashPath()).toBe("/ops");
  });

  it("prefixes a leading slash when the hash omits it", () => {
    window.location.hash = "#ops";
    expect(currentHashPath()).toBe("/ops");
  });

  it("preserves nested paths verbatim", () => {
    window.location.hash = "#/ops/units/m4-ops";
    expect(currentHashPath()).toBe("/ops/units/m4-ops");
  });

  it("keeps query-ish suffixes attached to the path (no exact /ops match)", () => {
    window.location.hash = "#/ops?tab=blocked";
    expect(currentHashPath()).toBe("/ops?tab=blocked");
  });
});

describe("useHashRoute", () => {
  it("returns the initial path on mount", () => {
    window.location.hash = "#/ops";
    const { result } = renderHook(() => useHashRoute());
    expect(result.current).toBe("/ops");
  });

  it("re-renders with the new path on hashchange", () => {
    window.location.hash = "";
    const { result } = renderHook(() => useHashRoute());
    expect(result.current).toBe("/");

    setHash("#/ops");
    expect(result.current).toBe("/ops");

    setHash("#");
    expect(result.current).toBe("/");
  });

  it("stops listening after unmount (no update on later hashchange)", () => {
    window.location.hash = "#/ops";
    const { result, unmount } = renderHook(() => useHashRoute());
    expect(result.current).toBe("/ops");

    unmount();
    // Changing the hash after unmount must not throw and must not be observed.
    setHash("#/somewhere-else");
    expect(result.current).toBe("/ops");
  });
});
