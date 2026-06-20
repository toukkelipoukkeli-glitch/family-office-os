import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m8-estate");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

test.describe("estate & succession planner", () => {
  test("navigates from the dashboard to the planner and back", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();

    await page.getByTestId("nav-estate").click();
    await expect(page).toHaveURL(/#\/estate$/);
    await expect(
      page.getByRole("heading", { name: /estate & succession planner/i }),
    ).toBeVisible();
    await expect(page.getByTestId("estate-page")).toBeVisible();

    await page.getByTestId("estate-back").click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
  });

  test.describe("on the estate route", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/#/estate");
      await expect(page.getByTestId("estate-page")).toBeVisible();
    });

    test("renders the KPIs, liquidity verdict, tax build-up and beneficiaries", async ({
      page,
    }) => {
      await expect(page.getByTestId("kpi-gross")).toBeVisible();
      await expect(page.getByTestId("kpi-taxable")).toBeVisible();
      await expect(page.getByTestId("kpi-tax")).toBeVisible();
      await expect(page.getByTestId("kpi-coverage")).toContainText("208%");

      const verdict = page.getByTestId("coverage-verdict");
      await expect(verdict).toBeVisible();
      await expect(verdict).toHaveAttribute("data-covered", "true");

      await expect(page.getByTestId("coverage-meter")).toBeVisible();
      await expect(page.getByTestId("tax-row-total")).toContainText(/\$4\.8M/);

      const beneficiaries = page
        .getByTestId("beneficiary-list")
        .getByTestId("beneficiary-row");
      await expect(beneficiaries).toHaveCount(4);
    });

    test("draws the settlement waterfall cash-first", async ({ page }) => {
      const rows = page
        .getByTestId("waterfall-table")
        .getByTestId("waterfall-row");
      await expect(rows.first()).toHaveAttribute("data-cls", "cash");
    });

    test("draws the succession flow with nodes and ribbons", async ({
      page,
    }) => {
      const flow = page.getByTestId("succession-flow");
      await expect(flow).toBeVisible();
      await expect(flow.getByTestId("flow-link").first()).toBeVisible();
      await expect(
        flow.locator('[data-testid="flow-node"][data-kind="estate"]'),
      ).toBeVisible();
      await expect(
        flow.locator('[data-testid="flow-node"][data-kind="tax"]'),
      ).toBeVisible();
    });

    test("captures desktop evidence (1280x800)", async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await expect(page.getByTestId("succession-flow")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "estate-desktop.png"),
        fullPage: true,
      });
    });

    test("captures mobile evidence (390x844)", async ({ page }) => {
      await page.setViewportSize(MOBILE);
      await expect(page.getByTestId("kpi-coverage")).toBeVisible();
      await expect(page.getByTestId("succession-flow")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "estate-mobile.png"),
        fullPage: true,
      });
    });
  });
});
