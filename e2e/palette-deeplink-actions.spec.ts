import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdir } from "node:fs/promises";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m13-palette-deeplink-actions");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

/** Open the palette with the portable Ctrl-K shortcut (also wired on macOS). */
async function openPalette(page: import("@playwright/test").Page) {
  await page.keyboard.press("Control+k");
  await expect(page.getByTestId("command-palette")).toBeVisible();
}

test.describe("m13 command palette: deep-links + actions", () => {
  test("deep-links into a stress sub-view (route + query) from the palette", async ({
    page,
  }) => {
    await page.goto("/");
    await openPalette(page);

    // Search for a sub-view that is NOT the page's default selection, so the
    // assertion proves the deep link drove the selection (default is gfc-2008).
    await page.getByTestId("command-palette-input").fill("2022 rate shock");
    const option = page.getByTestId(
      "command-option-deeplink:stress:rate-shock-2022",
    );
    await expect(option).toBeVisible();
    await page.keyboard.press("Enter");

    // The palette navigated to the route AND set the sub-view query param.
    await expect(page.getByTestId("command-palette")).toHaveCount(0);
    await expect(page).toHaveURL(/#\/stress\?e=rate-shock-2022$/);

    // Effect on the page: the deep-linked episode is the selected one.
    await expect(page.getByTestId("stress-page")).toBeVisible();
    await expect(
      page.locator(
        '[data-testid="stress-select"][data-scenario="rate-shock-2022"]',
      ),
    ).toHaveAttribute("data-selected", "true");
    await expect(page.getByTestId("waterfall-chart")).toHaveAttribute(
      "data-scenario",
      "rate-shock-2022",
    );
    await expect(page.getByTestId("stress-detail-title")).toContainText(
      "2022 rate shock",
    );
  });

  test("deep-links into a consolidation entity sub-view", async ({ page }) => {
    await page.goto("/");
    await openPalette(page);
    await page.getByTestId("command-palette-input").fill("Atlas Operating");
    const option = page.getByTestId(
      "command-option-deeplink:consolidation:atlas",
    );
    await expect(option).toBeVisible();
    await option.click();

    await expect(page).toHaveURL(/#\/consolidation\?entity=atlas$/);
    await expect(page.getByTestId("consolidation-view")).toBeVisible();
  });

  test("switches the reporting currency via a palette action", async ({
    page,
  }) => {
    await page.goto("/");
    const select = page.getByTestId("reporting-currency");
    await expect(select).toHaveValue("USD");
    await expect(page.getByTestId("kpi-current")).toContainText("$");

    await openPalette(page);
    await page.getByTestId("command-palette-input").fill("currency EUR");
    const eur = page.getByTestId("command-option-currency:EUR");
    await expect(eur).toBeVisible();
    await eur.click();

    // The palette closed, the route is unchanged (still the dashboard, with no
    // route hash), and the global reporting currency switched — the shell
    // <select> and the headline KPI both follow.
    await expect(page.getByTestId("command-palette")).toHaveCount(0);
    await expect(page).toHaveURL(/localhost:\d+\/(#\/?)?$/);
    await expect(select).toHaveValue("EUR");
    await expect(page.getByTestId("kpi-current")).toContainText("€");
  });

  test("marks the active currency as (current) in the palette", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("reporting-currency").selectOption("GBP");
    await expect(page.getByTestId("reporting-currency")).toHaveValue("GBP");

    await openPalette(page);
    await page.getByTestId("command-palette-input").fill("currency");
    await expect(
      page.getByTestId("command-option-currency:GBP"),
    ).toContainText("(current)");
  });

  test("surfaces recently visited pages at the top of the palette", async ({
    page,
  }) => {
    // Visit two pages so a recent-history is recorded, then go to the dashboard.
    await page.goto("/#/fees");
    await expect(page.getByTestId("fees-page")).toBeVisible();
    await page.goto("/#/risk");
    await expect(
      page.getByRole("heading", { name: /risk/i }).first(),
    ).toBeVisible();
    await page.goto("/");

    await openPalette(page);
    // The most-recent route (risk) is the first option, tagged "Recent".
    const firstOption = page
      .getByTestId("command-palette")
      .getByRole("option")
      .first();
    await expect(firstOption).toHaveAttribute(
      "data-testid",
      "command-option-recent:/risk",
    );
    await expect(firstOption).toContainText("Recent");

    // Activating it navigates back to that page.
    await firstOption.click();
    await expect(page).toHaveURL(/#\/risk$/);
  });

  test("captures desktop evidence (1280x800)", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await mkdir(EVIDENCE_DIR, { recursive: true });

    // Seed a little recent history so the palette shows the full feature set.
    await page.goto("/#/fees");
    await expect(page.getByTestId("fees-page")).toBeVisible();
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();

    await openPalette(page);
    await page.waitForTimeout(150);
    // Full list: shows the Recent row, currency actions, routes, deep links.
    await page.screenshot({
      path: join(EVIDENCE_DIR, "palette-open-desktop.png"),
    });

    // Currency actions filtered.
    await page.getByTestId("command-palette-input").fill("currency");
    await page.waitForTimeout(150);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "palette-currency-desktop.png"),
    });

    // Deep-link sub-views filtered.
    await page.getByTestId("command-palette-input").fill("stress");
    await page.waitForTimeout(150);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "palette-deeplinks-desktop.png"),
    });

    // The effect of a currency action on the dashboard.
    await page.getByTestId("command-palette-input").fill("currency EUR");
    await page.getByTestId("command-option-currency:EUR").click();
    await expect(page.getByTestId("reporting-currency")).toHaveValue("EUR");
    await page.waitForTimeout(150);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "currency-effect-desktop.png"),
      fullPage: true,
    });
  });

  test("captures mobile evidence (390x844)", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await mkdir(EVIDENCE_DIR, { recursive: true });

    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();

    await openPalette(page);
    await page.getByTestId("command-palette-input").fill("currency");
    await page.waitForTimeout(150);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "palette-currency-mobile.png"),
    });

    await page.getByTestId("command-palette-input").fill("2008");
    await page.waitForTimeout(150);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "palette-deeplink-mobile.png"),
    });
  });

  // Traced end-to-end workflow: open → deep-link → currency action. The config
  // records `trace: "on"`, so this test's recording is copied into the evidence
  // dir after the run as proof of the workflow.
  test("traced walkthrough (open, currency, deep-link)", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/");

    // Currency action first, while the dashboard switcher is visible to assert.
    await openPalette(page);
    await page.getByTestId("command-palette-input").fill("currency CHF");
    await page.getByTestId("command-option-currency:CHF").click();
    await expect(page.getByTestId("reporting-currency")).toHaveValue("CHF");

    // Then deep-link into a stress sub-view.
    await openPalette(page);
    await page.getByTestId("command-palette-input").fill("2008 Global");
    await page.getByTestId("command-option-deeplink:stress:gfc-2008").click();
    await expect(page).toHaveURL(/#\/stress\?e=gfc-2008$/);
    await expect(page.getByTestId("stress-detail-title")).toContainText(
      "2008 Global Financial Crisis",
    );
  });
});
