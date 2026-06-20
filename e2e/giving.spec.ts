import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m10-philanthropy");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

test.describe("charitable giving planner", () => {
  test("navigates from the dashboard to the planner and back", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();

    await page.getByTestId("nav-giving").click();
    await expect(page).toHaveURL(/#\/giving$/);
    await expect(
      page.getByRole("heading", { name: /charitable giving planner/i }),
    ).toBeVisible();
    await expect(page.getByTestId("giving-page")).toBeVisible();

    await page.getByTestId("giving-back").click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
  });

  test.describe("on the giving route", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/#/giving");
      await expect(page.getByTestId("giving-page")).toBeVisible();
    });

    test("renders the KPIs, in-kind spotlight, plan table and gift list", async ({
      page,
    }) => {
      await expect(page.getByTestId("kpi-gifted")).toContainText("$2.1M");
      await expect(page.getByTestId("kpi-cg-avoided")).toContainText("$316.5K");
      await expect(page.getByTestId("kpi-benefit")).toContainText("$1.1M");
      await expect(page.getByTestId("kpi-net-cost")).toBeVisible();

      const inkind = page.getByTestId("inkind-card");
      await expect(inkind).toBeVisible();
      await expect(inkind).toContainText(/ACME/);
      await expect(page.getByTestId("inkind-advantage")).toBeVisible();

      const planRows = page
        .getByTestId("plan-table")
        .getByTestId("plan-row");
      await expect(planRows).toHaveCount(4);
      await expect(planRows.first()).toHaveAttribute("data-year", "2026");

      const giftRows = page.getByTestId("gift-list").getByTestId("gift-row");
      await expect(giftRows).toHaveCount(5);
    });

    test("draws a benefit bar per year", async ({ page }) => {
      const bars = page
        .getByTestId("benefit-chart")
        .getByTestId("benefit-bar");
      await expect(bars).toHaveCount(4);
      await expect(bars.first().getByTestId("bar-income")).toBeVisible();
    });

    test("captures desktop evidence (1280x800)", async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await expect(page.getByTestId("plan-table")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "giving-desktop.png"),
        fullPage: true,
      });
    });

    test("captures mobile evidence (390x844)", async ({ page }) => {
      await page.setViewportSize(MOBILE);
      await expect(page.getByTestId("kpi-gifted")).toBeVisible();
      await expect(page.getByTestId("plan-table")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "giving-mobile.png"),
        fullPage: true,
      });
    });
  });
});
