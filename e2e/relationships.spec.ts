import { existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m6-relationship-graph");
mkdirSync(EVIDENCE_DIR, { recursive: true });

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

/**
 * Per-platform screenshot baselines differ between macOS dev machines and the
 * Linux CI runner. We only hard-assert the visual snapshot when a baseline for
 * the current platform already exists; the first run writes it.
 */
function platformBaselineExists(name: string): boolean {
  const file = join(
    here,
    "relationships.spec.ts-snapshots",
    `${name}-chromium-${process.platform === "darwin" ? "darwin" : "linux"}.png`,
  );
  return existsSync(file);
}

test.describe("relationship graph", () => {
  test("navigates from the dashboard to the relationship graph and back", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();

    await page.getByTestId("nav-relationships").click();
    await expect(page).toHaveURL(/#\/relationships$/);
    await expect(
      page.getByRole("heading", { name: "Relationship graph" }),
    ).toBeVisible();
    await expect(page.getByTestId("relationship-graph")).toBeVisible();

    await page.getByTestId("relationships-back").click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
  });

  test.describe("on the relationships route", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/#/relationships");
      await expect(page.getByTestId("relationship-graph")).toBeVisible();
    });

    test("draws nodes, edges, stats and a legend", async ({ page }) => {
      const svg = page.getByTestId("relationship-graph");
      // 3 people + 4 companies + 2 deals + 5 contacts = 14 nodes.
      await expect(svg).toHaveAttribute("data-node-count", "14");
      await expect(page.getByTestId("relationship-node")).toHaveCount(14);
      // Edges must be drawn (ownership + subsidiary + deal-contact).
      const edgeCount = await page.getByTestId("relationship-edge").count();
      expect(edgeCount).toBeGreaterThan(0);
      // Four stat cards and a four-item legend.
      await expect(page.getByTestId("stat-card")).toHaveCount(4);
      await expect(page.getByTestId("legend-item")).toHaveCount(4);
    });

    test("selecting a node populates the detail panel", async ({ page }) => {
      const topco = page.locator(
        '[data-testid="relationship-node"][data-node-id="company:co-topco"]',
      );
      await topco.click();
      await expect(topco).toHaveAttribute("data-selected", "true");

      const panel = page.getByTestId("detail-panel");
      await expect(panel.getByTestId("detail-degree")).toHaveText(
        "4 direct connections",
      );
      await expect(panel.getByTestId("detail-neighbor")).toHaveCount(4);
    });

    test("captures desktop evidence (1280x800)", async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      // Select a node so the detail panel is populated in the screenshot.
      await page
        .locator(
          '[data-testid="relationship-node"][data-node-id="company:co-topco"]',
        )
        .click();
      await expect(page.getByTestId("relationship-graph")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "relationships-desktop.png"),
        fullPage: true,
      });
    });

    test("captures mobile evidence (390x844)", async ({ page }) => {
      await page.setViewportSize(MOBILE);
      await expect(page.getByTestId("relationship-graph")).toBeVisible();
      await expect(page.getByTestId("relationship-stats")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "relationships-mobile.png"),
        fullPage: true,
      });
    });

    test("visual snapshot of the graph is stable", async ({ page }) => {
      test.skip(
        !platformBaselineExists("relationship-graph"),
        "No screenshot baseline for this platform yet; run with --update-snapshots to create one.",
      );
      const svg = page.getByTestId("relationship-graph");
      await expect(svg).toHaveScreenshot("relationship-graph.png", {
        maxDiffPixelRatio: 0.02,
      });
    });
  });
});
