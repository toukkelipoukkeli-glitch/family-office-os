import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m11-data-quality");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

test.describe("valuation staleness & data-quality monitor", () => {
  test("navigates from the dashboard to data quality and back", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();

    await page.getByTestId("nav-data-quality").click();
    await expect(page).toHaveURL(/#\/data-quality$/);
    await expect(
      page.getByRole("heading", { name: "Data-quality monitor" }),
    ).toBeVisible();
    await expect(page.getByTestId("dataquality-view")).toBeVisible();

    await page.getByTestId("dataquality-back").click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
  });

  test.describe("on the data-quality route", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/#/data-quality");
      await expect(page.getByTestId("dataquality-view")).toBeVisible();
    });

    test("shows the headline grade, summary stats and a freshness chart", async ({
      page,
    }) => {
      await expect(page.getByTestId("dq-grade")).toContainText("B");
      await expect(page.getByTestId("dq-grade")).toContainText("82");
      await expect(page.getByTestId("dq-stale")).toContainText("2");
      await expect(page.getByTestId("dq-missing")).toContainText("1");
      await expect(page.getByTestId("bar-chart").first()).toBeVisible();
      await expect(page.getByTestId("dq-status-legend")).toContainText("Stale");
    });

    test("lists every holding worst-first and drills into one", async ({
      page,
    }) => {
      await expect(page.getByTestId("dq-row")).toHaveCount(16);
      // Worst holding (unvalued angel) is first and selected by default.
      const first = page.getByTestId("dq-row").first();
      await expect(first).toHaveAttribute("data-holding-id", "hold-equity-angel");
      await expect(
        page.getByTestId("dq-detail").getByTestId("dq-detail-name"),
      ).toContainText("SeedCo Angel SAFE");

      // Click Apple's row -> detail panel switches to a fully-trusted number.
      await page.locator('[data-holding-id="hold-equity-aapl"]').click();
      await expect(
        page.getByTestId("dq-detail").getByTestId("dq-detail-name"),
      ).toContainText("Apple Inc.");
      await expect(page.getByTestId("dq-detail")).toContainText(
        "No issues",
      );
    });

    test("filters the table to the stale band", async ({ page }) => {
      await page.locator('[data-testid="dq-filter"][data-filter="stale"]').click();
      await expect(page.getByTestId("dq-row")).toHaveCount(2);
      for (const row of await page.getByTestId("dq-row").all()) {
        await expect(row).toHaveAttribute("data-status", "stale");
      }
    });

    test("shows an empty message for a band with no holdings", async ({
      page,
    }) => {
      await page.locator('[data-testid="dq-filter"][data-filter="aging"]').click();
      await expect(page.getByTestId("dq-row")).toHaveCount(0);
      await expect(page.getByTestId("dq-empty")).toBeVisible();
    });

    test("captures desktop evidence (1280x800)", async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await expect(page.getByTestId("bar-chart").first()).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "data-quality-desktop.png"),
        fullPage: true,
      });
    });

    test("captures desktop evidence with a stale holding selected", async ({
      page,
    }) => {
      await page.setViewportSize(DESKTOP);
      await page.locator('[data-holding-id="hold-art-bronze"]').click();
      await expect(
        page.getByTestId("dq-detail").getByTestId("dq-detail-name"),
      ).toContainText("Bronze Sculpture");
      await page.screenshot({
        path: join(EVIDENCE_DIR, "data-quality-desktop-selected.png"),
        fullPage: true,
      });
    });

    test("captures mobile evidence (390x844)", async ({ page }) => {
      await page.setViewportSize(MOBILE);
      await expect(page.getByTestId("dq-grade")).toBeVisible();
      await expect(page.getByTestId("dq-table")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "data-quality-mobile.png"),
        fullPage: true,
      });
    });
  });
});
