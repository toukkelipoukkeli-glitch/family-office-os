import "@testing-library/jest-dom";

import { afterEach } from "vitest";

// Reset the URL hash between tests. Deep-linkable sub-view state (see
// `@/lib/hash-location`) persists the current selection on `window.location.hash`,
// which is a shared global in jsdom. Without this reset, a test that selects a
// scenario/manager/entity/episode would leak that selection into the next test
// in the same file. Resetting to a clean path keeps every test deterministic.
afterEach(() => {
  // Only in a DOM-like environment (jsdom). Node-environment suites (e.g. the
  // convex tests) may expose a partial `window` without a real History API.
  if (typeof window !== "undefined" && typeof window.history?.replaceState === "function") {
    window.history.replaceState(null, "", window.location.pathname);
  }
});
