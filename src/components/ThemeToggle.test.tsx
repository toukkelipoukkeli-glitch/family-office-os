import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ThemeToggle } from "./ThemeToggle";
import { THEME_STORAGE_KEY } from "@/lib/theme/theme";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
});

afterEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
});

describe("ThemeToggle", () => {
  it("defaults to the system preference (no stored value)", () => {
    render(<ThemeToggle />);
    const btn = screen.getByTestId("theme-toggle");
    expect(btn).toHaveAttribute("data-theme-preference", "system");
    // jsdom has no matchMedia, so system resolves to light → no dark class.
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("starts from a stored preference", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    render(<ThemeToggle />);
    expect(screen.getByTestId("theme-toggle")).toHaveAttribute(
      "data-theme-preference",
      "dark",
    );
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("cycles system → light → dark, persisting and applying each", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    const btn = screen.getByTestId("theme-toggle");

    // system → light
    await user.click(btn);
    expect(btn).toHaveAttribute("data-theme-preference", "light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    // light → dark
    await user.click(btn);
    expect(btn).toHaveAttribute("data-theme-preference", "dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    // dark → system (wraps)
    await user.click(btn);
    expect(btn).toHaveAttribute("data-theme-preference", "system");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("system");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("exposes an accessible label describing the next switch", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    render(<ThemeToggle />);
    const btn = screen.getByTestId("theme-toggle");
    expect(btn.getAttribute("aria-label")).toMatch(/dark/i);
    expect(btn.getAttribute("aria-label")).toMatch(/system/i);
  });

  it("is hidden in print output", () => {
    render(<ThemeToggle />);
    expect(screen.getByTestId("theme-toggle").className).toContain(
      "print:hidden",
    );
  });
});
