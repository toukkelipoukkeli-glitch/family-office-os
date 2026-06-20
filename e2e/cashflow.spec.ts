import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m7-cashflow");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

test.describe("cashflow & liquidity runway", () => {
  test("navigates from the dashboard to the cashflow page and back", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();

    await page.getByTestId("nav-cashflow").click();
    await expect(page).toHaveURL(/#\/cashflow$/);
    await expect(
      page.getByRole("heading", { name: /cashflow & liquidity runway/i }),
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

    test("renders the KPIs, runway chart and flow table", async ({ page }) => {
      await expect(page.getByTestId("kpi-opening")).toBeVisible();
      await expect(page.getByTestId("kpi-runway")).toBeVisible();
      await expect(page.getByTestId("kpi-lowest")).toBeVisible();
      await expect(page.getByTestId("kpi-ending")).toBeVisible();

      const chart = page.getByTestId("runway-chart");
      await expect(chart).toBeVisible();
      // 12 periods + opening point.
      await expect(chart).toHaveAttribute("data-points", "13");
      await expect(chart).toHaveAttribute("data-exhausted", "false");
      // A horizontal <line> has a zero-height box (Playwright treats it as
      // "hidden"), so assert it is attached rather than visible.
      await expect(page.getByTestId("runway-zero-line")).toBeAttached();
      await expect(page.getByTestId("runway-line")).toBeAttached();

      // Base case holds across the horizon.
      await expect(page.getByTestId("kpi-runway")).toContainText(/12\+ months/);
      await expect(page.getByTestId("runway-summary")).toContainText(/holds/i);

      // Flow table has 12 rows.
      await expect(page.getByTestId("flow-row")).toHaveCount(12);
    });

    test("switching to the thin-buffer scenario reveals the depletion marker", async ({
      page,
    }) => {
      await page.getByTestId("scenario-tight").click();
      await expect(page.getByTestId("scenario-tight")).toHaveAttribute(
        "data-selected",
        "true",
      );

      const chart = page.getByTestId("runway-chart");
      await expect(chart).toHaveAttribute("data-exhausted", "true");
      await expect(page.getByTestId("runway-depletion")).toBeVisible();
      await expect(page.getByTestId("runway-summary")).toContainText(
        /runs out/i,
      );

      // Some breached rows now exist in the table.
      const breached = page.locator(
        '[data-testid="flow-row"][data-breached="true"]',
      );
      await expect(breached.first()).toBeVisible();
    });

    test("captures desktop evidence (1280x800)", async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await expect(page.getByTestId("runway-chart")).toBeVisible();
      await expect(page.getByTestId("flow-table")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "cashflow-desktop.png"),
        fullPage: true,
      });

      // Also capture the depleting thin-buffer state.
      await page.getByTestId("scenario-tight").click();
      await expect(page.getByTestId("runway-chart")).toHaveAttribute(
        "data-exhausted",
        "true",
      );
      await expect(page.getByTestId("runway-depletion")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "cashflow-desktop-tight.png"),
        fullPage: true,
      });
    });

    test("captures mobile evidence (390x844)", async ({ page }) => {
      await page.setViewportSize(MOBILE);
      await expect(page.getByTestId("runway-chart")).toBeVisible();
      await expect(page.getByTestId("kpi-runway")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "cashflow-mobile.png"),
        fullPage: true,
      });
    });
  });
});
