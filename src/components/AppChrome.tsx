import * as React from "react";

import {
  MAIN_CONTENT_ID,
  resolveMainContent,
} from "@/lib/main-content";
import { routeAnnouncement } from "@/lib/route-title";

/**
 * A keyboard-first "skip to content" link.
 *
 * It is the first focusable element on the page and is visually hidden until it
 * receives focus (Tab from page load), at which point it appears and lets a
 * keyboard or screen-reader user jump straight past the navigation to the page's
 * main content (`#main-content`). This is a standard WCAG 2.4.1 bypass block.
 */
export function SkipToContentLink() {
  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      data-testid="skip-to-content"
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:border focus:border-border focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-md focus:outline-none focus:ring-2 focus:ring-ring"
      onClick={(e) => {
        // The hash link changes the URL hash, which our hash-router would treat
        // as a route. Intercept it: move focus to the main region directly and
        // do not mutate the route.
        e.preventDefault();
        const main = resolveMainContent();
        if (main) {
          main.setAttribute("tabindex", "-1");
          main.focus();
        }
      }}
    >
      Skip to content
    </a>
  );
}

/**
 * Polite aria-live region that announces the current page on navigation.
 *
 * Single-page apps swap content without a full page load, so screen readers do
 * not announce the new page the way a browser would on a real navigation. This
 * region watches the resolved route `path` and, whenever it changes, writes the
 * page title into a `aria-live="polite"` element so assistive tech reads e.g.
 * "Charts page" after a nav click. It renders nothing visible.
 */
export function RouteAnnouncer({ path }: { path: string }) {
  const [message, setMessage] = React.useState("");
  // Remember the path we last announced. Initialised to the path at mount so the
  // initial page load is NOT announced (the browser does that itself) and so the
  // guard is robust to React StrictMode's double-invoked effects in dev — those
  // re-run with the same `path`, which this equality check ignores.
  const lastAnnounced = React.useRef(path);

  React.useEffect(() => {
    if (path === lastAnnounced.current) return;
    lastAnnounced.current = path;
    setMessage(routeAnnouncement(path));
  }, [path]);

  return (
    <div
      data-testid="route-announcer"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    >
      {message}
    </div>
  );
}
