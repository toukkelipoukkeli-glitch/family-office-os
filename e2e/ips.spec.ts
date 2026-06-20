import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m9-ips");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

test.describe("IPS / mandate compliance", () => {
  test("navigates from the dashboard to the IPS page and back", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();

    await page.getByTestId("nav-ips").click();
    await expect(page).toHaveURL(/#\/ips$/);
    await expect(
      page.getByRole("heading", { name: "IPS compliance" }),
    ).toBeVisible();
    await expect(page.getByTestId("ips-page")).toBeVisible();

    await page.getByTestId("ips-back").click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
  });

  test.describe("on the IPS route", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/#/ips");
      await expect(page.getByTestId("ips-page")).toBeVisible();
    });

    test("names the policy, benchmark and summarises breaches", async ({
      page,
    }) => {
      await expect(page.getByTestId("ips-policy-name")).toHaveText(
        "Ursin Family Office IPS 2026",
      );
      await expect(page.getByTestId("ips-benchmark")).toHaveText(
        "Balanced 60/40 policy",
      );
      await expect(page.getByTestId("summary-critical-value")).toHaveText("1");
      await expect(page.getByTestId("summary-warning-value")).toHaveText("2");
      await expect(page.getByTestId("summary-status-value")).toHaveText(
        "In breach",
      );

      // Default filter is "breaches": 3 rows, critical first.
      await expect(page.getByTestId("filter-breaches")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect(page.getByTestId("ips-row")).toHaveCount(3);

      const first = page.getByTestId("ips-row").first();
      await expect(first).toHaveAttribute("data-severity", "critical");
      await expect(first.getByTestId("ips-subject")).toHaveText("USD Cash");
      await expect(first.getByTestId("ips-weight")).toHaveText("86.8%");
      await expect(first.getByTestId("ips-detail")).toContainText("192,416");
    });

    test("toggles to show every constraint check including satisfied ones", async ({
      page,
    }) => {
      await page.getByTestId("filter-all").click();
      await expect(page.getByTestId("filter-all")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      // 9 checks total (see component test for the breakdown).
      await expect(page.getByTestId("ips-row")).toHaveCount(9);
      // A satisfied row (liquidity floor) is now present.
      await expect(
        page.getByTestId("ips-row").filter({ hasText: "Liquidity floor" }),
      ).toHaveCount(1);

      await page.getByTestId("filter-breaches").click();
      await expect(page.getByTestId("ips-row")).toHaveCount(3);
    });

    test("captures desktop evidence (1280x800)", async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await expect(page.getByTestId("ips-list")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "ips-desktop.png"),
        fullPage: true,
      });

      await page.getByTestId("filter-all").click();
      await expect(page.getByTestId("ips-row")).toHaveCount(9);
      await page.screenshot({
        path: join(EVIDENCE_DIR, "ips-desktop-all.png"),
        fullPage: true,
      });
    });

    test("captures mobile evidence (390x844)", async ({ page }) => {
      await page.setViewportSize(MOBILE);
      await expect(page.getByTestId("ips-summary")).toBeVisible();
      await expect(page.getByTestId("ips-list")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "ips-mobile.png"),
        fullPage: true,
      });
    });
  });
});
