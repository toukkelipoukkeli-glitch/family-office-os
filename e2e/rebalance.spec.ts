import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m10-rebalance");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

test.describe("Tax-aware rebalancing proposal", () => {
  test("navigates from the dashboard to the rebalance page and back", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();

    await page.getByTestId("nav-rebalance").click();
    await expect(page).toHaveURL(/#\/rebalance$/);
    await expect(
      page.getByRole("heading", { name: "Rebalancing proposal" }),
    ).toBeVisible();
    await expect(page.getByTestId("rebalance-page")).toBeVisible();

    await page.getByTestId("rebalance-back").click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
  });

  test.describe("on the rebalance route", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/#/rebalance");
      await expect(page.getByTestId("rebalance-page")).toBeVisible();
    });

    test("summarises the proposal under the default HIFO method", async ({
      page,
    }) => {
      await expect(page.getByTestId("rebalance-method")).toHaveText("HIFO");
      await expect(page.getByTestId("summary-sold-value")).toHaveText(
        "$16,000.00",
      );
      await expect(page.getByTestId("summary-bought-value")).toHaveText(
        "$16,000.00",
      );
      await expect(page.getByTestId("summary-tax-value")).toHaveText("$160.00");
      await expect(page.getByTestId("realized-gain")).toHaveText("+$1,600.00");
      await expect(page.getByTestId("realized-short")).toHaveText("$1,600.00");

      // One sell + two buys.
      await expect(page.getByTestId("trade-row")).toHaveCount(3);
      const sell = page
        .getByTestId("trade-row")
        .filter({ has: page.getByTestId("trade-side").filter({ hasText: "Sell" }) });
      await expect(sell).toHaveCount(1);
      await expect(sell.getByTestId("trade-name")).toHaveText("Apple Inc.");
      await expect(sell.getByTestId("trade-gain")).toHaveText("+$1,600.00");

      // Reconciles to target.
      await expect(page.getByTestId("reconcile-status")).toHaveAttribute(
        "data-reconciles",
        "true",
      );
    });

    test("toggling to FIFO realises a larger long-term gain", async ({
      page,
    }) => {
      await expect(page.getByTestId("realized-long")).toHaveText("$0.00");
      await page.getByTestId("method-fifo").click();
      await expect(page.getByTestId("rebalance-method")).toHaveText("FIFO");
      await expect(page.getByTestId("method-fifo")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect(page.getByTestId("realized-long")).toHaveText("$8,000.00");
      await expect(page.getByTestId("realized-short")).toHaveText("$0.00");

      await page.getByTestId("method-hifo").click();
      await expect(page.getByTestId("rebalance-method")).toHaveText("HIFO");
      await expect(page.getByTestId("realized-short")).toHaveText("$1,600.00");
    });

    test("captures desktop evidence (1280x800)", async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await expect(page.getByTestId("trade-list")).toBeVisible();
      await expect(page.getByTestId("allocation-list")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "rebalance-desktop.png"),
        fullPage: true,
      });

      // Capture the FIFO comparison too.
      await page.getByTestId("method-fifo").click();
      await expect(page.getByTestId("realized-long")).toHaveText("$8,000.00");
      await page.screenshot({
        path: join(EVIDENCE_DIR, "rebalance-desktop-fifo.png"),
        fullPage: true,
      });
    });

    test("captures mobile evidence (390x844)", async ({ page }) => {
      await page.setViewportSize(MOBILE);
      await expect(page.getByTestId("rebalance-summary")).toBeVisible();
      await expect(page.getByTestId("trade-list")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "rebalance-mobile.png"),
        fullPage: true,
      });
    });
  });
});
