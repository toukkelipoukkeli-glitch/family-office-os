import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  MAIN_CONTENT_ID,
  resolveMainContent,
  useMainContentAnchor,
} from "./main-content";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("resolveMainContent", () => {
  it("prefers the canonical #main-content element", () => {
    document.body.innerHTML = `
      <main id="${MAIN_CONTENT_ID}">canonical</main>
      <main>other</main>
    `;
    expect(resolveMainContent()?.textContent).toContain("canonical");
  });

  it("falls back to the first <main> when the id is absent", () => {
    document.body.innerHTML = `<main>bare</main>`;
    expect(resolveMainContent()?.textContent).toBe("bare");
  });

  it("returns null when there is no main element", () => {
    document.body.innerHTML = `<div>no main here</div>`;
    expect(resolveMainContent()).toBeNull();
  });
});

describe("useMainContentAnchor", () => {
  it("tags a bare <main> with the canonical id", () => {
    document.body.innerHTML = `<main>page</main>`;
    renderHook(() => useMainContentAnchor("/some-route"));
    expect(document.querySelector("main")?.id).toBe(MAIN_CONTENT_ID);
  });

  it("leaves an existing id untouched", () => {
    document.body.innerHTML = `<main id="already-set">page</main>`;
    renderHook(() => useMainContentAnchor("/x"));
    expect(document.querySelector("main")?.id).toBe("already-set");
  });

  it("does not throw when no main is present yet", () => {
    document.body.innerHTML = `<div>loading…</div>`;
    expect(() =>
      renderHook(() => useMainContentAnchor("/pending")),
    ).not.toThrow();
  });
});
