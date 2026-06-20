import { matchRoute } from "@/lib/routes";

/**
 * Human-readable title for a hash path, used by the aria-live route announcer.
 *
 * Falls back to the dashboard's name for the root and any unmatched path, which
 * mirrors the routing behaviour in {@link App} where unknown paths render the
 * dashboard. Prefix-matched routes (e.g. `/pipeline/acme`) resolve to their base
 * route's label.
 */
export function routeTitle(path: string): string {
  if (path === "/" || path === "") return "Overview";
  if (path === "/crash-test") return "Error";
  const route = matchRoute(path);
  return route ? route.label : "Overview";
}

/**
 * The full sentence read out by the route announcer when navigation occurs,
 * e.g. "Charts page". Kept as a single function so the e2e/unit tests and the
 * component agree on the exact wording.
 */
export function routeAnnouncement(path: string): string {
  return `${routeTitle(path)} page`;
}
