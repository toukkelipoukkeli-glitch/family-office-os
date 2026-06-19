import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m5-company-profile");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

test.describe("company profiles", () => {
  test("navigates from the dashboard to company profiles and back", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();

    await page.getByTestId("nav-companies").click();
    await expect(page).toHaveURL(/#\/companies$/);
    await expect(
      page.getByRole("heading", { name: /company profiles/i }),
    ).toBeVisible();

    await page.getByRole("link", { name: /back to dashboard/i }).click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
  });

  test.describe("on the companies route", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/#/companies");
      await expect(page.getByTestId("company-header")).toBeVisible();
    });

    test("renders the three profile cards", async ({ page }) => {
      await expect(page.getByTestId("financials-card")).toBeVisible();
      await expect(page.getByTestId("holdings-card")).toBeVisible();
      await expect(page.getByTestId("people-card")).toBeVisible();
    });

    test("draws the financial KPIs and revenue chart", async ({ page }) => {
      await expect(page.getByTestId("financial-kpi")).toHaveCount(6);
      await expect(page.getByTestId("revenue-chart")).toBeVisible();
      // The bar chart drew one bar per fiscal year (3 for topco).
      await expect(
        page.getByTestId("revenue-chart").locator("[data-testid='bar']"),
      ).toHaveCount(3);
    });

    test("draws the holdings donut and list with a total", async ({ page }) => {
      await expect(page.getByTestId("holdings-card").getByTestId("donut-chart")).toBeVisible();
      await expect(page.getByTestId("holding-row")).toHaveCount(5);
      await expect(page.getByTestId("holdings-total")).toContainText("52,400,000");
    });

    test("lists key people", async ({ page }) => {
      await expect(page.getByTestId("person-row")).toHaveCount(2);
      await expect(page.getByText("Touko Ursin")).toBeVisible();
    });

    test("switches the company when another tab is clicked", async ({
      page,
    }) => {
      await page.getByTestId("company-tab").filter({ hasText: "Ursin Ventures Oy" }).click();
      await expect(page.getByTestId("company-header")).toHaveAttribute(
        "data-company-id",
        "co-ventures",
      );
      // Ventures has 3 holdings.
      await expect(page.getByTestId("holding-row")).toHaveCount(3);
    });

    test("captures desktop evidence (1280x800)", async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await expect(page.getByTestId("financials-card")).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: join(EVIDENCE_DIR, "company-profile-desktop.png"),
        fullPage: true,
      });
    });

    test("captures mobile evidence (390x844)", async ({ page }) => {
      await page.setViewportSize(MOBILE);
      await expect(page.getByTestId("holdings-card")).toBeVisible();
      await expect(page.getByTestId("people-card")).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: join(EVIDENCE_DIR, "company-profile-mobile.png"),
        fullPage: true,
      });
    });
  });
});
