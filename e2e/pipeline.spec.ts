import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m6-pipeline");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

function platformBaselineExists(name: string): boolean {
  const file = join(
    here,
    "pipeline.spec.ts-snapshots",
    `${name}-chromium-${process.platform === "darwin" ? "darwin" : "linux"}.png`,
  );
  return existsSync(file);
}

test.describe("deal pipeline board", () => {
  test("navigates from the dashboard to the pipeline and back", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();

    await page.getByTestId("nav-pipeline").click();
    await expect(page).toHaveURL(/#\/pipeline$/);
    await expect(
      page.getByRole("heading", { name: /deal pipeline/i }),
    ).toBeVisible();

    await page.getByRole("link", { name: /back to dashboard/i }).click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
  });

  test.describe("on the pipeline route", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/#/pipeline");
      await expect(page.getByTestId("pipeline-board")).toBeVisible();
    });

    test("renders every stage column with counts and weighted totals", async ({
      page,
    }) => {
      await expect(page.getByTestId("stage-column")).toHaveCount(5);
      await expect(page.getByTestId("stage-count").first()).toBeVisible();
      await expect(page.getByTestId("stage-weighted").first()).toBeVisible();
    });

    test("shows the four summary stats", async ({ page }) => {
      await expect(page.getByTestId("stat-open-count")).toBeVisible();
      await expect(page.getByTestId("stat-open-total")).toBeVisible();
      await expect(page.getByTestId("stat-weighted-total")).toBeVisible();
      await expect(page.getByTestId("stat-win-rate")).toContainText("50%");
    });

    test("drills into a deal and back", async ({ page }) => {
      await page.getByTestId("deal-card").filter({ hasText: "Acorn" }).click();
      await expect(page).toHaveURL(/#\/pipeline\/deal-acorn$/);

      const detail = page.getByTestId("deal-detail");
      await expect(detail).toBeVisible();
      await expect(detail).toContainText("Project Acorn");
      // Contacts + interactions rendered in the drill-down.
      await expect(page.getByTestId("contact-row")).toHaveCount(2);
      await expect(page.getByTestId("interaction-row")).toHaveCount(2);

      await page.getByTestId("detail-back").click();
      await expect(page).toHaveURL(/#\/pipeline$/);
      await expect(page.getByTestId("pipeline-board")).toBeVisible();
    });

    test("captures desktop evidence (1280x800)", async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await expect(page.getByTestId("pipeline-board")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "pipeline-board-desktop.png"),
        fullPage: true,
      });

      // Drill-down evidence too.
      await page.getByTestId("deal-card").filter({ hasText: "Acorn" }).click();
      await expect(page.getByTestId("deal-detail")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "deal-detail-desktop.png"),
        fullPage: true,
      });
    });

    test("captures mobile evidence (390x844)", async ({ page }) => {
      await page.setViewportSize(MOBILE);
      await expect(page.getByTestId("pipeline-board")).toBeVisible();
      await expect(page.getByTestId("stat-win-rate")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "pipeline-board-mobile.png"),
        fullPage: true,
      });

      await page.getByTestId("deal-card").filter({ hasText: "Acorn" }).click();
      await expect(page.getByTestId("deal-detail")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "deal-detail-mobile.png"),
        fullPage: true,
      });
    });

    test("visual snapshot of the board is stable", async ({ page }) => {
      test.skip(
        !platformBaselineExists("pipeline-board"),
        "No screenshot baseline for this platform yet; run with --update-snapshots to create one.",
      );
      await page.evaluate(() => document.fonts.ready);
      await expect(page.getByTestId("pipeline-board")).toHaveScreenshot(
        "pipeline-board.png",
        { maxDiffPixelRatio: 0.02 },
      );
    });
  });
});
