import { useEffect, useState } from "react";

import { currentHashPathname } from "./hash-location";

/**
 * Read the current hash path, normalized to start with "/" (default "/").
 *
 * NOTE: this returns the hash *verbatim* (query suffix included), so
 * `#/ops?tab=x` yields `/ops?tab=x`. Route matching uses {@link useHashRoute},
 * which strips the query first, but this raw helper is kept for callers/tests
 * that depend on the un-split value.
 */
export function currentHashPath(): string {
  const raw = window.location.hash.replace(/^#/, "");
  if (raw === "" || raw === "/") return "/";
  return raw.startsWith("/") ? raw : `/${raw}`;
}

/**
 * Minimal dependency-free hash router. Returns the current hash *pathname* (the
 * part before any `?`, so a deep-linkable sub-view query like
 * `#/scenarios?s=rates-up` still resolves to the `/scenarios` route) and
 * re-renders on `hashchange`. Using the hash keeps deep links (e.g. `#/ops`)
 * working on a static host with no server-side routing.
 */
export function useHashRoute(): string {
  const [path, setPath] = useState<string>(() => currentHashPathname());

  useEffect(() => {
    const onChange = () => setPath(currentHashPathname());
    // Re-sync on mount in case the hash changed before the listener attached.
    setPath(currentHashPathname());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  return path;
}
