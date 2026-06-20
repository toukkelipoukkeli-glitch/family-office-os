/**
 * Theme preference: persistence + resolution.
 *
 * The app supports three user-facing preferences — explicit `"light"`, explicit
 * `"dark"`, or `"system"` (follow the OS `prefers-color-scheme`). The preference
 * is persisted in `localStorage`; the *resolved* theme (the concrete light/dark
 * value actually applied to the document) is derived from the preference plus the
 * current system setting.
 *
 * Dark mode is driven by toggling the `dark` class on the document root, matching
 * the `@custom-variant dark (&:is(.dark *))` declared in `index.css` — Tailwind's
 * `dark:` utilities then resolve against that class. All functions here are pure
 * or take their dependencies (storage, media query) explicitly so they can be
 * unit-tested deterministically and offline.
 */

/** A concrete, applied theme. */
export type Theme = "light" | "dark";

/** A user preference. `"system"` follows the OS `prefers-color-scheme`. */
export type ThemePreference = Theme | "system";

/** localStorage key the preference is persisted under. */
export const THEME_STORAGE_KEY = "foos-theme";

/** Default preference when nothing is stored. */
export const DEFAULT_PREFERENCE: ThemePreference = "system";

/** Ordered cycle used by the toggle button: system → light → dark → system. */
export const PREFERENCE_CYCLE: readonly ThemePreference[] = [
  "system",
  "light",
  "dark",
] as const;

/** Type guard for a valid persisted preference value. */
export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

/**
 * Read the stored preference. Returns {@link DEFAULT_PREFERENCE} when nothing is
 * stored, the stored value is invalid, or storage is unavailable (e.g. SSR or a
 * privacy mode that throws on access).
 */
export function getStoredPreference(
  storage: Pick<Storage, "getItem"> | undefined = safeLocalStorage(),
): ThemePreference {
  if (!storage) return DEFAULT_PREFERENCE;
  try {
    const raw = storage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(raw) ? raw : DEFAULT_PREFERENCE;
  } catch {
    return DEFAULT_PREFERENCE;
  }
}

/**
 * Persist a preference. `"system"` is stored explicitly (rather than cleared) so
 * a user who opts back into "follow the system" is distinguishable from a fresh
 * visitor — both happen to resolve the same way, but storing it keeps the toggle
 * state stable across reloads. Silently no-ops when storage is unavailable.
 */
export function setStoredPreference(
  preference: ThemePreference,
  storage: Pick<Storage, "setItem"> | undefined = safeLocalStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    /* storage full or blocked — preference simply won't persist */
  }
}

/**
 * The system's current color scheme via `prefers-color-scheme`. Defaults to
 * `"light"` when `matchMedia` is unavailable.
 */
export function getSystemTheme(
  matchMediaFn: typeof window.matchMedia | undefined = safeMatchMedia(),
): Theme {
  if (!matchMediaFn) return "light";
  try {
    return matchMediaFn("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  } catch {
    return "light";
  }
}

/**
 * Resolve a preference to the concrete theme to apply. `"system"` resolves via
 * {@link getSystemTheme}; explicit preferences pass through unchanged.
 */
export function resolveTheme(
  preference: ThemePreference,
  matchMediaFn?: typeof window.matchMedia,
): Theme {
  if (preference === "system") return getSystemTheme(matchMediaFn);
  return preference;
}

/**
 * Apply a resolved theme to a document root by toggling the `dark` class and
 * setting `color-scheme` (so native form controls / scrollbars match). Pure with
 * respect to its `root` argument — pass `document.documentElement` in the app.
 */
export function applyTheme(theme: Theme, root: HTMLElement): void {
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

/** Next preference in the cycle (wraps around). */
export function nextPreference(current: ThemePreference): ThemePreference {
  const i = PREFERENCE_CYCLE.indexOf(current);
  // Unknown values restart the cycle at its first entry.
  const next = PREFERENCE_CYCLE[(i + 1) % PREFERENCE_CYCLE.length];
  return next ?? PREFERENCE_CYCLE[0]!;
}

/** `localStorage` if present and reachable, else `undefined`. */
function safeLocalStorage(): Storage | undefined {
  try {
    return typeof localStorage !== "undefined" ? localStorage : undefined;
  } catch {
    return undefined;
  }
}

/** `window.matchMedia` bound to `window`, if present, else `undefined`. */
function safeMatchMedia(): typeof window.matchMedia | undefined {
  try {
    return typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia.bind(window)
      : undefined;
  } catch {
    return undefined;
  }
}
