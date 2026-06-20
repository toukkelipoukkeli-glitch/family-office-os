import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m7-harvest");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

test.describe("tax-loss harvesting", () => {
  test("navigates from the dashboard to the harvest finder and back", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();

    await page.getByTestId("nav-harvest").click();
    await expect(page).toHaveURL(/#\/harvest$/);
    await expect(
      page.getByRole("heading", { name: "Tax-loss harvesting" }),
    ).toBeVisible();
    await expect(page.getByTestId("harvest-page")).toBeVisible();

    await page.getByTestId("harvest-back").click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
  });

  test.describe("on the harvest route", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/#/harvest");
      await expect(page.getByTestId("harvest-page")).toBeVisible();
    });

    test("surfaces underwater lots, worst loss first", async ({ page }) => {
      const rows = page.getByTestId("candidate-row");
      await expect(rows).toHaveCount(4);
      // First row is the largest loss (TSLA, $21,000).
      await expect(rows.first()).toContainText("TSLA");
      await expect(rows.first()).toContainText("$21,000.00");
      // The NVDA winner is never listed.
      await expect(
        page.getByTestId("candidate-row").filter({ hasText: "NVDA" }),
      ).toHaveCount(0);
    });

    test("flags wash-sale risk with the conflicting purchase", async ({
      page,
    }) => {
      const baba = page.locator(
        '[data-testid="candidate-row"][data-lot="baba-1"]',
      );
      await expect(baba).toHaveAttribute("data-washsale", "true");
      await expect(baba.getByTestId("status-pill")).toHaveText("Wash-sale risk");
      await expect(baba.getByTestId("conflict-list")).toContainText(
        "12 days before",
      );

      const tsla = page.locator(
        '[data-testid="candidate-row"][data-lot="tsla-1"]',
      );
      await expect(tsla).toHaveAttribute("data-washsale", "false");
      await expect(tsla.getByTestId("status-pill")).toHaveText("Clean");
    });

    test("shows summary metrics and total", async ({ page }) => {
      await expect(page.getByTestId("metric-candidates")).toContainText("4");
      await expect(page.getByTestId("metric-flagged")).toContainText("3");
      await expect(page.getByTestId("metric-clean")).toContainText("$21,000.00");
      await expect(page.getByTestId("total-loss")).toContainText("$35,060.00");
    });

    test("lets the user switch lot-selection methods", async ({ page }) => {
      await page.getByTestId("method-hifo").click();
      await expect(page.getByTestId("method-hifo")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect(page.getByTestId("candidate-row")).toHaveCount(4);
    });

    test("captures desktop evidence (1280x800)", async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await expect(page.getByTestId("candidates-table")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "harvest-desktop.png"),
        fullPage: true,
      });
    });

    test("captures mobile evidence (390x844)", async ({ page }) => {
      await page.setViewportSize(MOBILE);
      await expect(page.getByTestId("method-selector")).toBeVisible();
      await expect(page.getByTestId("candidates-table")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "harvest-mobile.png"),
        fullPage: true,
      });
    });
  });
});
