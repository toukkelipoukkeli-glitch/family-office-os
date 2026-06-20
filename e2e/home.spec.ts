import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m10-home");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

test.describe("executive home overview", () => {
  test("navigates from the dashboard to the overview and back", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();

    await page.getByTestId("nav-home").click();
    await expect(page).toHaveURL(/#\/home$/);
    await expect(
      page.getByRole("heading", { name: "Executive overview" }),
    ).toBeVisible();
    await expect(page.getByTestId("home-overview")).toBeVisible();

    await page.getByTestId("home-back").click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
  });

  test.describe("on the home route", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/#/home");
      await expect(page.getByTestId("home-overview")).toBeVisible();
    });

    test("renders six headline KPI tiles in cockpit order", async ({ page }) => {
      const tiles = page.getByTestId("home-kpi");
      await expect(tiles).toHaveCount(6);
      await expect(tiles.nth(0)).toHaveAttribute("data-kpi", "net-worth");
      await expect(tiles.nth(1)).toHaveAttribute("data-kpi", "twr");
      await expect(tiles.nth(2)).toHaveAttribute("data-kpi", "volatility");
      await expect(tiles.nth(3)).toHaveAttribute("data-kpi", "ips");
      await expect(tiles.nth(4)).toHaveAttribute("data-kpi", "liquidity");
      await expect(tiles.nth(5)).toHaveAttribute("data-kpi", "alerts");
    });

    test("shows the real seeded net worth, TWR and a critical banner", async ({
      page,
    }) => {
      const nw = page.getByTestId("home-kpi").filter({ hasText: "Net worth" });
      await expect(nw.getByTestId("home-kpi-value")).toHaveText("$7.22M");

      const twr = page.getByTestId("home-kpi").filter({ hasText: "TWR" });
      await expect(twr.getByTestId("home-kpi-value")).toHaveText("+16.27%");

      const banner = page.getByTestId("home-status-banner");
      await expect(banner).toHaveAttribute("data-status", "critical");
      await expect(page.getByTestId("home-open-breaches")).toHaveText("10");
    });

    test("draws the net-worth trend sparkline", async ({ page }) => {
      await expect(page.getByTestId("sparkline")).toBeVisible();
    });

    test("drills from the risk tile into the risk cockpit", async ({ page }) => {
      await page.locator('[data-kpi="volatility"]').click();
      await expect(page).toHaveURL(/#\/risk$/);
      await expect(
        page.getByRole("heading", { name: "Risk-limits cockpit" }),
      ).toBeVisible();
    });

    test("drills from the alerts tile into the alerts page", async ({
      page,
    }) => {
      await page.locator('[data-kpi="alerts"]').click();
      await expect(page).toHaveURL(/#\/alerts$/);
    });

    test("captures desktop evidence (1280x800)", async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await expect(page.getByTestId("home-kpi-grid")).toBeVisible();
      await expect(page.getByTestId("home-kpi")).toHaveCount(6);
      await page.screenshot({
        path: join(EVIDENCE_DIR, "home-desktop.png"),
        fullPage: true,
      });
    });

    test("captures mobile evidence (390x844)", async ({ page }) => {
      await page.setViewportSize(MOBILE);
      await expect(page.getByTestId("home-kpi-grid")).toBeVisible();
      await expect(page.getByTestId("home-kpi")).toHaveCount(6);
      await page.screenshot({
        path: join(EVIDENCE_DIR, "home-mobile.png"),
        fullPage: true,
      });
    });
  });
});
