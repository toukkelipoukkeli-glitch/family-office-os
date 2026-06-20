import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m7-attribution");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

test.describe("performance attribution", () => {
  test("navigates from the dashboard to attribution and back", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();

    await page.getByTestId("nav-attribution").click();
    await expect(page).toHaveURL(/#\/attribution$/);
    await expect(
      page.getByRole("heading", { name: "Performance attribution" }),
    ).toBeVisible();
    await expect(page.getByTestId("attribution-page")).toBeVisible();

    await page.getByTestId("attribution-back").click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
  });

  test.describe("on the attribution route", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/#/attribution");
      await expect(page.getByTestId("attribution-page")).toBeVisible();
    });

    test("renders the KPIs, bridge, per-segment chart and table", async ({
      page,
    }) => {
      // KPIs
      await expect(page.getByTestId("kpi-portfolio")).toBeVisible();
      await expect(page.getByTestId("kpi-benchmark")).toBeVisible();
      await expect(page.getByTestId("kpi-active")).toBeVisible();
      await expect(page.getByTestId("kpi-active")).toContainText("+0.83%");

      // Active-return bridge with five columns.
      const bridge = page.getByTestId("attribution-bridge");
      await expect(bridge).toBeVisible();
      await expect(page.getByTestId("bridge-col-benchmark")).toBeVisible();
      await expect(page.getByTestId("bridge-col-portfolio")).toBeVisible();

      // Per-segment effects: 5 rows.
      const effects = page.getByTestId("segment-effects-chart");
      await expect(effects).toBeVisible();
      await expect(effects).toHaveAttribute("data-segments", "5");
      await expect(page.getByTestId("effect-row")).toHaveCount(5);

      // Detail table.
      await expect(page.getByTestId("attribution-table")).toBeVisible();
      await expect(page.getByTestId("table-row")).toHaveCount(5);
      await expect(page.getByTestId("table-active")).toContainText("+0.83%");
    });

    test("switches conventions via the method toggle", async ({ page }) => {
      const bhb = page.locator(
        '[data-testid="method-select"][data-method="BHB"]',
      );
      await bhb.click();
      await expect(bhb).toHaveAttribute("data-selected", "true");
      // Active return is convention-independent.
      await expect(page.getByTestId("kpi-active")).toContainText("+0.83%");
      await expect(page.getByTestId("table-active")).toContainText("+0.83%");

      const bf = page.locator(
        '[data-testid="method-select"][data-method="BF"]',
      );
      await bf.click();
      await expect(bf).toHaveAttribute("data-selected", "true");
    });

    test("captures desktop evidence (1280x800)", async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await expect(page.getByTestId("attribution-bridge")).toBeVisible();
      await expect(page.getByTestId("segment-effects-chart")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "attribution-desktop.png"),
        fullPage: true,
      });

      // Also capture the BHB convention state.
      await page
        .locator('[data-testid="method-select"][data-method="BHB"]')
        .click();
      await expect(
        page.locator('[data-testid="method-select"][data-method="BHB"]'),
      ).toHaveAttribute("data-selected", "true");
      await page.screenshot({
        path: join(EVIDENCE_DIR, "attribution-desktop-bhb.png"),
        fullPage: true,
      });
    });

    test("captures mobile evidence (390x844)", async ({ page }) => {
      await page.setViewportSize(MOBILE);
      await expect(page.getByTestId("attribution-bridge")).toBeVisible();
      await expect(page.getByTestId("segment-effects-chart")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "attribution-mobile.png"),
        fullPage: true,
      });
    });
  });
});
