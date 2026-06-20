import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m9-pe-lifecycle");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

test.describe("private markets lifecycle", () => {
  test("navigates from the dashboard to the private markets page and back", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();

    await page.getByTestId("nav-privatemarkets").click();
    await expect(page).toHaveURL(/#\/privatemarkets$/);
    await expect(
      page.getByRole("heading", { name: "Private markets" }),
    ).toBeVisible();
    await expect(page.getByTestId("pe-page")).toBeVisible();

    await page.getByTestId("pe-back").click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
  });

  test.describe("on the private markets route", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/#/privatemarkets");
      await expect(page.getByTestId("pe-page")).toBeVisible();
    });

    test("renders multiples, unfunded, and the J-curve for the buyout fund", async ({
      page,
    }) => {
      await expect(page.getByTestId("fund-buyout")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect(page.getByTestId("metric-tvpi")).toContainText("1.75x");
      await expect(page.getByTestId("metric-dpi")).toContainText("1.12x");
      await expect(page.getByTestId("metric-rvpi")).toContainText("0.62x");
      await expect(page.getByTestId("unfunded-amount")).toContainText(
        "$2,000,000",
      );
      await expect(page.getByTestId("jcurve-chart")).toBeVisible();
      await expect(page.getByTestId("jcurve-point")).toHaveCount(5);
      await expect(page.getByTestId("ledger-row")).toHaveCount(5);
    });

    test("switching funds updates the metrics", async ({ page }) => {
      await page.getByTestId("fund-venture").click();
      await expect(page.getByTestId("fund-venture")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect(page.getByTestId("pe-fund-name")).toContainText(
        "Northstar Ventures II",
      );
      await expect(page.getByTestId("metric-rvpi")).toContainText("0.00x");
      await expect(page.getByTestId("metric-tvpi")).toContainText("2.50x");
      await expect(page.getByTestId("ledger-row")).toHaveCount(3);
    });

    test("captures desktop evidence (1280x800)", async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await expect(page.getByTestId("jcurve-chart")).toBeVisible();
      await expect(page.getByTestId("ledger-table")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "privatemarkets-desktop.png"),
        fullPage: true,
      });
    });

    test("captures mobile evidence (390x844)", async ({ page }) => {
      await page.setViewportSize(MOBILE);
      await expect(page.getByTestId("fund-selector")).toBeVisible();
      await page.getByTestId("fund-venture").click();
      await expect(page.getByTestId("jcurve-chart")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "privatemarkets-mobile.png"),
        fullPage: true,
      });
    });
  });
});
