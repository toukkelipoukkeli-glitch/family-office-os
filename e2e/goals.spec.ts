import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m11-goal-funding");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

test.describe("goal & liability funding", () => {
  test("navigates from the dashboard to the funding page and back", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();

    await page.getByTestId("nav-goals").click();
    await expect(page).toHaveURL(/#\/goals$/);
    await expect(
      page.getByRole("heading", { name: /goal & liability funding/i }),
    ).toBeVisible();
    await expect(page.getByTestId("goals-page")).toBeVisible();

    await page.getByTestId("goals-back").click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
  });

  test.describe("on the goals route", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/#/goals");
      await expect(page.getByTestId("goals-page")).toBeVisible();
    });

    test("renders the KPIs, funded ratio and dedicated-vs-shortfall split", async ({
      page,
    }) => {
      await expect(page.getByTestId("kpi-target")).toBeVisible();
      await expect(page.getByTestId("kpi-dedicated")).toBeVisible();
      await expect(page.getByTestId("kpi-gap")).toBeVisible();
      await expect(page.getByTestId("kpi-funded-ratio")).toContainText("91%");

      await expect(page.getByTestId("split-bar")).toBeVisible();
      await expect(page.getByTestId("split-covered")).toBeVisible();
      await expect(page.getByTestId("split-shortfall")).toBeVisible();
      await expect(page.getByTestId("agg-ratio")).toContainText("91% funded");
    });

    test("renders one row per dated goal, ordered most-critical first", async ({
      page,
    }) => {
      const rows = page.getByTestId("goal-table").getByTestId("goal-row");
      await expect(rows).toHaveCount(5);
      // priority 1 spending floor (due 1y) is the first row.
      await expect(rows.first()).toHaveAttribute("data-goal-id", "g-spending");

      // The estate-tax reserve is deliberately short.
      const estate = page.locator('[data-goal-id="g-estate-tax"]');
      await expect(estate).toHaveAttribute("data-funded", "false");
      await expect(estate.getByTestId("goal-ratio")).toContainText("74%");

      // The school-fees goal is exactly funded.
      const school = page.locator('[data-goal-id="g-school"]');
      await expect(school).toHaveAttribute("data-funded", "true");
      await expect(school.getByTestId("goal-ratio")).toContainText("100%");
    });

    test("captures desktop evidence (1280x800)", async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await expect(page.getByTestId("goal-table")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "goals-desktop.png"),
        fullPage: true,
      });
    });

    test("captures mobile evidence (390x844)", async ({ page }) => {
      await page.setViewportSize(MOBILE);
      await expect(page.getByTestId("kpi-funded-ratio")).toBeVisible();
      await expect(page.getByTestId("split-bar")).toBeVisible();
      await expect(page.getByTestId("goal-table")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "goals-mobile.png"),
        fullPage: true,
      });
    });
  });
});
