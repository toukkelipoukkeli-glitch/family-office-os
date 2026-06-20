import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m11-concentration-risk");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

test.describe("concentration & single-name risk monitor", () => {
  test("navigates from the dashboard to the monitor and back", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();

    await page.getByTestId("nav-concentration").click();
    await expect(page).toHaveURL(/#\/concentration$/);
    await expect(
      page.getByRole("heading", { name: /concentration & single-name risk/i }),
    ).toBeVisible();
    await expect(page.getByTestId("concentration-view")).toBeVisible();

    await page.getByTestId("concentration-back").click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
  });

  test.describe("on the concentration route", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/#/concentration");
      await expect(page.getByTestId("concentration-view")).toBeVisible();
    });

    test("flags a single name over the concentration limit", async ({ page }) => {
      const banner = page.getByTestId("conc-status-banner");
      await expect(banner).toHaveAttribute("data-breached", "true");
      await expect(banner).toContainText(/concentration limit/i);

      // Apple's look-through row is breached.
      const aaplRow = page.locator(
        '[data-testid="conc-name-row"][data-issuer-id="issuer-aapl"]',
      );
      await expect(aaplRow).toHaveAttribute("data-breached", "true");
    });

    test("shows the top single name with look-through in the stats", async ({
      page,
    }) => {
      const top = page.getByTestId("conc-stat-topname");
      await expect(top).toContainText("16.8%");
      await expect(top).toContainText("Apple Inc.");
    });

    test("splits a name's bar into direct + fund segments", async ({ page }) => {
      const aaplRow = page.locator(
        '[data-testid="conc-name-row"][data-issuer-id="issuer-aapl"]',
      );
      await expect(
        aaplRow.getByTestId("conc-name-fill-direct"),
      ).toBeVisible();
      await expect(aaplRow.getByTestId("conc-name-fill-fund")).toBeVisible();
    });

    test("shows the illiquid percentage and sector donut", async ({ page }) => {
      await expect(page.getByTestId("conc-stat-illiquid")).toContainText("24.0%");
      await expect(page.getByTestId("donut-chart")).toBeVisible();
      await expect(page.getByTestId("conc-sector-row").first()).toBeVisible();
    });

    test("re-analyses when the book is switched", async ({ page }) => {
      await page
        .getByTestId("conc-book-select")
        .selectOption("diversified-book");
      const banner = page.getByTestId("conc-status-banner");
      await expect(banner).toHaveAttribute("data-breached", "false");
      await expect(page.getByTestId("conc-stat-topname")).toContainText("4.0%");
    });

    test("captures desktop evidence (1280x800)", async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await expect(page.getByTestId("conc-names-list")).toBeVisible();
      await expect(page.getByTestId("donut-chart")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "concentration-desktop.png"),
        fullPage: true,
      });
    });

    test("captures mobile evidence (390x844)", async ({ page }) => {
      await page.setViewportSize(MOBILE);
      await expect(page.getByTestId("conc-names-list")).toBeVisible();
      await expect(page.getByTestId("donut-chart")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "concentration-mobile.png"),
        fullPage: true,
      });
    });
  });
});
