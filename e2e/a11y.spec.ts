import { existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m12-chart-a11y");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

// Make the evidence directory exist up-front so every screenshot test can run
// independently (any order, or in isolation) without a missing-directory error.
if (!existsSync(EVIDENCE_DIR)) mkdirSync(EVIDENCE_DIR, { recursive: true });

/**
 * Accessibility gate for the chart-a11y + route-announcer pass:
 *   - every page exposes a skip-to-content link as the first focusable element;
 *   - SPA navigation updates a polite aria-live route announcer;
 *   - charts have an associated accessible data table (toggle or visually-hidden);
 *   - key landmark roles/labels are present on a few representative pages.
 *
 * Plus desktop + mobile screenshot evidence and a saved Playwright trace.
 */
test.describe("accessibility", () => {
  test("skip-to-content link focuses the main region without changing route", async ({
    page,
  }) => {
    await page.goto("/#/charts");
    await expect(page.getByTestId("charts-gallery")).toBeVisible();

    // The skip link is the first thing reached by keyboard.
    await page.keyboard.press("Tab");
    const skip = page.getByTestId("skip-to-content");
    await expect(skip).toBeFocused();
    await expect(skip).toHaveText("Skip to content");
    await expect(skip).toBeVisible(); // revealed on focus

    // Activating it moves focus to <main id="main-content"> and leaves the URL.
    await skip.press("Enter");
    await expect(page).toHaveURL(/#\/charts$/);
    const focusedId = await page.evaluate(() => document.activeElement?.id);
    expect(focusedId).toBe("main-content");
  });

  test("route announcer is a polite live region that updates on navigation", async ({
    page,
  }) => {
    await page.goto("/");
    const announcer = page.getByTestId("route-announcer");
    await expect(announcer).toHaveAttribute("aria-live", "polite");
    await expect(announcer).toHaveAttribute("aria-atomic", "true");
    // First load: empty (the browser announces the initial page itself).
    await expect(announcer).toHaveText("");

    // Navigate via the dashboard nav (a real click) to the charts page.
    await page.getByTestId("nav-charts").click();
    await expect(page).toHaveURL(/#\/charts$/);
    await expect(announcer).toHaveText("Charts page");

    // The charts page has no global nav, so drive the next hop via the hash —
    // the announcer reacts to the route change all the same.
    await page.evaluate(() => {
      window.location.hash = "#/ops";
    });
    await expect(page).toHaveURL(/#\/ops$/);
    await expect(announcer).toHaveText("Ops cockpit page");
  });

  test("every chart on the gallery has an accessible figure + data table", async ({
    page,
  }) => {
    await page.goto("/#/charts");
    await expect(page.getByTestId("charts-gallery")).toBeVisible();

    const figureIds = [
      "fig-sparkline",
      "fig-line",
      "fig-area",
      "fig-bar",
      "fig-signed-bar",
      "fig-donut",
      "fig-treemap",
      "fig-candle",
    ];

    for (const id of figureIds) {
      const figure = page.getByTestId(id);
      await expect(figure).toBeVisible();
      // It is a <figure> landmark.
      await expect(figure).toHaveJSProperty("tagName", "FIGURE");
      // The data table exists in the DOM (hidden behind the toggle initially).
      await expect(page.getByTestId(`${id}-table`)).toHaveCount(1);
    }
  });

  test("the data-table toggle reveals a table mirroring the chart data", async ({
    page,
  }) => {
    await page.goto("/#/charts");
    await expect(page.getByTestId("charts-gallery")).toBeVisible();

    const toggle = page.getByTestId("fig-donut-table-toggle");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toHaveText("Show data table");

    const table = page.getByTestId("fig-donut-table");
    await expect(table).toBeHidden();

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(toggle).toHaveText("Hide data table");
    await expect(table).toBeVisible();

    // Table reflects the donut data: region rows with shares.
    await expect(table.getByRole("rowheader", { name: "US" })).toBeVisible();
    await expect(table.getByRole("cell", { name: "55" })).toBeVisible();
    await expect(table.getByRole("columnheader")).toHaveCount(2);

    await toggle.click();
    await expect(table).toBeHidden();
  });

  test("the dashboard exposes landmarks, a single h1 and net-worth chart tables", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { level: 1, name: "Family Office OS" }),
    ).toBeVisible();
    // Exactly one main landmark, reachable by the skip link.
    await expect(page.locator("main#main-content")).toHaveCount(1);
    await expect(page.getByRole("navigation")).toBeVisible();

    // Area chart: toggleable data table.
    await expect(
      page.getByTestId("networth-area-figure-table-toggle"),
    ).toBeVisible();
    // Donut chart: always-present visually-hidden table for screen readers.
    await expect(page.getByTestId("networth-donut-figure-table")).toHaveCount(1);
  });

  test("key pages expose a main landmark and exactly one h1", async ({
    page,
  }) => {
    for (const path of ["/", "/charts", "/ops", "/home"]) {
      await page.goto(`/#${path}`);
      await expect(page.locator("main#main-content")).toHaveCount(1);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    }
  });

  test("captures mobile evidence (390x844)", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/#/charts");
    await expect(page.getByTestId("charts-gallery")).toBeVisible();
    await page.getByTestId("fig-donut-table-toggle").click();
    await expect(page.getByTestId("fig-donut-table")).toBeVisible();
    await page.screenshot({
      path: join(EVIDENCE_DIR, "charts-a11y-mobile.png"),
      fullPage: true,
    });
  });

  test("captures the dashboard with the focused skip link (desktop)", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("skip-to-content")).toBeFocused();
    await page.screenshot({
      path: join(EVIDENCE_DIR, "skip-link-desktop.png"),
    });
  });

  test("captures desktop evidence (1280x800) with the data table open", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/#/charts");
    await expect(page.getByTestId("charts-gallery")).toBeVisible();
    // Open one data table so the evidence shows the accessible table rendered.
    await page.getByTestId("fig-bar-table-toggle").click();
    await expect(page.getByTestId("fig-bar-table")).toBeVisible();
    await page.screenshot({
      path: join(EVIDENCE_DIR, "charts-a11y-desktop.png"),
      fullPage: true,
    });
  });
});
