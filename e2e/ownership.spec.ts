import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m5-ownership-graph");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

/**
 * Per-platform screenshot baselines differ between macOS dev machines and the
 * Linux CI runner. We only hard-assert the visual snapshot when a baseline for
 * the current platform exists; the first run writes it.
 */
function platformBaselineExists(name: string): boolean {
  const file = join(
    here,
    "ownership.spec.ts-snapshots",
    `${name}-chromium-${process.platform === "darwin" ? "darwin" : "linux"}.png`,
  );
  return existsSync(file);
}

test.describe("ownership network graph", () => {
  test("navigates from the dashboard to the ownership graph and back", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();

    await page.getByTestId("nav-ownership").click();
    await expect(page).toHaveURL(/#\/ownership$/);
    await expect(
      page.getByRole("heading", { name: "Ownership graph" }),
    ).toBeVisible();
    await expect(page.getByTestId("ownership-network")).toBeVisible();

    await page.getByTestId("ownership-back").click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
  });

  test.describe("on the ownership route", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/#/ownership");
      await expect(page.getByTestId("ownership-network")).toBeVisible();
    });

    test("draws every node and edge of the cross-holding graph", async ({
      page,
    }) => {
      const svg = page.getByTestId("ownership-network");
      await expect(svg).toHaveAttribute("data-node-count", "4");
      // Cross-holding fixture: 4 subsidiary edges (incl. the shared child).
      await expect(svg).toHaveAttribute("data-edge-count", "4");
      await expect(page.getByTestId("ownership-node")).toHaveCount(4);
      await expect(page.getByTestId("ownership-edge")).toHaveCount(4);
    });

    test("shows the root entity selected with 100% look-through by default", async ({
      page,
    }) => {
      const detail = page.getByTestId("ownership-detail");
      await expect(detail.getByTestId("detail-name")).toHaveText(
        "Ursin Holdings Oy",
      );
      await expect(detail.getByTestId("detail-effective")).toContainText(
        "100%",
      );
    });

    test("selecting the cross-held operating company shows both owners", async ({
      page,
    }) => {
      // Click the operating-company node.
      await page.locator('[data-node-id="co-opco"]').first().click();

      const detail = page.getByTestId("ownership-detail");
      await expect(detail.getByTestId("detail-name")).toHaveText(
        "Acme Operating Ltd",
      );
      // 75%*50% + 100%*30% = 67.5% effective from the top holding company.
      await expect(detail.getByTestId("detail-effective")).toContainText(
        "67.5%",
      );
      await expect(page.getByTestId("detail-owner")).toHaveCount(2);
    });

    test("captures desktop evidence (1280x800)", async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await expect(page.getByTestId("ownership-network")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "ownership-desktop.png"),
        fullPage: true,
      });
    });

    test("captures desktop evidence with a node selected", async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await page.locator('[data-node-id="co-opco"]').first().click();
      await expect(
        page.getByTestId("ownership-detail").getByTestId("detail-name"),
      ).toHaveText("Acme Operating Ltd");
      await page.screenshot({
        path: join(EVIDENCE_DIR, "ownership-desktop-selected.png"),
        fullPage: true,
      });
    });

    test("captures mobile evidence (390x844)", async ({ page }) => {
      await page.setViewportSize(MOBILE);
      await expect(page.getByTestId("ownership-network")).toBeVisible();
      await expect(page.getByTestId("ownership-detail")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "ownership-mobile.png"),
        fullPage: true,
      });
    });

    test("visual snapshot of the graph is stable", async ({ page }) => {
      test.skip(
        !platformBaselineExists("ownership-graph"),
        "No screenshot baseline for this platform yet; run with --update-snapshots to create one.",
      );
      const card = page.getByTestId("ownership-graph-card");
      await expect(card).toHaveScreenshot("ownership-graph.png", {
        maxDiffPixelRatio: 0.02,
      });
    });
  });
});
