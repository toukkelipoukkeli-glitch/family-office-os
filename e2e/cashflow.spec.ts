import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m9-cashflow");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

test.describe("household cashflow page", () => {
  test("navigates from the dashboard to the page and back", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();

    await page.getByTestId("nav-cashflow").click();
    await expect(page).toHaveURL(/#\/cashflow$/);
    await expect(
      page.getByRole("heading", { name: /household cashflow projection/i }),
    ).toBeVisible();
    await expect(page.getByTestId("cashflow-page")).toBeVisible();

    await page.getByTestId("cashflow-back").click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
  });

  test.describe("on the cashflow route", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/#/cashflow");
      await expect(page.getByTestId("cashflow-page")).toBeVisible();
    });

    test("renders the KPIs, balance chart, category chart and table", async ({
      page,
    }) => {
      // KPIs
      await expect(page.getByTestId("kpi-opening")).toBeVisible();
      await expect(page.getByTestId("kpi-ending")).toBeVisible();
      await expect(page.getByTestId("kpi-min")).toBeVisible();
      await expect(page.getByTestId("kpi-inflows")).toBeVisible();
      await expect(page.getByTestId("kpi-outflows")).toBeVisible();
      await expect(page.getByTestId("kpi-net")).toBeVisible();

      // Projected-balance line chart + summary.
      await expect(page.getByTestId("line-chart")).toBeVisible();
      await expect(page.getByTestId("cashflow-balance-summary")).toBeVisible();

      // Per-category bar chart.
      await expect(page.getByTestId("bar-chart")).toBeVisible();

      // Monthly projection table: 24 rows (2024-07 … 2026-06).
      await expect(page.getByTestId("cashflow-row")).toHaveCount(24);
      const firstRow = page.getByTestId("cashflow-row").first();
      await expect(firstRow).toHaveAttribute("data-period", "2024-07");

      // The solvent seeded household shows no shortfall banner.
      await expect(
        page.getByTestId("cashflow-shortfall-banner"),
      ).toHaveCount(0);
    });
  });

  test("captures desktop evidence (1280x800)", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/");
    await page.getByTestId("nav-cashflow").click();
    await expect(page.getByTestId("cashflow-page")).toBeVisible();
    await expect(page.getByTestId("line-chart")).toBeVisible();
    await expect(page.getByTestId("bar-chart")).toBeVisible();
    await expect(page.getByTestId("cashflow-table")).toBeVisible();
    await page.waitForTimeout(150);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "cashflow-desktop.png"),
      fullPage: true,
    });
  });

  test("captures mobile evidence (390x844)", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/#/cashflow");
    await expect(page.getByTestId("cashflow-page")).toBeVisible();
    await expect(page.getByTestId("line-chart")).toBeVisible();
    await expect(page.getByTestId("bar-chart")).toBeVisible();
    await page.waitForTimeout(150);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "cashflow-mobile.png"),
      fullPage: true,
    });
  });

  // The config records a Playwright trace for every test (`trace: "on"`); this
  // walkthrough's trace is the committed evidence for the visual QA gate.
  test("walks through the dashboard nav into the page (traced)", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/");
    await page.getByTestId("nav-cashflow").click();
    await expect(page.getByTestId("cashflow-page")).toBeVisible();
    await expect(page.getByTestId("line-chart")).toBeVisible();
    await expect(page.getByTestId("bar-chart")).toBeVisible();
    await expect(page.getByTestId("cashflow-table")).toBeVisible();
    await page.getByTestId("cashflow-back").click();
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
  });
});
