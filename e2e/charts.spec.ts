import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m0-charts");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

/**
 * Per-platform screenshot baselines (e.g. `*-chromium-darwin.png`) differ
 * between macOS dev machines and the Linux CI runner due to font/AA rendering.
 * To keep the visual check meaningful locally without flaking CI on a missing
 * baseline, we only hard-assert the screenshot when a baseline for the current
 * platform already exists; the first run on a new platform writes it.
 */
function platformBaselineExists(name: string): boolean {
  const file = join(
    here,
    "charts.spec.ts-snapshots",
    `${name}-chromium-${process.platform === "darwin" ? "darwin" : "linux"}.png`,
  );
  return existsSync(file);
}

test.describe("charts gallery", () => {
  test("navigates from the dashboard to the charts gallery", async ({
    page,
  }) => {
    await page.goto("/");
    // Dashboard renders first.
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();

    // Exercise navigation: click the Charts nav link.
    await page.getByTestId("nav-charts").click();
    await expect(page).toHaveURL(/#\/charts$/);
    await expect(
      page.getByRole("heading", { name: "Charting kit" }),
    ).toBeVisible();
    await expect(page.getByTestId("charts-gallery")).toBeVisible();

    // Navigate back to the dashboard.
    await page.getByTestId("charts-back").click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
  });

  test.describe("on the charts route", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/#/charts");
      await expect(page.getByTestId("charts-gallery")).toBeVisible();
    });

    test("renders every chart type", async ({ page }) => {
      await expect(page.getByTestId("sparkline")).toBeVisible();
      await expect(page.getByTestId("line-chart")).toBeVisible();
      await expect(page.getByTestId("area-chart")).toBeVisible();
      // Two bar charts (allocation + signed P/L).
      await expect(page.getByTestId("bar-chart")).toHaveCount(2);
      await expect(page.getByTestId("donut-chart")).toBeVisible();
      await expect(page.getByTestId("treemap")).toBeVisible();
      await expect(page.getByTestId("candlestick-chart")).toBeVisible();
    });

    test("draws the expected number of marks", async ({ page }) => {
      await expect(page.getByTestId("line-series")).toHaveCount(2);
      await expect(page.getByTestId("donut-segment")).toHaveCount(4);
      await expect(page.getByTestId("treemap-tile")).toHaveCount(6);
      await expect(page.getByTestId("candle")).toHaveCount(5);
    });

    test("captures desktop evidence (1280x800)", async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await expect(page.getByTestId("candlestick-chart")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "charts-desktop.png"),
        fullPage: true,
      });
    });

    test("captures mobile evidence (390x844)", async ({ page }) => {
      await page.setViewportSize(MOBILE);
      // Charts remain visible and laid out on a narrow viewport.
      await expect(page.getByTestId("sparkline")).toBeVisible();
      await expect(page.getByTestId("candlestick-chart")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "charts-mobile.png"),
        fullPage: true,
      });
    });

    test("visual snapshot of the gallery is stable", async ({ page }) => {
      test.skip(
        !platformBaselineExists("charts-gallery"),
        "No screenshot baseline for this platform yet; run with --update-snapshots to create one.",
      );
      const gallery = page.getByTestId("charts-gallery");
      await expect(gallery).toHaveScreenshot("charts-gallery.png", {
        maxDiffPixelRatio: 0.02,
      });
    });
  });
});
