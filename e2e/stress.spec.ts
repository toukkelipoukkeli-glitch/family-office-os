import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m10-stress");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

test.describe("historical stress tests", () => {
  test("navigates from the dashboard to the stress library and back", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();

    await page.getByTestId("nav-stress").click();
    await expect(page).toHaveURL(/#\/stress$/);
    await expect(
      page.getByRole("heading", { name: /historical stress tests/i }),
    ).toBeVisible();
    await expect(page.getByTestId("stress-page")).toBeVisible();

    await page.getByTestId("stress-back").click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
  });

  test.describe("on the stress route", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/#/stress");
      await expect(page.getByTestId("stress-page")).toBeVisible();
    });

    test("renders KPIs, before/after chart, list and detail", async ({
      page,
    }) => {
      await expect(page.getByTestId("kpi-networth")).toBeVisible();
      await expect(page.getByTestId("kpi-worst")).toBeVisible();
      await expect(page.getByTestId("kpi-episodes")).toBeVisible();

      const chart = page.getByTestId("before-after-chart");
      await expect(chart).toBeVisible();
      await expect(chart).toHaveAttribute("data-scenarios", "3");
      await expect(page.getByTestId("before-after-group")).toHaveCount(3);

      // The episode list has one row per scenario, defaulting to the worst.
      await expect(page.getByTestId("stress-select")).toHaveCount(3);
      const first = page.getByTestId("stress-select").first();
      await expect(first).toHaveAttribute("data-scenario", "gfc-2008");
      await expect(first).toHaveAttribute("data-selected", "true");

      // Detail panel: waterfall + sources for the worst episode.
      await expect(page.getByTestId("waterfall-chart")).toHaveAttribute(
        "data-scenario",
        "gfc-2008",
      );
      await expect(page.getByTestId("stress-sources")).toContainText(/S&P 500/i);
      await expect(page.getByTestId("stress-summary")).toContainText(
        /day zero/i,
      );
    });

    test("selecting an episode drives the waterfall and sources", async ({
      page,
    }) => {
      const covid = page.locator(
        '[data-testid="stress-select"][data-scenario="covid-2020"]',
      );
      await covid.click();
      await expect(covid).toHaveAttribute("data-selected", "true");

      await expect(page.getByTestId("waterfall-chart")).toHaveAttribute(
        "data-scenario",
        "covid-2020",
      );
      await expect(page.getByTestId("stress-detail-title")).toContainText(
        /covid/i,
      );
      await expect(page.getByTestId("stress-sources")).toContainText(
        /black thursday/i,
      );
    });

    test("captures desktop evidence (1280x800)", async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await expect(page.getByTestId("before-after-chart")).toBeVisible();
      await expect(page.getByTestId("waterfall-chart")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "stress-desktop.png"),
        fullPage: true,
      });

      // Also capture a drilled-down (2022 rate shock) state.
      await page
        .locator('[data-testid="stress-select"][data-scenario="rate-shock-2022"]')
        .click();
      await expect(page.getByTestId("waterfall-chart")).toHaveAttribute(
        "data-scenario",
        "rate-shock-2022",
      );
      await page.screenshot({
        path: join(EVIDENCE_DIR, "stress-desktop-2022.png"),
        fullPage: true,
      });
    });

    test("captures mobile evidence (390x844)", async ({ page }) => {
      await page.setViewportSize(MOBILE);
      await expect(page.getByTestId("before-after-chart")).toBeVisible();
      await expect(page.getByTestId("stress-list")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "stress-mobile.png"),
        fullPage: true,
      });
    });
  });
});
