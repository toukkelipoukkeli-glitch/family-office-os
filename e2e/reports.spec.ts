import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m9-reporting");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

test.describe("board report page", () => {
  test("navigates from the dashboard to the reports page and back", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();

    await page.getByTestId("nav-reports").click();
    await expect(page).toHaveURL(/#\/reports$/);
    await expect(
      page.getByRole("heading", { name: /board report/i }),
    ).toBeVisible();
    await expect(page.getByTestId("reports-page")).toBeVisible();

    await page.getByTestId("reports-back").click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
  });

  test.describe("on the reports route", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/#/reports");
      await expect(page.getByTestId("reports-page")).toBeVisible();
    });

    test("renders the KPI strip, charts, and every section", async ({
      page,
    }) => {
      // KPI strip: seven headline metrics.
      await expect(page.getByTestId("kpi-strip")).toBeVisible();
      for (const key of [
        "net-worth",
        "twr",
        "excess-return",
        "info-ratio",
        "policy-breaches",
        "fee-rate",
        "pe-tvpi",
      ]) {
        await expect(page.getByTestId(`kpi-${key}`)).toBeVisible();
      }

      // Net-worth line chart + allocation rows.
      await expect(page.getByTestId("line-chart")).toBeVisible();
      await expect(page.getByTestId("allocation-row").first()).toBeVisible();

      // Policy / benchmark / attribution / fees / PE sections.
      await expect(page.getByTestId("policy-status")).toBeVisible();
      await expect(page.getByTestId("benchmark-stats")).toBeVisible();
      await expect(page.getByTestId("bar-chart")).toBeVisible();
      await expect(page.getByTestId("bar-chart")).toHaveAttribute(
        "data-bars",
        "5",
      );
      await expect(page.getByTestId("attribution-row")).toHaveCount(5);
      await expect(page.getByTestId("fees-stats")).toBeVisible();
      await expect(page.getByTestId("pe-stats")).toBeVisible();
    });

    test("toggles the deterministic Markdown export", async ({ page }) => {
      await expect(page.getByTestId("export-markdown")).toHaveCount(0);
      await page.getByTestId("toggle-export").click();
      const pre = page.getByTestId("export-markdown");
      await expect(pre).toBeVisible();
      await expect(pre).toContainText("# Board Report");
      await expect(pre).toContainText("## Private markets (PE)");
      await page.getByTestId("toggle-export").click();
      await expect(page.getByTestId("export-markdown")).toHaveCount(0);
    });
  });

  test("captures desktop evidence (1280x800)", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/");
    await page.getByTestId("nav-reports").click();
    await expect(page.getByTestId("reports-page")).toBeVisible();
    await expect(page.getByTestId("line-chart")).toBeVisible();
    await expect(page.getByTestId("bar-chart")).toBeVisible();
    await page.waitForTimeout(200);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "reports-desktop.png"),
      fullPage: true,
    });

    // Also capture the export panel open.
    await page.getByTestId("toggle-export").click();
    await expect(page.getByTestId("export-markdown")).toBeVisible();
    await page.waitForTimeout(150);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "reports-export-desktop.png"),
      fullPage: true,
    });
  });

  test("captures mobile evidence (390x844)", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/#/reports");
    await expect(page.getByTestId("reports-page")).toBeVisible();
    await expect(page.getByTestId("line-chart")).toBeVisible();
    await expect(page.getByTestId("bar-chart")).toBeVisible();
    await page.waitForTimeout(200);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "reports-mobile.png"),
      fullPage: true,
    });
  });

  // The config records a Playwright trace for every test (`trace: "on"`); the
  // trace for this walkthrough is copied from `test-results/` into the
  // committed evidence dir (e2e/evidence/m9-reporting/reports-trace.zip).
  test("walks through the dashboard nav into the reports page (traced)", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/");
    await page.getByTestId("nav-reports").click();
    await expect(page.getByTestId("reports-page")).toBeVisible();
    await expect(page.getByTestId("kpi-strip")).toBeVisible();
    await expect(page.getByTestId("line-chart")).toBeVisible();
    await expect(page.getByTestId("attribution-table")).toBeVisible();
    await page.getByTestId("toggle-export").click();
    await expect(page.getByTestId("export-markdown")).toBeVisible();
    await page.getByTestId("reports-back").click();
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
  });
});
