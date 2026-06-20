import { describe, expect, it } from "vitest";

import {
  applyTheme,
  getStoredPreference,
  getSystemTheme,
  nextPreference,
  PREFERENCE_CYCLE,
  setStoredPreference,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "./theme";

/** In-memory Storage stub for deterministic, offline tests. */
function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  } satisfies Pick<Storage, "getItem" | "setItem">;
}

describe("nextPreference — adversarial / edge cases", () => {
  it("restarts the cycle from the first entry for an unknown current value", () => {
    // An out-of-band value (e.g. corrupted state) must not throw or return
    // undefined; indexOf === -1 should land on the first cycle entry.
    expect(nextPreference("neon" as ThemePreference)).toBe(PREFERENCE_CYCLE[0]);
    expect(nextPreference("" as ThemePreference)).toBe("system");
    expect(
      nextPreference(undefined as unknown as ThemePreference),
    ).toBe("system");
  });

  it("returns a defined member of the cycle for every cycle input", () => {
    for (const p of PREFERENCE_CYCLE) {
      const next = nextPreference(p);
      expect(PREFERENCE_CYCLE).toContain(next);
    }
  });

  it("forms a closed 3-cycle (three steps returns to start)", () => {
    let p: ThemePreference = "system";
    p = nextPreference(p); // light
    p = nextPreference(p); // dark
    p = nextPreference(p); // system
    expect(p).toBe("system");
  });
});

describe("getSystemTheme — adversarial", () => {
  it("falls back to light when matchMedia throws", () => {
    const throwing = (() => {
      throw new Error("matchMedia unavailable");
    }) as unknown as typeof window.matchMedia;
    expect(getSystemTheme(throwing)).toBe("light");
  });
});

describe("full toggle round-trip through storage", () => {
  it("cycling + persisting + re-reading walks system→light→dark→system", () => {
    const s = memoryStorage();
    setStoredPreference("system", s);

    const seen: ThemePreference[] = [];
    for (let i = 0; i < 4; i++) {
      const current = getStoredPreference(s);
      seen.push(current);
      setStoredPreference(nextPreference(current), s);
    }
    expect(seen).toEqual(["system", "light", "dark", "system"]);
    // Storage holds the value reached after the final cycle step.
    expect(s.getItem(THEME_STORAGE_KEY)).toBe("light");
  });
});

describe("applyTheme — preserves unrelated root state", () => {
  it("toggling dark→light→dark does not disturb other classes", () => {
    const root = document.createElement("html");
    root.classList.add("hydrated", "no-js");

    applyTheme("dark", root);
    expect(root.classList.contains("dark")).toBe(true);
    applyTheme("light", root);
    expect(root.classList.contains("dark")).toBe(false);
    applyTheme("dark", root);
    expect(root.classList.contains("dark")).toBe(true);

    // Pre-existing, unrelated classes survive every toggle.
    expect(root.classList.contains("hydrated")).toBe(true);
    expect(root.classList.contains("no-js")).toBe(true);
    // No accidental duplication of the dark class.
    expect(
      root.className.split(/\s+/).filter((c) => c === "dark"),
    ).toHaveLength(1);
  });
});
