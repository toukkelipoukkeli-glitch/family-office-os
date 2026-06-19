import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m5-captable");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

test.describe("cap table", () => {
  test("navigates from the dashboard to the cap table and back", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();

    await page.getByTestId("nav-captable").click();
    await expect(page).toHaveURL(/#\/captable$/);
    await expect(page.getByRole("heading", { name: "Cap table" })).toBeVisible();
    await expect(page.getByTestId("captable-page")).toBeVisible();

    await page.getByTestId("captable-back").click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
  });

  test.describe("on the cap table route", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/#/captable");
      await expect(page.getByTestId("captable-page")).toBeVisible();
    });

    test("renders the holder table and ownership donut", async ({ page }) => {
      await expect(page.getByTestId("captable-row")).toHaveCount(4);
      await expect(page.getByTestId("captable-total")).toHaveText("10,000,000");
      await expect(page.getByTestId("donut-chart")).toBeVisible();
      // common, option, preferred.
      await expect(page.getByTestId("donut-segment")).toHaveCount(3);
    });

    test("models the round and shows dilution", async ({ page }) => {
      // No round detail before clicking.
      await expect(page.getByTestId("round-detail")).toHaveCount(0);

      await page.getByTestId("toggle-round").click();
      await expect(page.getByTestId("round-detail")).toBeVisible();

      // Investor ownership is in the expected ballpark (~25%).
      await expect(page.getByTestId("metric-investor-percent")).toContainText(
        /2[45]/,
      );

      // Founders are diluted.
      const founderRow = page
        .getByTestId("dilution-row")
        .filter({ hasText: "Touko Ursin" });
      await expect(founderRow).toContainText("pp");

      // Toggling off hides the detail again.
      await page.getByTestId("toggle-round").click();
      await expect(page.getByTestId("round-detail")).toHaveCount(0);
    });

    test("captures desktop evidence (1280x800)", async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await page.getByTestId("toggle-round").click();
      await expect(page.getByTestId("round-detail")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "captable-desktop.png"),
        fullPage: true,
      });
    });

    test("captures mobile evidence (390x844)", async ({ page }) => {
      await page.setViewportSize(MOBILE);
      await expect(page.getByTestId("donut-chart")).toBeVisible();
      await page.getByTestId("toggle-round").click();
      await expect(page.getByTestId("round-detail")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "captable-mobile.png"),
        fullPage: true,
      });
    });
  });
});
