import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m9-benchmark");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

test.describe("benchmark & relative performance", () => {
  test("navigates from the dashboard to benchmark and back", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();

    await page.getByTestId("nav-benchmark").click();
    await expect(page).toHaveURL(/#\/benchmark$/);
    await expect(
      page.getByRole("heading", { name: "Benchmark & relative performance" }),
    ).toBeVisible();
    await expect(page.getByTestId("benchmark-page")).toBeVisible();

    await page.getByTestId("benchmark-back").click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
  });

  test.describe("on the benchmark route", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/#/benchmark");
      await expect(page.getByTestId("benchmark-page")).toBeVisible();
    });

    test("renders the KPIs, growth chart, excess strip and table", async ({
      page,
    }) => {
      // KPIs (default policy benchmark).
      await expect(page.getByTestId("kpi-excess")).toContainText("+3.88%");
      await expect(page.getByTestId("kpi-tracking-error")).toContainText(
        "2.62%",
      );
      await expect(page.getByTestId("kpi-info-ratio")).toContainText("+1.38");
      await expect(page.getByTestId("kpi-beta")).toContainText("1.63");

      // Growth chart: two series.
      const chart = page.getByTestId("growth-chart");
      await expect(chart).toBeVisible();
      await expect(chart).toHaveAttribute("data-series", "2");

      // Excess strip: 12 bars.
      const strip = page.getByTestId("excess-return-chart");
      await expect(strip).toBeVisible();
      await expect(strip).toHaveAttribute("data-periods", "12");
      await expect(page.getByTestId("excess-bar")).toHaveCount(12);

      // Detail table.
      await expect(page.getByTestId("benchmark-table")).toBeVisible();
      await expect(page.getByTestId("table-row")).toHaveCount(12);
      await expect(page.getByTestId("table-excess")).toContainText("+3.88%");
    });

    test("switches the benchmark via the toggle", async ({ page }) => {
      const bonds = page.locator(
        '[data-testid="benchmark-select"][data-benchmark="bonds"]',
      );
      await bonds.click();
      await expect(bonds).toHaveAttribute("data-selected", "true");
      // Against bonds, excess and beta change markedly.
      await expect(page.getByTestId("kpi-excess")).toContainText("+7.98%");
      await expect(page.getByTestId("kpi-beta")).toContainText("-3.55");

      const policy = page.locator(
        '[data-testid="benchmark-select"][data-benchmark="policy"]',
      );
      await policy.click();
      await expect(policy).toHaveAttribute("data-selected", "true");
      await expect(page.getByTestId("kpi-excess")).toContainText("+3.88%");
    });

    test("captures desktop evidence (1280x800)", async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await expect(page.getByTestId("growth-chart")).toBeVisible();
      await expect(page.getByTestId("excess-return-chart")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "benchmark-desktop.png"),
        fullPage: true,
      });

      // Also capture the 60/40 benchmark state.
      await page
        .locator('[data-testid="benchmark-select"][data-benchmark="sixty-forty"]')
        .click();
      await expect(
        page.locator(
          '[data-testid="benchmark-select"][data-benchmark="sixty-forty"]',
        ),
      ).toHaveAttribute("data-selected", "true");
      await page.screenshot({
        path: join(EVIDENCE_DIR, "benchmark-desktop-6040.png"),
        fullPage: true,
      });
    });

    test("captures mobile evidence (390x844)", async ({ page }) => {
      await page.setViewportSize(MOBILE);
      await expect(page.getByTestId("growth-chart")).toBeVisible();
      await expect(page.getByTestId("excess-return-chart")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "benchmark-mobile.png"),
        fullPage: true,
      });
    });
  });
});
