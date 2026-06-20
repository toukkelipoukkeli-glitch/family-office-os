/**
 * m13-palette-deeplink-actions — recent-page history for the command palette.
 *
 * The palette surfaces the most recently *visited* routes at the very top of
 * the (empty-query) list, so jumping back to a page you were just on is one
 * keystroke away. History is a small, de-duplicated, most-recent-first list of
 * route paths persisted to `localStorage` so it survives reloads.
 *
 * All access is SSR-/test-safe: missing or malformed storage degrades to an
 * empty list rather than throwing. READ-ONLY product: nothing here moves money;
 * it only records which pages were viewed.
 */

/** localStorage key the recent-page history is persisted under. */
export const RECENT_PAGES_STORAGE_KEY = "fo-os:recent-pages";

/** How many recent paths to keep / surface. */
export const RECENT_PAGES_LIMIT = 5;

/**
 * Resolve `window.localStorage` defensively. The property access itself can
 * throw synchronously in privacy-restricted contexts, so it must be wrapped.
 */
function getLocalStorageSafe(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Normalise a raw stored value to a clean recent-paths list: an array of
 * route-path strings (each starting with `/`), de-duplicated, capped to the
 * limit. Anything malformed degrades to `[]`.
 */
function normalizeList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    if (!entry.startsWith("/")) continue;
    if (seen.has(entry)) continue;
    seen.add(entry);
    out.push(entry);
    if (out.length >= RECENT_PAGES_LIMIT) break;
  }
  return out;
}

/**
 * Read the recent-page history, most-recent-first. Returns `[]` when unset,
 * malformed, or storage is unavailable.
 */
export function readRecentPages(): string[] {
  const storage = getLocalStorageSafe();
  if (!storage) return [];
  try {
    const raw = storage.getItem(RECENT_PAGES_STORAGE_KEY);
    if (raw === null) return [];
    return normalizeList(JSON.parse(raw));
  } catch {
    return [];
  }
}

/**
 * Pure list transform: push `path` to the front of `current`, de-duplicating
 * and capping. Exposed for testing the ordering logic without storage.
 */
export function withRecentPage(current: string[], path: string): string[] {
  if (typeof path !== "string" || !path.startsWith("/")) return normalizeList(current);
  return normalizeList([path, ...current]);
}

/**
 * Record a visit to `path`, moving it to the front of the history. No-ops for a
 * non-route path or when storage is unavailable.
 */
export function recordRecentPage(path: string): void {
  if (typeof path !== "string" || !path.startsWith("/")) return;
  const storage = getLocalStorageSafe();
  if (!storage) return;
  try {
    const next = withRecentPage(readRecentPages(), path);
    storage.setItem(RECENT_PAGES_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Quota or privacy mode — history just won't persist.
  }
}
