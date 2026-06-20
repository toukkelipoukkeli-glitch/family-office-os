import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m11-liquidity-coverage");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

test.describe("liquidity & capital-call coverage cockpit", () => {
  test("navigates from the dashboard to the page and back", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();

    await page.getByTestId("nav-liquidity").click();
    await expect(page).toHaveURL(/#\/liquidity$/);
    await expect(
      page.getByRole("heading", { name: /liquidity & capital-call coverage/i }),
    ).toBeVisible();
    await expect(page.getByTestId("liquidity-page")).toBeVisible();

    await page.getByTestId("liquidity-back").click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
  });

  test.describe("on the liquidity route", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/#/liquidity");
      await expect(page.getByTestId("liquidity-page")).toBeVisible();
    });

    test("renders the KPIs, coverage chart, reserve chart and tables", async ({
      page,
    }) => {
      // KPIs
      await expect(page.getByTestId("kpi-liquidity")).toBeVisible();
      await expect(page.getByTestId("kpi-obligations")).toBeVisible();
      await expect(page.getByTestId("kpi-calls")).toBeVisible();
      await expect(page.getByTestId("kpi-coverage")).toBeVisible();
      await expect(page.getByTestId("kpi-worst")).toBeVisible();
      await expect(page.getByTestId("kpi-shortfall")).toBeVisible();

      // Headline coverage is ~2.02× and the family is fully covered.
      await expect(page.getByTestId("kpi-coverage")).toContainText("2.02×");
      await expect(page.getByTestId("liquidity-covered-banner")).toBeVisible();
      await expect(
        page.getByTestId("liquidity-shortfall-banner"),
      ).toHaveCount(0);

      // Coverage line chart (two series) + summary.
      await expect(page.getByTestId("line-chart")).toBeVisible();
      await expect(page.getByTestId("liquidity-chart-summary")).toBeVisible();

      // Reserve-tier bar chart with three bars.
      await expect(page.getByTestId("bar-chart")).toBeVisible();
      await expect(page.getByTestId("bar-chart")).toHaveAttribute(
        "data-bars",
        "3",
      );

      // Reserve breakdown table: three tiers, cash first.
      await expect(page.getByTestId("liquidity-reserve-row")).toHaveCount(3);
      const firstTier = page.getByTestId("liquidity-reserve-row").first();
      await expect(firstTier).toHaveAttribute("data-tier", "cash");

      // Monthly coverage table: 24 obligation months (2024-07 … 2026-06).
      await expect(page.getByTestId("liquidity-row")).toHaveCount(24);
      const firstRow = page.getByTestId("liquidity-row").first();
      await expect(firstRow).toHaveAttribute("data-period", "2024-07");
    });

    test("scrolls the coverage table into view", async ({ page }) => {
      const lastRow = page.getByTestId("liquidity-row").last();
      await lastRow.scrollIntoViewIfNeeded();
      await expect(lastRow).toHaveAttribute("data-period", "2026-06");
    });
  });

  test("captures desktop evidence (1280x800)", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/");
    await page.getByTestId("nav-liquidity").click();
    await expect(page.getByTestId("liquidity-page")).toBeVisible();
    await expect(page.getByTestId("line-chart")).toBeVisible();
    await expect(page.getByTestId("bar-chart")).toBeVisible();
    await expect(page.getByTestId("liquidity-table")).toBeVisible();
    await page.waitForTimeout(150);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "liquidity-desktop.png"),
      fullPage: true,
    });
  });

  test("captures mobile evidence (390x844)", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/#/liquidity");
    await expect(page.getByTestId("liquidity-page")).toBeVisible();
    await expect(page.getByTestId("line-chart")).toBeVisible();
    await expect(page.getByTestId("bar-chart")).toBeVisible();
    await page.waitForTimeout(150);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "liquidity-mobile.png"),
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
    await page.getByTestId("nav-liquidity").click();
    await expect(page.getByTestId("liquidity-page")).toBeVisible();
    await expect(page.getByTestId("line-chart")).toBeVisible();
    await expect(page.getByTestId("bar-chart")).toBeVisible();
    await expect(page.getByTestId("liquidity-reserve-table")).toBeVisible();
    await expect(page.getByTestId("liquidity-table")).toBeVisible();
    await page.getByTestId("liquidity-back").click();
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
  });
});
