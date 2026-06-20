import { useCallback, useEffect, useState } from "react";

import {
  applyTheme,
  getStoredPreference,
  nextPreference,
  resolveTheme,
  setStoredPreference,
  type Theme,
  type ThemePreference,
} from "./theme";

export interface UseThemeResult {
  /** The persisted user preference (`light` / `dark` / `system`). */
  preference: ThemePreference;
  /** The concrete theme currently applied to the document. */
  resolved: Theme;
  /** Set an explicit preference (persisted + applied immediately). */
  setPreference: (preference: ThemePreference) => void;
  /** Advance to the next preference in the cycle (system → light → dark → …). */
  cyclePreference: () => void;
}

/**
 * Owns the live theme state for the app shell.
 *
 * On mount it reads the persisted preference, applies the resolved theme to
 * `<html>`, and — while the preference is `"system"` — subscribes to OS
 * `prefers-color-scheme` changes so the UI follows the system live. Changing the
 * preference persists it and re-applies synchronously. Designed so the *only*
 * source of truth for "is the document dark" is the `dark` class on the root,
 * matching the Tailwind `dark:` variant.
 */
export function useTheme(): UseThemeResult {
  const [preference, setPreferenceState] = useState<ThemePreference>(() =>
    getStoredPreference(),
  );
  const [resolved, setResolved] = useState<Theme>(() =>
    resolveTheme(getStoredPreference()),
  );

  // Apply the resolved theme whenever the preference changes.
  useEffect(() => {
    const theme = resolveTheme(preference);
    setResolved(theme);
    applyTheme(theme, document.documentElement);
  }, [preference]);

  // While following the system, react live to OS scheme changes.
  useEffect(() => {
    if (preference !== "system") return;
    if (typeof window === "undefined" || !window.matchMedia) return;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const theme = resolveTheme("system");
      setResolved(theme);
      applyTheme(theme, document.documentElement);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    setStoredPreference(next);
    setPreferenceState(next);
  }, []);

  const cyclePreference = useCallback(() => {
    setPreferenceState((current) => {
      const next = nextPreference(current);
      setStoredPreference(next);
      return next;
    });
  }, []);

  return { preference, resolved, setPreference, cyclePreference };
}
