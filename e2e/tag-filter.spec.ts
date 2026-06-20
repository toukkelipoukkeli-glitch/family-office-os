import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m12-tag-filter");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

// Each test gets a fresh browser context (Playwright default), so localStorage
// starts empty and the persisted filter selection cannot leak between tests.
// We deliberately do NOT clear storage on every navigation — that would defeat
// the persistence the filter is supposed to provide.

test.describe("global holding-tag filter", () => {
  test("narrows the dashboard when a tag is selected", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("networth-dashboard")).toBeVisible();

    // Whole book up front: all 13 asset classes are listed.
    await expect(page.getByTestId("asset-class-row")).toHaveCount(13);
    await expect(page.getByTestId("tag-filter-summary")).toHaveCount(0);

    // Open the filter and select the "collectible" tag.
    await page.getByTestId("tag-filter").click();
    await expect(page.getByTestId("tag-filter-popover")).toBeVisible();
    await page.locator('[data-tag="collectible"]').click();

    // The book narrows to the 5 collectible holdings, each a distinct asset
    // class (wine, art, lego, car, watch).
    await expect(page.getByTestId("asset-class-row")).toHaveCount(5);
    await expect(page.getByTestId("donut-segment")).toHaveCount(5);

    // The active-filter summary appears and names the tag.
    const summary = page.getByTestId("tag-filter-summary");
    await expect(summary).toBeVisible();
    await expect(summary).toContainText("5 holdings");
    await expect(
      page.getByTestId("tag-filter-summary-chip").filter({ hasText: "collectible" }),
    ).toBeVisible();

    // The trigger reflects the active selection.
    await expect(page.getByTestId("tag-filter-root")).toHaveAttribute(
      "data-filtering",
      "true",
    );
  });

  test("the filter persists across navigation and clears", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("tag-filter").click();
    await page.locator('[data-tag="core"]').click();

    // "core" is on the equity + the etf: 2 asset classes.
    await expect(page.getByTestId("asset-class-row")).toHaveCount(2);

    // Navigate to an AppShell page and back; the selection survives (shared
    // state) and the filter control is surfaced in the shared shell chrome too.
    await page.getByTestId("nav-home").click();
    await expect(page).toHaveURL(/#\/home$/);
    await expect(page.getByTestId("tag-filter")).toBeVisible();
    await expect(page.getByTestId("tag-filter-root")).toHaveAttribute(
      "data-filtering",
      "true",
    );

    await page.goto("/");
    await expect(page.getByTestId("asset-class-row")).toHaveCount(2);

    // Clear restores the whole book.
    await page.getByTestId("tag-filter").click();
    await page.getByTestId("tag-filter-clear").click();
    await expect(page.getByTestId("asset-class-row")).toHaveCount(13);
    await expect(page.getByTestId("tag-filter-summary")).toHaveCount(0);
  });

  test("captures desktop evidence (1280x800)", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/");
    await expect(page.getByTestId("networth-area")).toBeVisible();

    // Unfiltered.
    await page.screenshot({
      path: join(EVIDENCE_DIR, "tag-filter-desktop-unfiltered.png"),
      fullPage: true,
    });

    // Open the popover for evidence of the control.
    await page.getByTestId("tag-filter").click();
    await expect(page.getByTestId("tag-filter-popover")).toBeVisible();
    await page.screenshot({
      path: join(EVIDENCE_DIR, "tag-filter-desktop-popover.png"),
      fullPage: true,
    });

    // Filtered.
    await page.locator('[data-tag="collectible"]').click();
    await expect(page.getByTestId("asset-class-row")).toHaveCount(5);
    await expect(page.getByTestId("tag-filter-summary")).toBeVisible();
    await page.screenshot({
      path: join(EVIDENCE_DIR, "tag-filter-desktop-filtered.png"),
      fullPage: true,
    });
  });

  test("captures mobile evidence (390x844)", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/");
    await expect(page.getByTestId("networth-area")).toBeVisible();

    await page.getByTestId("tag-filter").click();
    await expect(page.getByTestId("tag-filter-popover")).toBeVisible();
    await page.screenshot({
      path: join(EVIDENCE_DIR, "tag-filter-mobile-popover.png"),
      fullPage: true,
    });

    await page.locator('[data-tag="collectible"]').click();
    await expect(page.getByTestId("asset-class-row")).toHaveCount(5);
    await expect(page.getByTestId("tag-filter-summary")).toBeVisible();
    await page.screenshot({
      path: join(EVIDENCE_DIR, "tag-filter-mobile-filtered.png"),
      fullPage: true,
    });
  });
});
