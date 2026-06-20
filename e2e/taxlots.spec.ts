import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m7-tax-lots");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

test.describe("tax lots", () => {
  test("navigates from the dashboard to the tax lots page and back", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();

    await page.getByTestId("nav-taxlots").click();
    await expect(page).toHaveURL(/#\/taxlots$/);
    await expect(page.getByRole("heading", { name: "Tax lots" })).toBeVisible();
    await expect(page.getByTestId("taxlots-page")).toBeVisible();

    await page.getByTestId("taxlots-back").click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
  });

  test.describe("on the tax lots route", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/#/taxlots");
      await expect(page.getByTestId("taxlots-page")).toBeVisible();
    });

    test("renders open lots and realized metrics under FIFO", async ({ page }) => {
      await expect(page.getByTestId("method-fifo")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      // FIFO drains lot-a, leaving lot-b and lot-c open.
      await expect(page.getByTestId("lot-row")).toHaveCount(2);
      await expect(
        page.getByTestId("lot-row").filter({ hasText: "lot-b" }),
      ).toBeVisible();
      await expect(page.getByTestId("metric-realized")).toBeVisible();
      await expect(page.getByTestId("metric-unrealized")).toBeVisible();
    });

    test("switching to HIFO changes which lots stay open", async ({ page }) => {
      await page.getByTestId("method-hifo").click();
      await expect(page.getByTestId("method-hifo")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      // HIFO sells lot-c (180) + part of lot-b (160) -> lot-a remains open.
      await expect(
        page.getByTestId("lot-row").filter({ hasText: "lot-a" }),
      ).toBeVisible();
      await expect(page.getByTestId("method-blurb")).toContainText(
        /highest-cost/i,
      );
    });

    test("shows realized disposal detail with slices", async ({ page }) => {
      const disposal = page.getByTestId("disposal-row").first();
      await expect(disposal).toBeVisible();
      await expect(disposal).toContainText("Sold 120 AAPL");
      await expect(page.getByTestId("slice-row").first()).toBeVisible();
    });

    test("captures desktop evidence (1280x800)", async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await page.getByTestId("method-hifo").click();
      await expect(page.getByTestId("lots-table")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "taxlots-desktop.png"),
        fullPage: true,
      });
    });

    test("captures mobile evidence (390x844)", async ({ page }) => {
      await page.setViewportSize(MOBILE);
      await expect(page.getByTestId("method-selector")).toBeVisible();
      await page.getByTestId("method-lifo").click();
      await expect(page.getByTestId("lots-table")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "taxlots-mobile.png"),
        fullPage: true,
      });
    });
  });
});
