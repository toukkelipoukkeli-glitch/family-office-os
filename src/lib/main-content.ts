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
 * DOM on the first effect tick; this retries on a bounded number of animation
 * frames until it appears, keeping the work offline-safe and finite.
 */
export function useMainContentAnchor(path: string) {
  useEffect(() => {
    let raf = 0;
    let attempts = 0;
    const tag = () => {
      const main = document.querySelector("main");
      if (main) {
        if (!main.id) main.id = MAIN_CONTENT_ID;
        return;
      }
      if (attempts++ < 30) raf = requestAnimationFrame(tag);
    };
    tag();
    return () => cancelAnimationFrame(raf);
  }, [path]);
}
