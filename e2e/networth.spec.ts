import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m0-networth");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

test.describe("net-worth dashboard", () => {
  test("is the main view at the root route", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
    await expect(page.getByTestId("networth-dashboard")).toBeVisible();
    await expect(page.getByTestId("networth-chart-title")).toHaveText(
      "Total net worth",
    );
    // The net-worth-over-time area chart is drawn.
    await expect(page.getByTestId("networth-area")).toBeVisible();
    // The allocation donut renders a segment per asset class (13).
    await expect(page.getByTestId("donut-segment")).toHaveCount(13);
    // Every asset class is listed for drill-down.
    await expect(page.getByTestId("asset-class-row")).toHaveCount(13);
  });

  test("drills down into an asset class and back", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("networth-dashboard")).toBeVisible();

    // Locate the crypto row by its data attribute on the button itself.
    const cryptoRow = page.locator(
      '[data-testid="asset-class-row"][data-asset-class="crypto"]',
    );
    await expect(cryptoRow).toBeVisible();
    await cryptoRow.click();

    await expect(page.getByTestId("networth-chart-title")).toHaveText("Crypto");
    await expect(cryptoRow).toHaveAttribute("data-selected", "true");
    await expect(page.getByTestId("networth-clear-selection")).toBeVisible();

    // Back to the consolidated view.
    await page.getByTestId("networth-clear-selection").click();
    await expect(page.getByTestId("networth-chart-title")).toHaveText(
      "Total net worth",
    );
  });

  test("navigates to charts and ops and back", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("nav-charts").click();
    await expect(page).toHaveURL(/#\/charts$/);
    await expect(
      page.getByRole("heading", { name: "Charting kit" }),
    ).toBeVisible();
    await page.getByTestId("charts-back").click();
    await expect(page.getByTestId("networth-dashboard")).toBeVisible();

    await page.getByTestId("nav-ops").click();
    await expect(page).toHaveURL(/#\/ops$/);
    await expect(
      page.getByRole("heading", { name: "Ops cockpit" }),
    ).toBeVisible();
  });

  test("captures desktop evidence (1280x800)", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/");
    await expect(page.getByTestId("networth-area")).toBeVisible();
    await expect(page.getByTestId("networth-donut")).toBeVisible();
    await page.screenshot({
      path: join(EVIDENCE_DIR, "networth-desktop.png"),
      fullPage: true,
    });

    // Also capture a drilled-down state for evidence.
    await page
      .locator('[data-testid="asset-class-row"][data-asset-class="crypto"]')
      .click();
    await expect(page.getByTestId("networth-chart-title")).toHaveText("Crypto");
    await page.screenshot({
      path: join(EVIDENCE_DIR, "networth-desktop-drilldown.png"),
      fullPage: true,
    });
  });

  test("captures mobile evidence (390x844)", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/");
    await expect(page.getByTestId("networth-area")).toBeVisible();
    await expect(page.getByTestId("asset-class-row").first()).toBeVisible();
    await page.screenshot({
      path: join(EVIDENCE_DIR, "networth-mobile.png"),
      fullPage: true,
    });
  });
});
