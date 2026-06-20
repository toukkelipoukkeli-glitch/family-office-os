import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdir } from "node:fs/promises";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m12-theme-print");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

const STORAGE_KEY = "foos-theme";

/**
 * Unit m12-theme-print: dark/light theme toggle (persisted, defaulting to
 * system) + a print stylesheet.
 *
 * The toggle cycles system → light → dark and persists the choice in
 * localStorage; dark mode is the `dark` class on <html> driving Tailwind's
 * `dark:` variant. These tests prove the toggle works, the preference survives a
 * reload, and capture desktop + mobile evidence in both themes.
 */
test.describe("theme toggle + print", () => {
  /**
   * Land on the app with a clean, deterministic preference (system default).
   * We clear storage and reload *once* so the page boots from an empty store —
   * unlike an init script, this does not fire on later reloads, so the
   * persistence test can prove a stored choice survives `page.reload()`.
   */
  async function gotoClean(page: import("@playwright/test").Page, url = "/") {
    await page.goto(url);
    await page.evaluate((key) => {
      window.localStorage.removeItem(key);
    }, STORAGE_KEY);
    await page.reload();
  }

  test("defaults to system and toggles to an explicit dark theme", async ({
    page,
  }) => {
    await gotoClean(page);
    const toggle = page.getByTestId("theme-toggle");
    await expect(toggle).toBeVisible();
    // Fresh visitor: preference is system.
    await expect(toggle).toHaveAttribute("data-theme-preference", "system");

    const html = page.locator("html");
    // system → light: explicit light, no dark class.
    await toggle.click();
    await expect(toggle).toHaveAttribute("data-theme-preference", "light");
    await expect(html).not.toHaveClass(/(^|\s)dark(\s|$)/);

    // light → dark: dark class applied.
    await toggle.click();
    await expect(toggle).toHaveAttribute("data-theme-preference", "dark");
    await expect(html).toHaveClass(/(^|\s)dark(\s|$)/);

    // The stored preference reflects the explicit dark choice.
    const stored = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      STORAGE_KEY,
    );
    expect(stored).toBe("dark");
  });

  test("persists the dark preference across a reload", async ({ page }) => {
    await gotoClean(page);
    const toggle = page.getByTestId("theme-toggle");

    // Cycle system → light → dark.
    await toggle.click();
    await toggle.click();
    await expect(toggle).toHaveAttribute("data-theme-preference", "dark");
    await expect(page.locator("html")).toHaveClass(/(^|\s)dark(\s|$)/);

    // Reload: the dark theme must still be applied before/at first paint.
    await page.reload();
    await expect(page.getByTestId("theme-toggle")).toHaveAttribute(
      "data-theme-preference",
      "dark",
    );
    await expect(page.locator("html")).toHaveClass(/(^|\s)dark(\s|$)/);
  });

  test("the toggle is present on an AppShell page and works there too", async ({
    page,
  }) => {
    await gotoClean(page, "/#/fees");
    const toggle = page.getByTestId("theme-toggle");
    await expect(toggle).toBeVisible();
    await toggle.click(); // system → light
    await toggle.click(); // light → dark
    await expect(page.locator("html")).toHaveClass(/(^|\s)dark(\s|$)/);

    // Navigating to another page keeps the explicit dark choice.
    await page.goto("/#/reports");
    await expect(page.locator("html")).toHaveClass(/(^|\s)dark(\s|$)/);
    await expect(page.getByTestId("theme-toggle")).toHaveAttribute(
      "data-theme-preference",
      "dark",
    );
  });

  test("print emulation hides chrome and forces a light page", async ({
    page,
  }) => {
    await gotoClean(page, "/#/reports");
    await page.emulateMedia({ media: "print" });

    // The theme toggle (print:hidden) and back link are removed in print.
    await expect(page.getByTestId("theme-toggle")).toBeHidden();
    await expect(page.getByTestId("reports-back")).toBeHidden();

    // The body prints on white regardless of the active theme.
    const bg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(bg).toBe("rgb(255, 255, 255)");

    await page.emulateMedia({ media: "screen" });
  });

  test("captures desktop evidence (1280x800) in light + dark", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await mkdir(EVIDENCE_DIR, { recursive: true });

    await gotoClean(page);
    const toggle = page.getByTestId("theme-toggle");
    await expect(toggle).toBeVisible();

    // Explicit light.
    await toggle.click();
    await expect(toggle).toHaveAttribute("data-theme-preference", "light");
    await page.waitForTimeout(200);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "dashboard-light-desktop.png"),
      fullPage: true,
    });

    // Explicit dark.
    await toggle.click();
    await expect(page.locator("html")).toHaveClass(/(^|\s)dark(\s|$)/);
    await page.waitForTimeout(200);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "dashboard-dark-desktop.png"),
      fullPage: true,
    });

    // An AppShell page in dark mode (Reports has header actions + aside).
    await page.goto("/#/reports");
    await expect(page.getByTestId("reports-page")).toBeVisible();
    await expect(page.locator("html")).toHaveClass(/(^|\s)dark(\s|$)/);
    await page.waitForTimeout(200);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "reports-dark-desktop.png"),
      fullPage: true,
    });

    // The same Reports page rendered for print (light, chrome stripped).
    await page.emulateMedia({ media: "print" });
    await page.waitForTimeout(200);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "reports-print-desktop.png"),
      fullPage: true,
    });
    await page.emulateMedia({ media: "screen" });
  });

  test("captures mobile evidence (390x844) in light + dark", async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE);
    await mkdir(EVIDENCE_DIR, { recursive: true });

    await gotoClean(page);
    const toggle = page.getByTestId("theme-toggle");
    await expect(toggle).toBeVisible();

    await toggle.click(); // system → light
    await page.waitForTimeout(200);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "dashboard-light-mobile.png"),
      fullPage: true,
    });

    await toggle.click(); // light → dark
    await expect(page.locator("html")).toHaveClass(/(^|\s)dark(\s|$)/);
    await page.waitForTimeout(200);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "dashboard-dark-mobile.png"),
      fullPage: true,
    });

    await page.goto("/#/reports");
    await expect(page.getByTestId("reports-page")).toBeVisible();
    await page.waitForTimeout(200);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "reports-dark-mobile.png"),
      fullPage: true,
    });
  });
});
