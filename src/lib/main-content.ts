import { useEffect } from "react";

/** The id every page's main content region is anchored to for skip-to-content. */
export const MAIN_CONTENT_ID = "main-content";

/**
 * Resolve the page's main content region.
 *
 * Prefers the canonical `#main-content` element (set by the shared `AppShell`,
 * `Dashboard` and the charts gallery). Pages that still hand-roll their own
 * `<main>` without that id are handled gracefully by falling back to the first
 * `<main>` landmark on the page, so the skip link works everywhere.
 */
export function resolveMainContent(): HTMLElement | null {
  return (
    document.getElementById(MAIN_CONTENT_ID) ?? document.querySelector("main")
  );
}

/**
 * Ensure the current page's main region carries the canonical `#main-content`
 * id so the skip link and the `main#main-content` landmark hold on every route —
 * including pages that hand-roll a bare `<main>`. Runs whenever the resolved
 * route `path` changes (after the new page has mounted).
 *
 * Pages are code-split behind Suspense, so the new `<main>` may not be in the
 * DOM on the first effect tick. We tag it immediately if present; otherwise we
 * watch the DOM with a `MutationObserver` until it mounts — so an arbitrarily
 * slow chunk load still gets anchored, without polling forever. The observer is
 * disconnected as soon as the `<main>` is tagged or the route changes.
 */
export function useMainContentAnchor(path: string) {
  useEffect(() => {
    const tag = (): boolean => {
      const main = document.querySelector("main");
      if (main) {
        if (!main.id) main.id = MAIN_CONTENT_ID;
        return true;
      }
      return false;
    };

    // Fast path: the page's <main> is already in the DOM.
    if (tag()) return;

    // Slow path: a code-split route hasn't mounted its <main> yet. Watch for it.
    // `MutationObserver` is a no-op in non-DOM environments; guard defensively.
    if (typeof MutationObserver === "undefined") return;
    const observer = new MutationObserver(() => {
      if (tag()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [path]);
}
