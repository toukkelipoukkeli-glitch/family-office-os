import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m7-fees");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

test.describe("fees & TCO page", () => {
  test("navigates from the dashboard to the fees page and back", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();

    await page.getByTestId("nav-fees").click();
    await expect(page).toHaveURL(/#\/fees$/);
    await expect(
      page.getByRole("heading", { name: /fees & total cost of ownership/i }),
    ).toBeVisible();
    await expect(page.getByTestId("fees-page")).toBeVisible();

    await page.getByTestId("fees-back").click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
  });

  test.describe("on the fees route", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/#/fees");
      await expect(page.getByTestId("fees-page")).toBeVisible();
    });

    test("renders the KPIs, charts and breakdown table", async ({ page }) => {
      // KPIs
      await expect(page.getByTestId("kpi-invested")).toBeVisible();
      await expect(page.getByTestId("kpi-annual-cost")).toBeVisible();
      await expect(page.getByTestId("kpi-blended-rate")).toBeVisible();
      await expect(page.getByTestId("kpi-drag")).toBeVisible();

      // Per-fund bar chart: one bar per fund (5 seeded vehicles).
      const bar = page.getByTestId("bar-chart");
      await expect(bar).toBeVisible();
      await expect(bar).toHaveAttribute("data-bars", "5");

      // Composition donut + legend.
      await expect(page.getByTestId("donut-chart")).toBeVisible();
      await expect(page.getByTestId("composition-row")).toHaveCount(3);

      // Fee-drag summary + breakdown table.
      await expect(page.getByTestId("drag-summary")).toBeVisible();
      await expect(page.getByTestId("fees-row")).toHaveCount(5);

      // The PE fund heads the table (costliest).
      const firstRow = page.getByTestId("fees-row").first();
      await expect(firstRow).toHaveAttribute("data-fund", "fee-private-equity");
    });
  });

  test("captures desktop evidence (1280x800)", async ({ page }) => {
    // Walk through the dashboard nav into the fees page, then snapshot.
    await page.setViewportSize(DESKTOP);
    await page.goto("/");
    await page.getByTestId("nav-fees").click();
    await expect(page.getByTestId("fees-page")).toBeVisible();
    await expect(page.getByTestId("bar-chart")).toBeVisible();
    await expect(page.getByTestId("donut-chart")).toBeVisible();
    await expect(page.getByTestId("drag-summary")).toBeVisible();
    await page.waitForTimeout(150);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "fees-desktop.png"),
      fullPage: true,
    });
  });

  test("captures mobile evidence (390x844)", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/#/fees");
    await expect(page.getByTestId("fees-page")).toBeVisible();
    await expect(page.getByTestId("bar-chart")).toBeVisible();
    await expect(page.getByTestId("donut-chart")).toBeVisible();
    await page.waitForTimeout(150);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "fees-mobile.png"),
      fullPage: true,
    });
  });

  // Record a self-managed Playwright trace of the full walkthrough and commit
  // it as evidence (separate context so config-level `trace: "on"` doesn't
  // double-manage the same recording).
  // The config records a Playwright trace for every test (`trace: "on"`); the
  // trace for this walkthrough is copied from `test-results/` into the
  // committed evidence dir (e2e/evidence/m7-fees/fees-trace.zip).
  test("walks through the dashboard nav into the fees page (traced)", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/");
    await page.getByTestId("nav-fees").click();
    await expect(page.getByTestId("fees-page")).toBeVisible();
    await expect(page.getByTestId("bar-chart")).toBeVisible();
    await expect(page.getByTestId("donut-chart")).toBeVisible();
    await expect(page.getByTestId("fees-table")).toBeVisible();
    await page.getByTestId("fees-back").click();
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
  });
});
