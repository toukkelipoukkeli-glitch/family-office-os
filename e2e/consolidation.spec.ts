import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m11-entity-consolidation");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

test.describe("multi-entity consolidation", () => {
  test("navigates from the dashboard to consolidation and back", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();

    await page.getByTestId("nav-consolidation").click();
    await expect(page).toHaveURL(/#\/consolidation$/);
    await expect(
      page.getByRole("heading", { name: "Entity consolidation" }),
    ).toBeVisible();
    await expect(page.getByTestId("consolidation-view")).toBeVisible();

    await page.getByTestId("consolidation-back").click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
  });

  test.describe("on the consolidation route", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/#/consolidation");
      await expect(page.getByTestId("consolidation-view")).toBeVisible();
    });

    test("shows the four reconciliation KPIs", async ({ page }) => {
      await expect(page.getByTestId("cons-kpi-gross-value")).toContainText(
        "$46M",
      );
      await expect(
        page.getByTestId("cons-kpi-eliminations-value"),
      ).toContainText("−$4.9M");
      await expect(page.getByTestId("cons-kpi-minority-value")).toContainText(
        "−$12.2M",
      );
      await expect(
        page.getByTestId("cons-kpi-consolidated-value"),
      ).toContainText("$28.9M");
    });

    test("draws the bridge chart and the owned-NAV donut", async ({ page }) => {
      await expect(page.getByTestId("cons-bridge-chart")).toBeVisible();
      await expect(
        page.getByTestId("cons-bridge-chart").getByTestId("bar"),
      ).toHaveCount(4);
      await expect(page.getByTestId("cons-donut")).toBeVisible();
    });

    test("lists every entity and reconciles the table footer", async ({
      page,
    }) => {
      await expect(page.getByTestId("cons-entity-row")).toHaveCount(8);
      await expect(page.getByTestId("cons-entities-gross")).toContainText(
        "$46M",
      );
      await expect(page.getByTestId("cons-entities-minority")).toContainText(
        "$12.2M",
      );
    });

    test("lists each intercompany elimination and totals them", async ({
      page,
    }) => {
      await expect(page.getByTestId("cons-elim-row")).toHaveCount(5);
      const top = page.getByTestId("cons-elim-row").first();
      await expect(top).toHaveAttribute("data-holder-id", "holdco");
      await expect(top).toHaveAttribute("data-investee-id", "atlas");
      await expect(page.getByTestId("cons-elim-total")).toContainText("−$4.9M");
    });

    test("re-consolidates when the reporting root changes", async ({
      page,
    }) => {
      await page.getByTestId("cons-root-select").selectOption("holdco");
      // Trust drops out of scope: gross 46M − 1.5M = 44.5M, 4 eliminations.
      await expect(page.getByTestId("cons-kpi-gross-value")).toContainText(
        "$44.5M",
      );
      await expect(page.getByTestId("cons-elim-row")).toHaveCount(4);
      await expect(page.getByTestId("cons-entity-row")).toHaveCount(7);
    });

    test("captures desktop evidence (1280x800)", async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await expect(page.getByTestId("cons-bridge-chart")).toBeVisible();
      await expect(page.getByTestId("cons-donut")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "consolidation-desktop.png"),
        fullPage: true,
      });
    });

    test("captures desktop evidence after changing root", async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await page.getByTestId("cons-root-select").selectOption("holdco");
      await expect(page.getByTestId("cons-kpi-gross-value")).toContainText(
        "$44.5M",
      );
      await page.screenshot({
        path: join(EVIDENCE_DIR, "consolidation-desktop-holdco.png"),
        fullPage: true,
      });
    });

    test("captures mobile evidence (390x844)", async ({ page }) => {
      await page.setViewportSize(MOBILE);
      await expect(page.getByTestId("cons-bridge-chart")).toBeVisible();
      await expect(page.getByTestId("cons-entities-card")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "consolidation-mobile.png"),
        fullPage: true,
      });
    });
  });
});
