import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m3-viz");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

test.describe("scenario cockpit", () => {
  test("navigates from the dashboard to the cockpit and back", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();

    await page.getByTestId("nav-scenarios").click();
    await expect(page).toHaveURL(/#\/scenarios$/);
    await expect(
      page.getByRole("heading", { name: "Scenario cockpit" }),
    ).toBeVisible();
    await expect(page.getByTestId("cockpit-page")).toBeVisible();

    await page.getByTestId("cockpit-back").click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
  });

  test.describe("on the cockpit route", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/#/scenarios");
      await expect(page.getByTestId("cockpit-page")).toBeVisible();
    });

    test("renders the KPIs, fan chart, tornado and waterfall", async ({
      page,
    }) => {
      // KPIs
      await expect(page.getByTestId("kpi-networth")).toBeVisible();
      await expect(page.getByTestId("kpi-var")).toBeVisible();

      // Fan chart with median + two bands and 6 horizon points.
      const fan = page.getByTestId("fan-chart");
      await expect(fan).toBeVisible();
      await expect(fan).toHaveAttribute("data-points", "6");
      await expect(page.getByTestId("fan-median")).toBeVisible();
      await expect(page.getByTestId("fan-band-50")).toBeVisible();
      await expect(page.getByTestId("fan-band-90")).toBeVisible();

      // Tornado: one bar per named scenario (4).
      await expect(page.getByTestId("tornado-chart")).toBeVisible();
      await expect(page.getByTestId("tornado-row")).toHaveCount(4);

      // Waterfall defaults to the worst scenario.
      const wf = page.getByTestId("waterfall-chart");
      await expect(wf).toBeVisible();
      await expect(wf).toHaveAttribute("data-scenario", "market-correction");
      await expect(page.getByTestId("wf-col-initial")).toBeVisible();
      await expect(page.getByTestId("wf-col-shocked")).toBeVisible();
    });

    test("selecting a scenario drives the waterfall and rationale", async ({
      page,
    }) => {
      const drought = page.locator(
        '[data-testid="scenario-select"][data-scenario="drought"]',
      );
      await drought.click();
      await expect(drought).toHaveAttribute("data-selected", "true");

      await expect(page.getByTestId("waterfall-chart")).toHaveAttribute(
        "data-scenario",
        "drought",
      );
      await expect(page.getByTestId("waterfall-title")).toContainText(
        /drought/i,
      );
      await expect(page.getByTestId("scenario-rationale")).toContainText(
        /drought/i,
      );
      await expect(page.getByTestId("waterfall-summary")).toContainText(
        /day zero/i,
      );
    });

    test("captures desktop evidence (1280x800)", async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await expect(page.getByTestId("fan-chart")).toBeVisible();
      await expect(page.getByTestId("tornado-chart")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "cockpit-desktop.png"),
        fullPage: true,
      });

      // Also capture a drilled-down (drought) state.
      await page
        .locator('[data-testid="scenario-select"][data-scenario="drought"]')
        .click();
      await expect(page.getByTestId("waterfall-chart")).toHaveAttribute(
        "data-scenario",
        "drought",
      );
      await page.screenshot({
        path: join(EVIDENCE_DIR, "cockpit-desktop-drought.png"),
        fullPage: true,
      });
    });

    test("captures mobile evidence (390x844)", async ({ page }) => {
      await page.setViewportSize(MOBILE);
      await expect(page.getByTestId("fan-chart")).toBeVisible();
      await expect(page.getByTestId("tornado-chart")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "cockpit-mobile.png"),
        fullPage: true,
      });
    });
  });
});
