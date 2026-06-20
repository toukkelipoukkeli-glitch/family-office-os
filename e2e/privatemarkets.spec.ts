import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m9-pe-lifecycle");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

test.describe("private-markets commitments page", () => {
  test("navigates from the dashboard to the page and back", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();

    await page.getByTestId("nav-privatemarkets").click();
    await expect(page).toHaveURL(/#\/privatemarkets$/);
    await expect(
      page.getByRole("heading", { name: /private-markets commitments/i }),
    ).toBeVisible();
    await expect(page.getByTestId("privatemarkets-page")).toBeVisible();

    await page.getByTestId("privatemarkets-back").click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
  });

  test.describe("on the private-markets route", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/#/privatemarkets");
      await expect(page.getByTestId("privatemarkets-page")).toBeVisible();
    });

    test("renders the KPIs, J-curve, bar chart and commitment table", async ({
      page,
    }) => {
      // KPIs
      await expect(page.getByTestId("kpi-committed")).toBeVisible();
      await expect(page.getByTestId("kpi-paidin")).toBeVisible();
      await expect(page.getByTestId("kpi-distributed")).toBeVisible();
      await expect(page.getByTestId("kpi-unfunded")).toBeVisible();
      await expect(page.getByTestId("kpi-tvpi")).toBeVisible();
      await expect(page.getByTestId("kpi-irr")).toBeVisible();

      // J-curve line chart + drawdown summary.
      await expect(page.getByTestId("line-chart")).toBeVisible();
      await expect(page.getByTestId("jcurve-summary")).toBeVisible();

      // Per-fund bar chart: one bar per seeded commitment (3).
      const bar = page.getByTestId("bar-chart");
      await expect(bar).toBeVisible();
      await expect(bar).toHaveAttribute("data-bars", "3");

      // Commitment table: 3 rows, largest committed first.
      await expect(page.getByTestId("privatemarkets-row")).toHaveCount(3);
      const firstRow = page.getByTestId("privatemarkets-row").first();
      await expect(firstRow).toHaveAttribute("data-fund", "pe-buyout-2017");
    });
  });

  test("captures desktop evidence (1280x800)", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/");
    await page.getByTestId("nav-privatemarkets").click();
    await expect(page.getByTestId("privatemarkets-page")).toBeVisible();
    await expect(page.getByTestId("line-chart")).toBeVisible();
    await expect(page.getByTestId("bar-chart")).toBeVisible();
    await expect(page.getByTestId("privatemarkets-table")).toBeVisible();
    await page.waitForTimeout(150);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "privatemarkets-desktop.png"),
      fullPage: true,
    });
  });

  test("captures mobile evidence (390x844)", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/#/privatemarkets");
    await expect(page.getByTestId("privatemarkets-page")).toBeVisible();
    await expect(page.getByTestId("line-chart")).toBeVisible();
    await expect(page.getByTestId("bar-chart")).toBeVisible();
    await page.waitForTimeout(150);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "privatemarkets-mobile.png"),
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
    await page.getByTestId("nav-privatemarkets").click();
    await expect(page.getByTestId("privatemarkets-page")).toBeVisible();
    await expect(page.getByTestId("line-chart")).toBeVisible();
    await expect(page.getByTestId("bar-chart")).toBeVisible();
    await expect(page.getByTestId("privatemarkets-table")).toBeVisible();
    await page.getByTestId("privatemarkets-back").click();
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
  });
});
