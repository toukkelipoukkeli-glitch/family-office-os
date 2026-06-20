import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m13-holdings-index");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

// The Playwright config records a trace for every test; make it explicit here so
// the UI-evidence requirement holds even if the global default changes.
test.use({ trace: "on" });

test.describe("global holdings index (/holdings)", () => {
  test("navigates from the dashboard to holdings and back", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();

    await page.getByTestId("nav-holdings").click();
    await expect(page).toHaveURL(/#\/holdings/);
    await expect(
      page.getByRole("heading", { name: "Holdings", exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("holdings-table")).toBeVisible();

    await page.getByTestId("holdings-back").click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
  });

  test.describe("on the holdings route", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/#/holdings");
      await expect(page.getByTestId("holdings-table")).toBeVisible();
    });

    test("lists every holding, largest by value first", async ({ page }) => {
      await expect(page.getByTestId("holdings-row")).toHaveCount(14);
      const first = page.getByTestId("holdings-row").first();
      await expect(first).toHaveAttribute("data-holding", "hold-vineyard-tuscany");
      await expect(page.getByTestId("stat-count")).toContainText("14");
    });

    test("searches the book by name", async ({ page }) => {
      await page.getByTestId("holdings-search").fill("apple");
      await expect(page.getByTestId("holdings-row")).toHaveCount(1);
      await expect(page.getByTestId("holdings-row").first()).toHaveAttribute(
        "data-holding",
        "hold-equity-aapl",
      );
      // The search persists to the URL for deep-linking.
      await expect(page).toHaveURL(/q=apple/);
    });

    test("shows an empty state when nothing matches", async ({ page }) => {
      await page.getByTestId("holdings-search").fill("zzz-no-match");
      await expect(page.getByTestId("holdings-row")).toHaveCount(0);
      await expect(page.getByTestId("holdings-empty")).toBeVisible();
    });

    test("narrows by an asset-class facet chip", async ({ page }) => {
      await page.getByTestId("facet-class-cash").click();
      await expect(page.getByTestId("holdings-row")).toHaveCount(2);
    });

    test("toggles the sort direction on a column header", async ({ page }) => {
      const firstName = async () =>
        (await page
          .getByTestId("holdings-row")
          .first()
          .getAttribute("data-holding")) ?? "";

      await page.getByTestId("sort-name").click();
      const asc = await firstName();
      await page.getByTestId("sort-name").click();
      const desc = await firstName();
      expect(asc).not.toBe(desc);
      await expect(page).toHaveURL(/sort=name/);
    });

    test("clears all active filters", async ({ page }) => {
      await page.getByTestId("holdings-search").fill("apple");
      await expect(page.getByTestId("holdings-row")).toHaveCount(1);
      await page.getByTestId("holdings-clear").click();
      await expect(page.getByTestId("holdings-row")).toHaveCount(14);
    });

    test("exposes CSV and JSON export controls", async ({ page }) => {
      await expect(page.getByTestId("holdings-export-csv")).toBeVisible();
      await expect(page.getByTestId("holdings-export-json")).toBeVisible();
    });

    test("captures desktop evidence (1280x800)", async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await expect(page.getByTestId("holdings-table")).toBeVisible();
      await expect(page.getByTestId("holdings-summary")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "holdings-desktop.png"),
        fullPage: true,
      });
    });

    test("captures mobile evidence (390x844)", async ({ page }) => {
      await page.setViewportSize(MOBILE);
      await expect(page.getByTestId("holdings-table")).toBeVisible();
      await expect(page.getByTestId("holdings-summary")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "holdings-mobile.png"),
        fullPage: true,
      });
    });
  });
});
