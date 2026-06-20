import { useCallback, useEffect, useState } from "react";

/**
 * Hash-location helpers for deep-linkable in-page sub-view state.
 *
 * The app is a static-host SPA routed entirely through `window.location.hash`
 * (see {@link useHashRoute}). A hash like `#/scenarios?s=rates-up` carries both
 * the *route* (`/scenarios`) and a *sub-view selection* (`s=rates-up`). These
 * helpers split, parse and rebuild that hash so a selected scenario / manager /
 * entity / episode can live in the URL — making it shareable and reload-proof —
 * without pulling in a router dependency.
 *
 * Design notes:
 * - The query is the part of the hash after the first `?`. Everything before it
 *   is the pathname used for route matching, so `matchRoute` keeps seeing a
 *   clean `/scenarios` and its exact-match contract is unaffected.
 * - Writes go through `history.replaceState` so flipping between sub-views does
 *   not spam the browser back-stack with one entry per click. We still dispatch
 *   a synthetic `hashchange` because `replaceState` does not emit one, and the
 *   hash router + these hooks listen for it.
 */

/** The pathname + query parsed out of a raw hash string. */
export interface HashParts {
  /** Path portion, normalised to start with `/` (default `/`). */
  path: string;
  /** Raw query string (without the leading `?`); empty when absent. */
  query: string;
}

/** Split a raw `location.hash` value into its path and query parts. */
export function splitHash(hash: string): HashParts {
  const raw = hash.replace(/^#/, "");
  const qIndex = raw.indexOf("?");
  const rawPath = qIndex === -1 ? raw : raw.slice(0, qIndex);
  const query = qIndex === -1 ? "" : raw.slice(qIndex + 1);

  let path: string;
  if (rawPath === "" || rawPath === "/") {
    path = "/";
  } else {
    path = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  }
  return { path, query };
}

/** The current hash pathname (the part before any `?`), defaulting to `/`. */
export function currentHashPathname(): string {
  return splitHash(window.location.hash).path;
}

/** Parse the current hash's query string into URLSearchParams. */
export function currentHashParams(): URLSearchParams {
  return new URLSearchParams(splitHash(window.location.hash).query);
}

/**
 * Read a single sub-view query param from the current hash. Returns `null` when
 * the key is absent so callers can fall back to their own default.
 */
export function readHashParam(key: string): string | null {
  return currentHashParams().get(key);
}

/**
 * Build a hash string (including the leading `#`) from a path and a set of query
 * params. Params whose value is `null`/`undefined`/`""` are dropped so the URL
 * stays clean (no dangling `?key=`). Remaining params are sorted for a stable,
 * shareable URL that does not churn on re-render.
 */
export function buildHash(
  path: string,
  params: Record<string, string | null | undefined>,
): string {
  const search = new URLSearchParams();
  for (const key of Object.keys(params).sort()) {
    const value = params[key];
    if (value !== null && value !== undefined && value !== "") {
      search.set(key, value);
    }
  }
  const query = search.toString();
  return query === "" ? `#${path}` : `#${path}?${query}`;
}

/**
 * Replace one query param on the *current* hash, preserving the path and every
 * other param. A `null`/`""` value removes the key. Uses `replaceState` (no new
 * history entry) and emits a synthetic `hashchange` so listeners update.
 *
 * No-ops when the resulting hash is unchanged, so calling it inside an effect to
 * normalise the URL cannot loop.
 */
export function setHashParam(key: string, value: string | null): void {
  const { path } = splitHash(window.location.hash);
  const params = currentHashParams();
  const current = params.get(key);
  if ((value ?? "") === (current ?? "")) return;

  if (value === null || value === "") {
    params.delete(key);
  } else {
    params.set(key, value);
  }

  const record: Record<string, string> = {};
  for (const [k, v] of params) record[k] = v;
  const nextHash = buildHash(path, record);
  if (nextHash === window.location.hash) return;

  const url = `${window.location.pathname}${window.location.search}${nextHash}`;
  window.history.replaceState(window.history.state, "", url);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

/**
 * Deep-linkable sub-view state, stored as a query param on the route's hash.
 *
 * Returns `[value, setValue]` like `useState`, but the value lives in
 * `window.location.hash` (e.g. `#/managers?m=helios`). This makes the selection
 * shareable and reload-proof, and keeps it in sync with browser back/forward and
 * any other writer (it re-reads on `hashchange`).
 *
 * @param key        Query-param key (short and stable, e.g. `"s"`, `"m"`).
 * @param fallback   Value to use when the param is absent from the URL.
 */
export function useHashQueryParam(
  key: string,
  fallback: string,
): [string, (next: string) => void] {
  const read = useCallback((): string => {
    const value = readHashParam(key);
    return value === null || value === "" ? fallback : value;
  }, [key, fallback]);

  const [value, setValue] = useState<string>(read);

  useEffect(() => {
    const onChange = () => setValue(read());
    // Re-sync immediately in case the hash changed between initial read and the
    // effect running (e.g. a deep link applied during mount).
    setValue(read());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, [read]);

  const set = useCallback(
    (next: string) => {
      // Persisting the fallback as an explicit param would bloat the URL; store
      // it as the *absence* of the key so a default selection yields a clean URL.
      setHashParam(key, next === fallback ? null : next);
    },
    [key, fallback],
  );

  return [value, set];
}
