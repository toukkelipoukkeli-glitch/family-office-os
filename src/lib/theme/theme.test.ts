import { describe, expect, it, vi } from "vitest";

import {
  applyTheme,
  DEFAULT_PREFERENCE,
  getStoredPreference,
  getSystemTheme,
  isThemePreference,
  nextPreference,
  resolveTheme,
  setStoredPreference,
  THEME_STORAGE_KEY,
} from "./theme";

/** An in-memory Storage stub for deterministic, offline tests. */
function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  } satisfies Pick<Storage, "getItem" | "setItem">;
}

/** A `matchMedia` stub whose dark match is fixed. */
function matchMediaStub(dark: boolean): typeof window.matchMedia {
  return ((query: string) =>
    ({ matches: dark, media: query }) as MediaQueryList) as typeof window.matchMedia;
}

describe("isThemePreference", () => {
  it("accepts the three valid values and rejects others", () => {
    expect(isThemePreference("light")).toBe(true);
    expect(isThemePreference("dark")).toBe(true);
    expect(isThemePreference("system")).toBe(true);
    expect(isThemePreference("blue")).toBe(false);
    expect(isThemePreference(null)).toBe(false);
    expect(isThemePreference(undefined)).toBe(false);
  });
});

describe("getStoredPreference", () => {
  it("returns the default when nothing is stored", () => {
    expect(getStoredPreference(memoryStorage())).toBe(DEFAULT_PREFERENCE);
    expect(DEFAULT_PREFERENCE).toBe("system");
  });

  it("returns a valid stored value", () => {
    const s = memoryStorage({ [THEME_STORAGE_KEY]: "dark" });
    expect(getStoredPreference(s)).toBe("dark");
  });

  it("falls back to the default for an invalid stored value", () => {
    const s = memoryStorage({ [THEME_STORAGE_KEY]: "neon" });
    expect(getStoredPreference(s)).toBe("system");
  });

  it("returns the default when storage is unavailable", () => {
    expect(getStoredPreference(undefined)).toBe("system");
  });

  it("returns the default when storage throws", () => {
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
    };
    expect(getStoredPreference(throwing)).toBe("system");
  });
});

describe("setStoredPreference", () => {
  it("persists the preference, including system", () => {
    const s = memoryStorage();
    setStoredPreference("dark", s);
    expect(s.getItem(THEME_STORAGE_KEY)).toBe("dark");
    setStoredPreference("system", s);
    expect(s.getItem(THEME_STORAGE_KEY)).toBe("system");
  });

  it("round-trips with getStoredPreference", () => {
    const s = memoryStorage();
    setStoredPreference("light", s);
    expect(getStoredPreference(s)).toBe("light");
  });

  it("no-ops without throwing when storage is unavailable", () => {
    expect(() => setStoredPreference("dark", undefined)).not.toThrow();
  });

  it("swallows storage write errors", () => {
    const throwing = {
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(() => setStoredPreference("dark", throwing)).not.toThrow();
  });
});

describe("getSystemTheme", () => {
  it("reads dark from matchMedia", () => {
    expect(getSystemTheme(matchMediaStub(true))).toBe("dark");
  });
  it("reads light from matchMedia", () => {
    expect(getSystemTheme(matchMediaStub(false))).toBe("light");
  });
  it("defaults to light without matchMedia", () => {
    expect(getSystemTheme(undefined)).toBe("light");
  });
});

describe("resolveTheme", () => {
  it("passes explicit preferences through", () => {
    expect(resolveTheme("light", matchMediaStub(true))).toBe("light");
    expect(resolveTheme("dark", matchMediaStub(false))).toBe("dark");
  });
  it("resolves system via matchMedia", () => {
    expect(resolveTheme("system", matchMediaStub(true))).toBe("dark");
    expect(resolveTheme("system", matchMediaStub(false))).toBe("light");
  });
});

describe("applyTheme", () => {
  it("adds the dark class and sets color-scheme for dark", () => {
    const root = document.createElement("html");
    applyTheme("dark", root);
    expect(root.classList.contains("dark")).toBe(true);
    expect(root.style.colorScheme).toBe("dark");
  });

  it("removes the dark class for light", () => {
    const root = document.createElement("html");
    root.classList.add("dark");
    applyTheme("light", root);
    expect(root.classList.contains("dark")).toBe(false);
    expect(root.style.colorScheme).toBe("light");
  });

  it("is idempotent", () => {
    const root = document.createElement("html");
    applyTheme("dark", root);
    applyTheme("dark", root);
    expect(root.classList.contains("dark")).toBe(true);
    // Exactly one dark class, no duplication.
    expect(root.className.split(/\s+/).filter((c) => c === "dark")).toHaveLength(
      1,
    );
  });
});

describe("nextPreference", () => {
  it("cycles system → light → dark → system", () => {
    expect(nextPreference("system")).toBe("light");
    expect(nextPreference("light")).toBe("dark");
    expect(nextPreference("dark")).toBe("system");
  });
});

describe("persistence + resolution end to end", () => {
  it("a stored dark preference resolves to dark regardless of system", () => {
    const s = memoryStorage();
    setStoredPreference("dark", s);
    const pref = getStoredPreference(s);
    expect(resolveTheme(pref, matchMediaStub(false))).toBe("dark");
  });

  it("a stored system preference follows the OS", () => {
    const s = memoryStorage();
    setStoredPreference("system", s);
    const pref = getStoredPreference(s);
    expect(resolveTheme(pref, matchMediaStub(true))).toBe("dark");
    expect(resolveTheme(pref, matchMediaStub(false))).toBe("light");
  });

  it("uses the default-resolution path with a real spy", () => {
    const spy = vi.fn().mockReturnValue({ matches: true } as MediaQueryList);
    expect(resolveTheme("system", spy as unknown as typeof window.matchMedia)).toBe(
      "dark",
    );
    expect(spy).toHaveBeenCalledWith("(prefers-color-scheme: dark)");
  });
});
