import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m13-currency-rollout");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

/** Strip everything but digits from a formatted money string. */
function digits(text: string): string {
  return text.replace(/[^0-9]/g, "");
}

/**
 * The value-bearing pages wired through the reporting-currency boundary, with a
 * test-id that wraps exactly one headline money figure. The reporting currency
 * is global + persisted, so every page re-expresses its figures once the user
 * has chosen a base — even pages whose own header does not host the switcher.
 */
const PAGES: { route: string; headline: string }[] = [
  { route: "/#/consolidation", headline: "cons-kpi-consolidated-value" },
  { route: "/#/risk", headline: "risk-stat-networth" },
  { route: "/#/concentration", headline: "conc-stat-networth" },
  { route: "/#/lookthrough", headline: "lt-stat-value" },
  { route: "/#/cashflow", headline: "kpi-opening" },
  { route: "/#/estate", headline: "kpi-gross" },
  { route: "/#/giving", headline: "kpi-gifted" },
  { route: "/#/goals", headline: "kpi-target" },
  { route: "/#/insurance", headline: "kpi-coverage" },
  { route: "/#/tax-timeline", headline: "kpi-tax" },
  { route: "/#/managers", headline: "manager-aum" },
];

/** Set the global reporting currency from the dashboard switcher. */
async function setCurrency(page: Page, code: string): Promise<void> {
  await page.goto("/");
  const select = page.getByTestId("reporting-currency");
  await expect(select).toBeVisible();
  await select.selectOption(code);
  await expect(select).toHaveValue(code);
}

test.describe("reporting-currency rollout — every wired page re-expresses", () => {
  for (const { route, headline } of PAGES) {
    test(`${route} re-expresses its headline figure into EUR`, async ({
      page,
    }) => {
      // Baseline: read the USD figure on this page.
      await setCurrency(page, "USD");
      await page.goto(route);
      const usd = page.getByTestId(headline);
      await expect(usd).toBeVisible();
      const usdText = (await usd.innerText()).trim();
      expect(usdText).toContain("$");

      // Switch the global base to EUR, return to the page, and confirm the same
      // figure now reads in EUR with a different magnitude (a real conversion).
      await setCurrency(page, "EUR");
      await page.goto(route);
      const eur = page.getByTestId(headline);
      await expect(eur).toBeVisible();
      const eurText = (await eur.innerText()).trim();
      expect(eurText).toMatch(/€|EUR/);
      expect(eurText).not.toContain("$");
      expect(digits(eurText)).not.toBe(digits(usdText));
    });
  }
});

test.describe("reporting-currency rollout — visual evidence", () => {
  test("captures desktop evidence (1280x800)", async ({ page }) => {
    await page.setViewportSize(DESKTOP);

    // USD baseline on a representative converted page (consolidation).
    await setCurrency(page, "USD");
    await page.goto("/#/consolidation");
    await expect(page.getByTestId("consolidation-view")).toBeVisible();
    await page.screenshot({
      path: join(EVIDENCE_DIR, "consolidation-usd-desktop.png"),
      fullPage: true,
    });

    // EUR re-expression of the same page.
    await setCurrency(page, "EUR");
    await page.goto("/#/consolidation");
    await expect(page.getByTestId("cons-kpi-consolidated-value")).toContainText(
      /€|EUR/,
    );
    await page.screenshot({
      path: join(EVIDENCE_DIR, "consolidation-eur-desktop.png"),
      fullPage: true,
    });

    // A second converted page (risk cockpit) in EUR, to show breadth.
    await page.goto("/#/risk");
    await expect(page.getByTestId("risk-cockpit-view")).toBeVisible();
    await page.screenshot({
      path: join(EVIDENCE_DIR, "risk-eur-desktop.png"),
      fullPage: true,
    });

    // A number-formatter page (cashflow) in EUR.
    await page.goto("/#/cashflow");
    await expect(page.getByTestId("cashflow-page")).toBeVisible();
    await page.screenshot({
      path: join(EVIDENCE_DIR, "cashflow-eur-desktop.png"),
      fullPage: true,
    });
  });

  test("captures mobile evidence (390x844)", async ({ page }) => {
    await page.setViewportSize(MOBILE);

    // Set GBP on the dashboard (mobile switcher), then view converted pages.
    await page.goto("/");
    const mobileSwitcher = page.getByTestId("reporting-currency-mobile");
    await expect(mobileSwitcher).toBeVisible();
    await mobileSwitcher.selectOption("GBP");
    await expect(page.getByTestId("kpi-current")).toContainText("£");

    await page.goto("/#/consolidation");
    await expect(page.getByTestId("consolidation-view")).toBeVisible();
    await page.screenshot({
      path: join(EVIDENCE_DIR, "consolidation-gbp-mobile.png"),
      fullPage: true,
    });

    await page.goto("/#/giving");
    await expect(page.getByTestId("giving-page")).toBeVisible();
    await page.screenshot({
      path: join(EVIDENCE_DIR, "giving-gbp-mobile.png"),
      fullPage: true,
    });
  });
});
