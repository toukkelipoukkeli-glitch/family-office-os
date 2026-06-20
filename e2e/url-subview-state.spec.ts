import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test } from "@playwright/test";

/**
 * m13-url-subview-state: deep-linkable in-page sub-view state.
 *
 * Each multi-view page stores its selected sub-view (scenario / manager /
 * entity / episode) as a query param on the route's hash, e.g.
 * `#/scenarios?s=drought`. This suite proves the ORACLE: navigating to a deep
 * link selects the right sub-view, and a reload preserves it.
 */

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m13-url-subview-state");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

test.describe("deep-linkable sub-view state", () => {
  test.describe("scenarios (?s=)", () => {
    test("deep link selects the scenario and survives reload", async ({
      page,
    }) => {
      await page.goto("/#/scenarios?s=drought");
      await expect(page.getByTestId("cockpit-page")).toBeVisible();

      const drought = page.locator(
        '[data-testid="scenario-select"][data-scenario="drought"]',
      );
      await expect(drought).toHaveAttribute("data-selected", "true");
      await expect(page.getByTestId("waterfall-chart")).toHaveAttribute(
        "data-scenario",
        "drought",
      );

      // Reload must preserve the selected scenario.
      await page.reload();
      await expect(page).toHaveURL(/#\/scenarios\?s=drought$/);
      await expect(
        page.locator(
          '[data-testid="scenario-select"][data-scenario="drought"]',
        ),
      ).toHaveAttribute("data-selected", "true");
    });

    test("clicking a scenario writes it to the URL (shareable)", async ({
      page,
    }) => {
      await page.goto("/#/scenarios");
      await expect(page.getByTestId("cockpit-page")).toBeVisible();
      await page
        .locator('[data-testid="scenario-select"][data-scenario="drought"]')
        .click();
      await expect(page).toHaveURL(/#\/scenarios\?s=drought$/);
    });
  });

  test.describe("managers (?m=)", () => {
    test("deep link selects the manager and survives reload", async ({
      page,
    }) => {
      await page.goto("/#/managers?m=aurora-ventures");
      await expect(page.getByTestId("managers-page")).toBeVisible();

      const row = page.locator(
        '[data-testid="roster-row"][data-manager="aurora-ventures"]',
      );
      await expect(row).toHaveAttribute("data-selected", "true");
      await expect(page.getByTestId("detail-header")).toContainText(
        "Aurora Ventures",
      );

      await page.reload();
      await expect(page).toHaveURL(/#\/managers\?m=aurora-ventures$/);
      await expect(
        page.locator(
          '[data-testid="roster-row"][data-manager="aurora-ventures"]',
        ),
      ).toHaveAttribute("data-selected", "true");
    });

    test("clicking a manager writes it to the URL (shareable)", async ({
      page,
    }) => {
      await page.goto("/#/managers");
      await expect(page.getByTestId("managers-page")).toBeVisible();
      await page
        .locator('[data-testid="roster-row"][data-manager="aurora-ventures"]')
        .click();
      await expect(page).toHaveURL(/#\/managers\?m=aurora-ventures$/);
    });
  });

  test.describe("stress episodes (?e=)", () => {
    test("deep link selects the episode and survives reload", async ({
      page,
    }) => {
      await page.goto("/#/stress?e=covid-2020");
      await expect(page.getByTestId("stress-page")).toBeVisible();

      const ep = page.locator(
        '[data-testid="stress-select"][data-scenario="covid-2020"]',
      );
      await expect(ep).toHaveAttribute("data-selected", "true");
      await expect(page.getByTestId("stress-detail-title")).toContainText(
        /covid/i,
      );

      await page.reload();
      await expect(page).toHaveURL(/#\/stress\?e=covid-2020$/);
      await expect(
        page.locator(
          '[data-testid="stress-select"][data-scenario="covid-2020"]',
        ),
      ).toHaveAttribute("data-selected", "true");
    });

    test("clicking an episode writes it to the URL (shareable)", async ({
      page,
    }) => {
      await page.goto("/#/stress");
      await expect(page.getByTestId("stress-page")).toBeVisible();
      await page
        .locator('[data-testid="stress-select"][data-scenario="covid-2020"]')
        .click();
      await expect(page).toHaveURL(/#\/stress\?e=covid-2020$/);
    });
  });

  test.describe("consolidation entity (?entity=)", () => {
    test("deep link selects the root entity and survives reload", async ({
      page,
    }) => {
      await page.goto("/#/consolidation?entity=holdco");
      await expect(page.getByTestId("consolidation-view")).toBeVisible();
      await expect(page.getByTestId("cons-root-select")).toHaveValue("holdco");
      // Consolidating up to the holdco drops the trust's own NAV from gross.
      await expect(page.getByTestId("cons-kpi-gross-value")).toContainText(
        "$44.5M",
      );

      await page.reload();
      await expect(page).toHaveURL(/#\/consolidation\?entity=holdco$/);
      await expect(page.getByTestId("cons-root-select")).toHaveValue("holdco");
    });

    test("selecting an entity writes it to the URL (shareable)", async ({
      page,
    }) => {
      await page.goto("/#/consolidation");
      await expect(page.getByTestId("consolidation-view")).toBeVisible();
      await page.getByTestId("cons-root-select").selectOption("holdco");
      await expect(page).toHaveURL(/#\/consolidation\?entity=holdco$/);
    });
  });

  // --- Adversarial: unknown / malformed deep links ------------------------

  test.describe("unknown ids fall back to the default sub-view", () => {
    test("an unknown scenario id renders the default, not a blank page", async ({
      page,
    }) => {
      await page.goto("/#/scenarios?s=does-not-exist");
      await expect(page.getByTestId("cockpit-page")).toBeVisible();
      // Exactly one scenario stays selected (the worst-case default), and the
      // waterfall points at a real scenario rather than the missing id.
      await expect(
        page.locator('[data-testid="scenario-select"][data-selected="true"]'),
      ).toHaveCount(1);
      await expect(page.getByTestId("waterfall-chart")).not.toHaveAttribute(
        "data-scenario",
        "does-not-exist",
      );
    });

    test("an unknown consolidation entity falls back to the default root", async ({
      page,
    }) => {
      await page.goto("/#/consolidation?entity=ghost-entity");
      await expect(page.getByTestId("consolidation-view")).toBeVisible();
      // The select resolves to a real entity, never the bogus URL value.
      await expect(page.getByTestId("cons-root-select")).not.toHaveValue(
        "ghost-entity",
      );
      await expect(page.getByTestId("cons-kpi-consolidated-value")).toBeVisible();
    });
  });

  // --- Visual QA evidence -------------------------------------------------

  test("captures desktop evidence (1280x800)", async ({ page }) => {
    await page.setViewportSize(DESKTOP);

    await page.goto("/#/scenarios?s=drought");
    await expect(page.getByTestId("waterfall-chart")).toHaveAttribute(
      "data-scenario",
      "drought",
    );
    await page.screenshot({
      path: join(EVIDENCE_DIR, "scenarios-deeplink-desktop.png"),
      fullPage: true,
    });

    await page.goto("/#/managers?m=aurora-ventures");
    await expect(page.getByTestId("detail-header")).toContainText(
      "Aurora Ventures",
    );
    await page.screenshot({
      path: join(EVIDENCE_DIR, "managers-deeplink-desktop.png"),
      fullPage: true,
    });

    await page.goto("/#/stress?e=covid-2020");
    await expect(page.getByTestId("stress-detail-title")).toContainText(
      /covid/i,
    );
    await page.screenshot({
      path: join(EVIDENCE_DIR, "stress-deeplink-desktop.png"),
      fullPage: true,
    });

    await page.goto("/#/consolidation?entity=holdco");
    await expect(page.getByTestId("cons-root-select")).toHaveValue("holdco");
    await page.screenshot({
      path: join(EVIDENCE_DIR, "consolidation-deeplink-desktop.png"),
      fullPage: true,
    });
  });

  test("captures mobile evidence (390x844)", async ({ page }) => {
    await page.setViewportSize(MOBILE);

    await page.goto("/#/scenarios?s=drought");
    await expect(page.getByTestId("waterfall-chart")).toHaveAttribute(
      "data-scenario",
      "drought",
    );
    await page.screenshot({
      path: join(EVIDENCE_DIR, "scenarios-deeplink-mobile.png"),
      fullPage: true,
    });

    await page.goto("/#/managers?m=aurora-ventures");
    await expect(page.getByTestId("detail-header")).toContainText(
      "Aurora Ventures",
    );
    await page.screenshot({
      path: join(EVIDENCE_DIR, "managers-deeplink-mobile.png"),
      fullPage: true,
    });

    await page.goto("/#/consolidation?entity=holdco");
    await expect(page.getByTestId("cons-root-select")).toHaveValue("holdco");
    await page.screenshot({
      path: join(EVIDENCE_DIR, "consolidation-deeplink-mobile.png"),
      fullPage: true,
    });
  });
});
