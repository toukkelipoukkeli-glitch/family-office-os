/**
 * m14-no-key-guard — the client-side "no live network call without keys" guard.
 *
 * The product is deployed as a static client bundle to GitHub Pages. Provider
 * keys (Gemini, Alpha Vantage, FRED, ElevenLabs, Tavily) live ONLY server-side
 * (Convex actions, `process.env`); they are never embedded in the browser
 * bundle. Two independent invariants must therefore always hold in the client:
 *
 *   1. NO KEY  → NO live network call. With no key configured the AI adapter
 *      returns an `unavailable` result and never fetches anything.
 *   2. NO live AI/data host from the BROWSER, key or not. Even if a key were
 *      somehow injected into the client (a misconfiguration, a leaked build
 *      var), the browser must NOT reach out to a live provider host. The live
 *      fetch belongs server-side; the client always degrades gracefully.
 *
 * This module is the single source of truth for both invariants. It is pure and
 * dependency-free so it can be imported by the adapter, the unit tests, and the
 * e2e network assertion alike.
 *
 * READ-ONLY product: nothing here moves money, places trades, or sends email.
 */

/**
 * Hostnames of the live AI / data providers the app integrates with. A request
 * to any of these from the browser is a guard violation. Kept in sync with the
 * adapter base URLs (`GEMINI_BASE_URL`, `ALPHA_VANTAGE_BASE_URL`,
 * `FRED_BASE_URL`) and the optional capability providers in `.env.example`.
 */
export const LIVE_PROVIDER_HOSTS: readonly string[] = [
  // AI
  "generativelanguage.googleapis.com", // Google Gemini
  "api.elevenlabs.io", // ElevenLabs (voice)
  "api.tavily.com", // Tavily (AI search)
  // Market & macro data
  "www.alphavantage.co", // Alpha Vantage (equities)
  "alphavantage.co",
  "api.stlouisfed.org", // FRED (macro)
];

/**
 * True when running in a real browser runtime (a `window` with a `document`),
 * as opposed to Node/Convex/jsdom-driven server code. We intentionally treat
 * jsdom (the unit-test DOM) the same as a browser so the guard is exercised by
 * the test suite exactly as it would be in production.
 */
export function isBrowserRuntime(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as { document?: unknown }).document !== "undefined"
  );
}

/** Extract a lowercased hostname from a URL string; "" if it cannot be parsed. */
function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    // Relative URLs (same-origin app assets) have no live provider host.
    try {
      const base =
        typeof window !== "undefined" && window.location
          ? window.location.href
          : "http://localhost/";
      return new URL(url, base).hostname.toLowerCase();
    } catch {
      return "";
    }
  }
}

/**
 * True when `url` targets one of the {@link LIVE_PROVIDER_HOSTS}. Matches the
 * exact host or a subdomain of it (e.g. `eu.api.tavily.com`).
 */
export function isLiveProviderUrl(url: string): boolean {
  const host = hostnameOf(url);
  if (!host) return false;
  return LIVE_PROVIDER_HOSTS.some(
    (provider) => host === provider || host.endsWith(`.${provider}`),
  );
}

/** Marker error thrown by the guard when a live call is blocked in the browser. */
export class LiveCallBlockedError extends Error {
  readonly url: string;
  constructor(url: string) {
    super(
      `Blocked a live network call to a provider host from the browser: ${
        hostnameOf(url) || url
      }. Provider keys live server-side; the client degrades gracefully.`,
    );
    this.name = "LiveCallBlockedError";
    this.url = url;
  }
}

/**
 * The guard decision for a candidate request. `allow` is true only when the
 * call is safe to perform from the current runtime.
 */
export interface GuardDecision {
  readonly allow: boolean;
  /** Set when `allow` is false; explains why for logging/tests. */
  readonly reason?: "browser-live-host";
}

/**
 * Decide whether a fetch to `url` may proceed. In a browser runtime any request
 * to a live provider host is denied; everywhere else (Node/Convex/server) it is
 * allowed. Same-origin and non-provider URLs are always allowed.
 */
export function guardLiveCall(
  url: string,
  opts: { isBrowser?: boolean } = {},
): GuardDecision {
  const inBrowser = opts.isBrowser ?? isBrowserRuntime();
  if (inBrowser && isLiveProviderUrl(url)) {
    return { allow: false, reason: "browser-live-host" };
  }
  return { allow: true };
}
