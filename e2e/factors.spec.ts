import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m11-factor-attribution");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

test.describe("factor & style attribution", () => {
  test("navigates from the dashboard to factors and back", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();

    await page.getByTestId("nav-factors").click();
    await expect(page).toHaveURL(/#\/factors$/);
    await expect(
      page.getByRole("heading", { name: "Factor & style attribution" }),
    ).toBeVisible();
    await expect(page.getByTestId("factors-page")).toBeVisible();

    await page.getByTestId("factors-back").click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
  });

  test.describe("on the factors route", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/#/factors");
      await expect(page.getByTestId("factors-page")).toBeVisible();
    });

    test("renders the KPIs, betas chart, contribution chart and table", async ({
      page,
    }) => {
      await expect(page.getByTestId("kpi-rsquared")).toBeVisible();
      await expect(page.getByTestId("kpi-alpha")).toBeVisible();
      await expect(page.getByTestId("kpi-factor-return")).toBeVisible();
      await expect(page.getByTestId("kpi-mean-return")).toBeVisible();

      // Betas chart: six factor rows.
      const betas = page.getByTestId("factor-betas-chart");
      await expect(betas).toBeVisible();
      await expect(betas).toHaveAttribute("data-factors", "6");
      await expect(page.getByTestId("beta-row")).toHaveCount(6);

      // Contribution chart: alpha + 6 factors + total.
      const contrib = page.getByTestId("contribution-chart");
      await expect(contrib).toBeVisible();
      await expect(page.getByTestId("contrib-factor")).toHaveCount(6);
      await expect(page.getByTestId("contrib-alpha")).toBeVisible();
      await expect(page.getByTestId("contrib-total")).toBeVisible();

      // Detail table.
      await expect(page.getByTestId("factors-table")).toBeVisible();
      await expect(page.getByTestId("factor-row")).toHaveCount(6);
      await expect(page.getByTestId("factors-total-value")).toBeVisible();
    });

    test("switches the regressed book to the clean synthetic (R²=100%)", async ({
      page,
    }) => {
      const synthetic = page.locator(
        '[data-testid="book-select"][data-book="synthetic"]',
      );
      await synthetic.click();
      await expect(synthetic).toHaveAttribute("data-selected", "true");
      await expect(page.getByTestId("kpi-rsquared")).toContainText("100.0%");

      const fo = page.locator(
        '[data-testid="book-select"][data-book="family-office"]',
      );
      await fo.click();
      await expect(fo).toHaveAttribute("data-selected", "true");
    });

    test("captures desktop evidence (1280x800)", async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await expect(page.getByTestId("factor-betas-chart")).toBeVisible();
      await expect(page.getByTestId("contribution-chart")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "factors-desktop.png"),
        fullPage: true,
      });

      // Also capture the clean synthetic book state.
      await page
        .locator('[data-testid="book-select"][data-book="synthetic"]')
        .click();
      await expect(
        page.locator('[data-testid="book-select"][data-book="synthetic"]'),
      ).toHaveAttribute("data-selected", "true");
      await page.screenshot({
        path: join(EVIDENCE_DIR, "factors-desktop-synthetic.png"),
        fullPage: true,
      });
    });

    test("captures mobile evidence (390x844)", async ({ page }) => {
      await page.setViewportSize(MOBILE);
      await expect(page.getByTestId("factor-betas-chart")).toBeVisible();
      await expect(page.getByTestId("contribution-chart")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "factors-mobile.png"),
        fullPage: true,
      });
    });
  });
});
