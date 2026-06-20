import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m9-risk-limits");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

test.describe("risk-limits cockpit", () => {
  test("navigates from the dashboard to the cockpit and back", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();

    await page.getByTestId("nav-risk").click();
    await expect(page).toHaveURL(/#\/risk$/);
    await expect(
      page.getByRole("heading", { name: "Risk-limits cockpit" }),
    ).toBeVisible();
    await expect(page.getByTestId("risk-cockpit-view")).toBeVisible();

    await page.getByTestId("risk-back").click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
  });

  test.describe("on the risk route", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/#/risk");
      await expect(page.getByTestId("risk-cockpit-view")).toBeVisible();
    });

    test("shows the breach banner, concentration bars and liquidity donut", async ({
      page,
    }) => {
      // Non-compliant banner with 4 breaches.
      const banner = page.getByTestId("risk-status-banner");
      await expect(banner).toHaveAttribute("data-compliant", "false");
      await expect(banner).toContainText("4 limit breaches");

      // One concentration bar per look-through asset class (6 classes).
      await expect(page.getByTestId("risk-conc-row")).toHaveCount(6);
      // The first (most concentrated) is real estate, breached.
      const top = page.getByTestId("risk-conc-row").first();
      await expect(top).toHaveAttribute("data-asset-class", "real_estate");
      await expect(top).toHaveAttribute("data-breached", "true");

      // Liquidity donut + three tiers.
      await expect(page.getByTestId("donut-chart")).toBeVisible();
      await expect(page.getByTestId("risk-liquidity-row")).toHaveCount(3);
    });

    test("lists exactly four breaches, the critical one first", async ({
      page,
    }) => {
      const rows = page.getByTestId("risk-breach-row");
      await expect(rows).toHaveCount(4);
      await expect(rows.first()).toHaveAttribute("data-severity", "critical");
      await expect(rows.first()).toHaveAttribute(
        "data-limit-id",
        "conc-real-estate",
      );
    });

    test("shows the risk-metrics panel", async ({ page }) => {
      const card = page.getByTestId("risk-metrics-card");
      await expect(card.getByText(/Volatility \(ann\.\)/i)).toBeVisible();
      await expect(card.getByText(/Max drawdown/i)).toBeVisible();
      await expect(card.getByText(/Sharpe ratio/i)).toBeVisible();
      await expect(card.getByText("1.29")).toBeVisible();
    });

    test("re-consolidates when the reporting root changes", async ({ page }) => {
      await page.getByTestId("risk-root-select").selectOption("harbor");
      // Harbor is a real-estate-only sub-tree: one concentration bar.
      await expect(page.getByTestId("risk-conc-row")).toHaveCount(1);
      await expect(page.getByTestId("risk-conc-row").first()).toHaveAttribute(
        "data-asset-class",
        "real_estate",
      );
    });

    test("captures desktop evidence (1280x800)", async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await expect(page.getByTestId("donut-chart")).toBeVisible();
      await expect(page.getByTestId("risk-conc-list")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "risk-desktop.png"),
        fullPage: true,
      });
    });

    test("captures mobile evidence (390x844)", async ({ page }) => {
      await page.setViewportSize(MOBILE);
      await expect(page.getByTestId("donut-chart")).toBeVisible();
      await expect(page.getByTestId("risk-conc-list")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "risk-mobile.png"),
        fullPage: true,
      });
    });
  });
});
