import { useEffect, useState } from "react";

/** Read the current hash path, normalized to start with "/" (default "/"). */
export function currentHashPath(): string {
  const raw = window.location.hash.replace(/^#/, "");
  if (raw === "" || raw === "/") return "/";
  return raw.startsWith("/") ? raw : `/${raw}`;
}

/**
 * Minimal dependency-free hash router. Returns the current hash path and
 * re-renders on `hashchange`. Using the hash keeps deep links (e.g. `#/ops`)
 * working on a static host with no server-side routing.
 */
export function useHashRoute(): string {
  const [path, setPath] = useState<string>(() => currentHashPath());

  useEffect(() => {
    const onChange = () => setPath(currentHashPath());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  return path;
}
