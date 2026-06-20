import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m10-currency");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

test.describe("currency exposure & hedging page", () => {
  test("navigates from the dashboard to the page and back", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();

    await page.getByTestId("nav-currency").click();
    await expect(page).toHaveURL(/#\/currency$/);
    await expect(
      page.getByRole("heading", { name: /currency exposure & hedging/i }),
    ).toBeVisible();
    await expect(page.getByTestId("currency-page")).toBeVisible();

    await page.getByTestId("currency-back").click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
  });

  test.describe("on the currency route", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/#/currency");
      await expect(page.getByTestId("currency-page")).toBeVisible();
    });

    test("renders the KPIs, donut, bar chart and hedge table", async ({
      page,
    }) => {
      for (const id of [
        "kpi-total",
        "kpi-foreign",
        "kpi-residual",
        "kpi-hedged",
        "kpi-cost",
      ]) {
        await expect(page.getByTestId(id)).toBeVisible();
      }

      // Exposure donut + legend (6 currency buckets).
      await expect(page.getByTestId("donut-chart")).toBeVisible();
      await expect(page.getByTestId("currency-legend-item")).toHaveCount(6);

      // Residual-exposure bar chart.
      await expect(page.getByTestId("bar-chart")).toBeVisible();

      // Hedge table: 5 foreign currencies, USD first.
      await expect(page.getByTestId("currency-hedge-row")).toHaveCount(5);
      await expect(
        page.getByTestId("currency-hedge-row").first(),
      ).toHaveAttribute("data-currency", "USD");
      await expect(page.getByTestId("currency-hedge-total")).toBeVisible();
    });

    test("hedge-ratio slider recomputes the residual and hedge ratio", async ({
      page,
    }) => {
      await expect(page.getByTestId("hedge-ratio-value")).toHaveText("50%");
      const slider = page.getByTestId("hedge-ratio-slider");

      // Crank to 100%: fully hedged, residual share 0%.
      await slider.focus();
      await slider.fill("100");
      await expect(page.getByTestId("hedge-ratio-value")).toHaveText("100%");
      await expect(page.getByTestId("kpi-hedged")).toContainText("100.0%");
      await expect(page.getByTestId("kpi-residual")).toContainText("0.0%");

      // Back to 0%: nothing hedged.
      await slider.fill("0");
      await expect(page.getByTestId("hedge-ratio-value")).toHaveText("0%");
      await expect(page.getByTestId("kpi-hedged")).toContainText("0.0%");
    });
  });

  test("captures desktop evidence (1280x800)", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/");
    await page.getByTestId("nav-currency").click();
    await expect(page.getByTestId("currency-page")).toBeVisible();
    await expect(page.getByTestId("donut-chart")).toBeVisible();
    await expect(page.getByTestId("bar-chart")).toBeVisible();
    await expect(page.getByTestId("currency-hedge-table")).toBeVisible();
    await page.waitForTimeout(150);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "currency-desktop.png"),
      fullPage: true,
    });
  });

  test("captures mobile evidence (390x844)", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/#/currency");
    await expect(page.getByTestId("currency-page")).toBeVisible();
    await expect(page.getByTestId("donut-chart")).toBeVisible();
    await expect(page.getByTestId("bar-chart")).toBeVisible();
    await page.waitForTimeout(150);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "currency-mobile.png"),
      fullPage: true,
    });
  });

  // The config records a Playwright trace for every test (`trace: "on"`); this
  // walkthrough's trace is the committed evidence for the visual QA gate.
  test("walks through nav + slider interaction (traced)", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/");
    await page.getByTestId("nav-currency").click();
    await expect(page.getByTestId("currency-page")).toBeVisible();
    const slider = page.getByTestId("hedge-ratio-slider");
    await slider.focus();
    await slider.fill("75");
    await expect(page.getByTestId("hedge-ratio-value")).toHaveText("75%");
    await expect(page.getByTestId("donut-chart")).toBeVisible();
    await expect(page.getByTestId("bar-chart")).toBeVisible();
    await page.getByTestId("currency-back").click();
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
  });
});
