import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m7-alerts");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

test.describe("limit alerts", () => {
  test("navigates from the dashboard to the alerts page and back", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();

    await page.getByTestId("nav-alerts").click();
    await expect(page).toHaveURL(/#\/alerts$/);
    await expect(
      page.getByRole("heading", { name: "Limit alerts" }),
    ).toBeVisible();
    await expect(page.getByTestId("alerts-page")).toBeVisible();

    await page.getByTestId("alerts-back").click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
  });

  test.describe("on the alerts route", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/#/alerts");
      await expect(page.getByTestId("alerts-page")).toBeVisible();
    });

    test("summarises breaches and shows the breach list by default", async ({
      page,
    }) => {
      await expect(page.getByTestId("summary-critical-value")).toHaveText("1");
      await expect(page.getByTestId("summary-warning-value")).toHaveText("2");

      // Default filter is "breaches": 3 rows, critical first.
      await expect(page.getByTestId("filter-breaches")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect(page.getByTestId("alert-row")).toHaveCount(3);

      const first = page.getByTestId("alert-row").first();
      await expect(first).toHaveAttribute("data-severity", "critical");
      await expect(first.getByTestId("alert-subject")).toHaveText("USD Cash");
      await expect(first.getByTestId("alert-weight")).toHaveText("86.8%");
      await expect(first.getByTestId("alert-detail")).toContainText("192,416");
    });

    test("toggles to show every rule including satisfied ones", async ({
      page,
    }) => {
      await page.getByTestId("filter-all").click();
      await expect(page.getByTestId("filter-all")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      // 4 single-scope rules + 3 positions = 7 evaluations.
      await expect(page.getByTestId("alert-row")).toHaveCount(7);
      // A satisfied row (crypto ceiling) is now present.
      await expect(
        page.getByTestId("alert-row").filter({ hasText: "Crypto exposure" }),
      ).toHaveCount(1);

      // Back to breaches only.
      await page.getByTestId("filter-breaches").click();
      await expect(page.getByTestId("alert-row")).toHaveCount(3);
    });

    test("captures desktop evidence (1280x800)", async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await expect(page.getByTestId("alerts-list")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "alerts-desktop.png"),
        fullPage: true,
      });

      // Also capture the "all rules" view at desktop.
      await page.getByTestId("filter-all").click();
      await expect(page.getByTestId("alert-row")).toHaveCount(7);
      await page.screenshot({
        path: join(EVIDENCE_DIR, "alerts-desktop-all.png"),
        fullPage: true,
      });
    });

    test("captures mobile evidence (390x844)", async ({ page }) => {
      await page.setViewportSize(MOBILE);
      await expect(page.getByTestId("alerts-summary")).toBeVisible();
      await expect(page.getByTestId("alerts-list")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "alerts-mobile.png"),
        fullPage: true,
      });
    });
  });
});
