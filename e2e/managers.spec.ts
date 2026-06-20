import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m11-manager-scorecard");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

// The Playwright config records a trace for every test; make it explicit here so
// the UI-evidence requirement holds even if the global default changes.
test.use({ trace: "on" });

test.describe("manager / fund due-diligence scorecard", () => {
  test("navigates from the dashboard to managers and back", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();

    await page.getByTestId("nav-managers").click();
    await expect(page).toHaveURL(/#\/managers$/);
    await expect(
      page.getByRole("heading", { name: "Manager & fund scorecard" }),
    ).toBeVisible();
    await expect(page.getByTestId("managers-page")).toBeVisible();

    await page.getByTestId("managers-back").click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
  });

  test.describe("on the managers route", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/#/managers");
      await expect(page.getByTestId("managers-page")).toBeVisible();
    });

    test("ranks the roster and shows the top manager in detail", async ({
      page,
    }) => {
      await expect(page.getByTestId("roster-row")).toHaveCount(4);
      const first = page.getByTestId("roster-row").first();
      await expect(first).toHaveAttribute(
        "data-manager",
        "meridian-global-equity",
      );
      await expect(first).toHaveAttribute("data-selected", "true");
      await expect(page.getByTestId("detail-header")).toContainText(
        "Meridian Global Equity",
      );

      // KPIs and charts render.
      await expect(page.getByTestId("kpi-net")).toBeVisible();
      await expect(page.getByTestId("kpi-fee-drag")).toBeVisible();
      await expect(page.getByTestId("kpi-excess")).toBeVisible();
      await expect(page.getByTestId("kpi-info-ratio")).toBeVisible();

      const chart = page.getByTestId("growth-chart");
      await expect(chart).toBeVisible();
      await expect(chart.getByTestId("line-chart")).toHaveAttribute(
        "data-series",
        "3",
      );
      await expect(
        page.getByTestId("score-chart").getByTestId("bar-chart"),
      ).toBeVisible();
    });

    test("selecting a manager drills into its scorecard", async ({ page }) => {
      const aurora = page.locator(
        '[data-testid="roster-row"][data-manager="aurora-ventures"]',
      );
      await aurora.click();
      await expect(aurora).toHaveAttribute("data-selected", "true");
      await expect(page.getByTestId("detail-header")).toContainText(
        "Aurora Ventures",
      );
      // Aurora trails the benchmark net of fees → negative net excess.
      await expect(page.getByTestId("kpi-excess")).toContainText("-");
    });

    test("captures desktop evidence (1280x800)", async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await expect(page.getByTestId("roster-table")).toBeVisible();
      await expect(page.getByTestId("growth-chart")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "managers-desktop.png"),
        fullPage: true,
      });
    });

    test("captures mobile evidence (390x844)", async ({ page }) => {
      await page.setViewportSize(MOBILE);
      await expect(page.getByTestId("roster-table")).toBeVisible();
      await expect(page.getByTestId("growth-chart")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "managers-mobile.png"),
        fullPage: true,
      });
    });
  });
});
