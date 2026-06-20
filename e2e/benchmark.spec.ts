import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m9-benchmark");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

// The Playwright config already records a trace for every test (`trace: "on"`);
// this makes the UI-evidence requirement explicit at the suite level so the
// trace is always captured even if the global default changes.
test.use({ trace: "on" });

test.describe("benchmark + relative performance", () => {
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

    test("renders the KPIs, growth chart and detail table", async ({ page }) => {
      await expect(page.getByTestId("kpi-excess")).toBeVisible();
      await expect(page.getByTestId("kpi-excess")).toContainText("+6.88%");
      await expect(page.getByTestId("kpi-tracking-error")).toBeVisible();
      await expect(page.getByTestId("kpi-info-ratio")).toBeVisible();
      await expect(page.getByTestId("kpi-beta")).toBeVisible();

      const chart = page.getByTestId("growth-chart");
      await expect(chart).toBeVisible();
      await expect(chart.getByTestId("line-chart")).toHaveAttribute(
        "data-series",
        "2",
      );

      await expect(page.getByTestId("benchmark-table")).toBeVisible();
      await expect(page.getByTestId("table-row")).toHaveCount(12);
      await expect(page.getByTestId("table-excess")).toContainText("+6.88%");
    });

    test("switches benchmark via the selector", async ({ page }) => {
      const bond = page.locator(
        '[data-testid="benchmark-select"][data-benchmark="broad-bond-only"]',
      );
      await bond.click();
      await expect(bond).toHaveAttribute("data-selected", "true");
      // Excess vs a 100% bond benchmark differs from the blended policy.
      await expect(page.getByTestId("kpi-excess")).not.toContainText("+6.88%");

      const policy = page.locator(
        '[data-testid="benchmark-select"][data-benchmark="family-policy-55-35-10"]',
      );
      await policy.click();
      await expect(policy).toHaveAttribute("data-selected", "true");
      await expect(page.getByTestId("kpi-excess")).toContainText("+6.88%");
    });

    test("captures desktop evidence (1280x800)", async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await expect(page.getByTestId("growth-chart")).toBeVisible();
      await expect(page.getByTestId("benchmark-table")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "benchmark-desktop.png"),
        fullPage: true,
      });
    });

    test("captures mobile evidence (390x844)", async ({ page }) => {
      await page.setViewportSize(MOBILE);
      await expect(page.getByTestId("growth-chart")).toBeVisible();
      await expect(page.getByTestId("benchmark-table")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "benchmark-mobile.png"),
        fullPage: true,
      });
    });
  });
});
