import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m8-lookthrough");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

test.describe("cross-entity look-through", () => {
  test("navigates from the dashboard to look-through and back", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();

    await page.getByTestId("nav-lookthrough").click();
    await expect(page).toHaveURL(/#\/lookthrough$/);
    await expect(
      page.getByRole("heading", { name: "Cross-entity look-through" }),
    ).toBeVisible();
    await expect(page.getByTestId("lookthrough-view")).toBeVisible();

    await page.getByTestId("lookthrough-back").click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
  });

  test.describe("on the look-through route", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/#/lookthrough");
      await expect(page.getByTestId("lookthrough-view")).toBeVisible();
    });

    test("draws the donut, bar chart and breakdown table", async ({ page }) => {
      await expect(page.getByTestId("donut-chart")).toBeVisible();
      await expect(page.getByTestId("bar-chart")).toBeVisible();
      // 6 non-zero asset classes in the fixture.
      await expect(page.getByTestId("donut-segment")).toHaveCount(6);
      await expect(page.getByTestId("lt-table-row")).toHaveCount(6);
      await expect(page.getByTestId("lt-table-total")).toContainText("$31.79M");
    });

    test("defaults the drill-down to the top exposure (real estate)", async ({
      page,
    }) => {
      const contrib = page.getByTestId("lt-contrib");
      await expect(contrib.getByTestId("lt-contrib-name")).toHaveText(
        "Real estate",
      );
      await expect(page.getByTestId("lt-contrib-row")).toHaveCount(3);
    });

    test("clicking the equity row drills into its single owner", async ({
      page,
    }) => {
      await page.locator('[data-asset-class="equity"]').click();
      const contrib = page.getByTestId("lt-contrib");
      await expect(contrib.getByTestId("lt-contrib-name")).toHaveText(
        "Public equity",
      );
      const row = page.getByTestId("lt-contrib-row");
      await expect(row).toHaveCount(1);
      await expect(row).toContainText("Meridian Operating Co");
      await expect(row).toContainText("100%");
    });

    test("re-consolidates when the reporting root changes", async ({ page }) => {
      await page.getByTestId("lt-root-select").selectOption("harbor");
      await expect(page.getByTestId("lt-table-row")).toHaveCount(1);
      await expect(page.getByTestId("lt-table-total")).toContainText("$14.8M");
      await expect(
        page.locator('[data-asset-class="real_estate"]'),
      ).toBeVisible();
    });

    test("captures desktop evidence (1280x800)", async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await expect(page.getByTestId("donut-chart")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "lookthrough-desktop.png"),
        fullPage: true,
      });
    });

    test("captures desktop evidence with an asset class selected", async ({
      page,
    }) => {
      await page.setViewportSize(DESKTOP);
      await page.locator('[data-asset-class="private_equity"]').click();
      await expect(
        page.getByTestId("lt-contrib").getByTestId("lt-contrib-name"),
      ).toHaveText("Private equity");
      await page.screenshot({
        path: join(EVIDENCE_DIR, "lookthrough-desktop-selected.png"),
        fullPage: true,
      });
    });

    test("captures mobile evidence (390x844)", async ({ page }) => {
      await page.setViewportSize(MOBILE);
      await expect(page.getByTestId("donut-chart")).toBeVisible();
      await expect(page.getByTestId("lt-table")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "lookthrough-mobile.png"),
        fullPage: true,
      });
    });
  });
});
