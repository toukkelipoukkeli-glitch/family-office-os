import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m10-insurance");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

test.describe("insurance coverage tracker", () => {
  test("navigates from the dashboard to the tracker and back", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();

    await page.getByTestId("nav-insurance").click();
    await expect(page).toHaveURL(/#\/insurance$/);
    await expect(
      page.getByRole("heading", { name: /insurance coverage tracker/i }),
    ).toBeVisible();
    await expect(page.getByTestId("insurance-page")).toBeVisible();

    await page.getByTestId("insurance-back").click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
  });

  test.describe("on the insurance route", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/#/insurance");
      await expect(page.getByTestId("insurance-page")).toBeVisible();
    });

    test("renders the KPIs, coverage bars, gap flags and policy schedule", async ({
      page,
    }) => {
      await expect(page.getByTestId("kpi-coverage")).toBeVisible();
      await expect(page.getByTestId("kpi-premium")).toBeVisible();
      await expect(page.getByTestId("kpi-tower")).toContainText("105%");
      await expect(page.getByTestId("kpi-gaps")).toBeVisible();

      // One coverage bar per category.
      await expect(page.getByTestId("coverage-bar")).toHaveCount(4);

      // Property is flagged critical.
      const critical = page
        .getByTestId("gap-list")
        .locator('[data-testid="gap-row"][data-severity="critical"]');
      await expect(critical.first()).toBeVisible();
      await expect(
        page.locator('[data-testid="gap-row"][data-scope="property"]').first(),
      ).toBeVisible();

      // The schedule lists all nine policies.
      await expect(page.getByTestId("policy-row")).toHaveCount(9);
      // The lapsed jewellery floater carries a status badge.
      await expect(
        page
          .locator('[data-policy="pc-jewellery-floater"]')
          .getByTestId("policy-status-badge"),
      ).toContainText(/lapsed/i);
    });

    test("orders the gap list worst-severity first", async ({ page }) => {
      const first = page.getByTestId("gap-list").getByTestId("gap-row").first();
      await expect(first).toHaveAttribute("data-severity", "critical");
    });

    test("captures desktop evidence (1280x800)", async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await expect(page.getByTestId("coverage-bars")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "insurance-desktop.png"),
        fullPage: true,
      });
    });

    test("captures mobile evidence (390x844)", async ({ page }) => {
      await page.setViewportSize(MOBILE);
      await expect(page.getByTestId("kpi-coverage")).toBeVisible();
      await expect(page.getByTestId("coverage-bars")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "insurance-mobile.png"),
        fullPage: true,
      });
    });
  });
});
