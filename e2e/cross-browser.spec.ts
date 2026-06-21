import { existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m14-cross-browser");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

// Make the evidence directory exist up-front so the screenshot steps can run in
// any order / in isolation without a missing-directory error.
if (!existsSync(EVIDENCE_DIR)) mkdirSync(EVIDENCE_DIR, { recursive: true });

/**
 * Cross-browser smoke gate (m14): the same core workflow must render and behave
 * identically on chromium, firefox and webkit. Playwright runs this file once
 * per browser project (see playwright.config.ts), so every assertion below is a
 * cross-engine check. Each project also drops desktop + mobile screenshots under
 * e2e/evidence/m14-cross-browser/<browser>/ for the human visual-QA pass; a
 * trace is recorded for every project via `trace: "on"` in the config.
 */
test.describe("cross-browser core workflow", () => {
  test("dashboard renders and navigates on every engine", async ({
    page,
  }, testInfo) => {
    const browser = testInfo.project.name;

    await page.setViewportSize(DESKTOP);
    await page.goto("/");

    // Dashboard renders its heading on every engine.
    await expect(
      page.getByRole("heading", { name: /family office os/i }),
    ).toBeVisible();

    // Navigation works cross-browser: jump to the charts gallery and back.
    await page.getByTestId("nav-charts").click();
    await expect(page).toHaveURL(/#\/charts$/);
    await expect(page.getByTestId("charts-gallery")).toBeVisible();

    // The accessible data table mirrors the chart on every engine (a good proxy
    // for SVG + DOM interplay, which is where engines tend to diverge).
    await page.getByTestId("fig-bar-table-toggle").click();
    await expect(page.getByTestId("fig-bar-table")).toBeVisible();

    await page.screenshot({
      path: join(EVIDENCE_DIR, browser, "charts-desktop.png"),
      fullPage: true,
    });
  });

  test("net-worth dashboard renders money + chart on every engine", async ({
    page,
  }, testInfo) => {
    const browser = testInfo.project.name;

    await page.setViewportSize(DESKTOP);
    await page.goto("/");
    // The net-worth dashboard is the root view: title, area chart and the
    // allocation donut must all draw on every engine.
    await expect(page.getByTestId("networth-dashboard")).toBeVisible();
    await expect(page.getByTestId("networth-chart-title")).toHaveText(
      "Total net worth",
    );
    await expect(page.getByTestId("networth-area")).toBeVisible();
    await expect(page.getByTestId("donut-segment")).toHaveCount(13);

    await page.screenshot({
      path: join(EVIDENCE_DIR, browser, "networth-desktop.png"),
      fullPage: true,
    });
  });

  test("typing into the holdings search filters on every engine", async ({
    page,
  }) => {
    // Text entry is the one input modality the other smoke tests don't cover, and
    // it's where engines historically diverge (IME/composition, `type=search`
    // clear button, controlled-input re-render). Type realistic data and assert
    // the resulting UI state changes identically on chromium/firefox/webkit.
    await page.setViewportSize(DESKTOP);
    await page.goto("/#/holdings");
    await expect(page.getByTestId("holdings-table")).toBeVisible();
    await expect(page.getByTestId("holdings-row")).toHaveCount(14);

    await page.getByTestId("holdings-search").fill("apple");

    await expect(page.getByTestId("holdings-row")).toHaveCount(1);
    await expect(page.getByTestId("holdings-row").first()).toHaveAttribute(
      "data-holding",
      "hold-equity-aapl",
    );
    // The controlled input must reflect what was typed on every engine.
    await expect(page.getByTestId("holdings-search")).toHaveValue("apple");
    // …and the search persists to the URL for deep-linking.
    await expect(page).toHaveURL(/q=apple/);
  });

  test("mobile layout is usable on every engine", async ({
    page,
  }, testInfo) => {
    const browser = testInfo.project.name;

    await page.setViewportSize(MOBILE);
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /family office os/i }),
    ).toBeVisible();

    // The page must not overflow the mobile viewport horizontally — a common
    // cross-engine layout regression. Allow a 1px rounding tolerance.
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    await page.screenshot({
      path: join(EVIDENCE_DIR, browser, "dashboard-mobile.png"),
      fullPage: true,
    });
  });
});
