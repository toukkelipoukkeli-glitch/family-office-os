import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m12-reporting-currency");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

/** Strip everything but digits from a formatted money string. */
function digits(text: string): string {
  return text.replace(/[^0-9]/g, "");
}

test.describe("global reporting-currency switcher", () => {
  test("defaults to USD on the dashboard", async ({ page }) => {
    await page.goto("/");
    const select = page.getByTestId("reporting-currency");
    await expect(select).toBeVisible();
    await expect(select).toHaveValue("USD");
    // Headline net worth is shown in USD.
    await expect(page.getByTestId("kpi-current")).toContainText("$");
  });

  test("switching the currency re-expresses portfolio values", async ({
    page,
  }) => {
    await page.goto("/");
    const select = page.getByTestId("reporting-currency");
    const kpi = page.getByTestId("kpi-current");

    const usdText = (await kpi.innerText()).trim();
    expect(usdText).toContain("$");
    const usdDigits = digits(usdText);

    // Switch to EUR: the value re-expresses (smaller number, EUR symbol) and the
    // chart caption reports the new base currency.
    await select.selectOption("EUR");
    await expect(select).toHaveValue("EUR");
    await expect(kpi).toContainText("€");
    const eurText = (await kpi.innerText()).trim();
    expect(digits(eurText)).not.toBe(usdDigits);
    // 1 EUR = 1.08 USD, so the EUR figure is smaller than the USD figure.
    expect(Number(digits(eurText))).toBeLessThan(Number(usdDigits));

    // The allocation card caption follows the reporting currency.
    await expect(
      page.getByText("By asset class, in EUR.", { exact: true }),
    ).toBeVisible();

    // Switch to GBP and confirm it re-expresses again.
    await select.selectOption("GBP");
    await expect(select).toHaveValue("GBP");
    await expect(kpi).toContainText("£");
  });

  test("the preference persists across reloads", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("reporting-currency").selectOption("CHF");
    await expect(page.getByTestId("reporting-currency")).toHaveValue("CHF");

    await page.reload();
    await expect(page.getByTestId("reporting-currency")).toHaveValue("CHF");
    await expect(page.getByTestId("kpi-current")).toContainText("CHF");
  });

  test("applies on inner shell pages too", async ({ page }) => {
    // The switcher lives in the shared AppShell header on every page.
    await page.goto("/#/fees");
    const select = page.getByTestId("reporting-currency");
    await expect(select).toBeVisible();
    await select.selectOption("EUR");
    await expect(select).toHaveValue("EUR");

    // Navigate back to the dashboard — the EUR preference carries over.
    await page.goto("/");
    await expect(page.getByTestId("reporting-currency")).toHaveValue("EUR");
    await expect(page.getByTestId("kpi-current")).toContainText("€");
  });

  test("captures desktop evidence (1280x800)", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/");
    await expect(page.getByTestId("networth-area")).toBeVisible();

    // USD (default) baseline.
    await page.screenshot({
      path: join(EVIDENCE_DIR, "reporting-currency-usd-desktop.png"),
      fullPage: true,
    });

    // Switch to EUR and capture the re-expressed dashboard.
    await page.getByTestId("reporting-currency").selectOption("EUR");
    await expect(page.getByTestId("kpi-current")).toContainText("€");
    await expect(page.getByTestId("networth-donut")).toBeVisible();
    await page.screenshot({
      path: join(EVIDENCE_DIR, "reporting-currency-eur-desktop.png"),
      fullPage: true,
    });
  });

  test("captures mobile evidence (390x844)", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/");
    // On mobile the switcher is surfaced inline at the top of the page.
    const select = page.getByTestId("reporting-currency-mobile");
    await expect(select).toBeVisible();
    await select.selectOption("GBP");
    await expect(page.getByTestId("kpi-current")).toContainText("£");
    await expect(page.getByTestId("networth-area")).toBeVisible();
    await page.screenshot({
      path: join(EVIDENCE_DIR, "reporting-currency-gbp-mobile.png"),
      fullPage: true,
    });
  });
});
