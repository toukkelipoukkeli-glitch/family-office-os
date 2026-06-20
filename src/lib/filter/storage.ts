/**
 * Persistence for the global tag-filter selection.
 *
 * The selection is a small set of tag strings stored as a JSON array in
 * `localStorage`, so the filter survives reloads and navigation. All access is
 * SSR-/test-safe: missing or malformed storage degrades to an empty selection
 * rather than throwing. READ-ONLY product: nothing here moves money.
 */

const STORAGE_KEY = "fo-os:tag-filter";

/**
 * Resolve `window.localStorage` defensively. The property access itself can
 * throw synchronously in privacy-restricted contexts (e.g. blocked storage), so
 * it must be wrapped — not just the `getItem`/`setItem` calls.
 */
function getLocalStorageSafe(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Read the persisted selection. Returns `[]` when unset/unavailable/corrupt. */
export function readStoredSelection(): string[] {
  const storage = getLocalStorageSafe();
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Keep only non-empty strings; drop anything else defensively.
    return parsed.filter(
      (t): t is string => typeof t === "string" && t.length > 0,
    );
  } catch {
    return [];
  }
}

/** Persist the selection. No-ops when storage is unavailable. */
export function writeStoredSelection(selection: Iterable<string>): void {
  const storage = getLocalStorageSafe();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify([...selection]));
  } catch {
    // Quota or privacy mode — the filter just won't persist.
  }
}
