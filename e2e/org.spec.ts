import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m5-orgchart");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

// Trace capture is required evidence for UI PRs; pin it at the file level so it
// holds independently of the shared playwright.config.ts `use` block.
test.use({ trace: "on" });

test.describe("org hierarchy", () => {
  test("navigates from the dashboard to the org chart and back", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();

    await page.getByTestId("nav-org").click();
    await expect(page).toHaveURL(/#\/org$/);
    await expect(
      page.getByRole("heading", { name: "Org hierarchy" }),
    ).toBeVisible();
    await expect(page.getByTestId("org-tree")).toBeVisible();

    await page.getByTestId("org-back").click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
  });

  test.describe("on the org route", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/#/org");
      await expect(page.getByTestId("org-tree")).toBeVisible();
    });

    test("draws a node per entity and an edge per ownership link", async ({
      page,
    }) => {
      // 8 entities in the fixture.
      await expect(page.getByTestId("org-node")).toHaveCount(8);
      // 7 ownership edges (8 nodes - 1 root).
      await expect(page.getByTestId("org-edge")).toHaveCount(7);
      // Edge labels include known ownership stakes.
      await expect(
        page.getByTestId("org-edge-label").filter({ hasText: "60%" }),
      ).toHaveCount(1);
      await expect(
        page.getByTestId("org-edge-label").filter({ hasText: "75%" }),
      ).toHaveCount(1);
    });

    test("clicking a node updates the detail panel with look-through", async ({
      page,
    }) => {
      // Click the deepest SPV.
      await page.locator('[data-entity-id="aurora-climate"]').click();
      const detail = page.getByTestId("org-detail");
      await expect(detail.getByText("Aurora Climate SPV")).toBeVisible();
      // Trust -> holdco 100% -> aurora 75% -> climate 50% = 37.5%.
      await expect(detail.getByTestId("lookthrough-row")).toContainText(
        "37.5%",
      );
      // Selected node is highlighted.
      await expect(
        page.locator('[data-entity-id="aurora-climate"]'),
      ).toHaveAttribute("data-selected", "true");
    });

    test("captures desktop evidence (1280x800)", async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      // Interact: select a mid-tree fund to exercise the detail panel.
      await page.locator('[data-entity-id="harbor"]').click();
      await expect(
        page.getByTestId("org-detail").getByText("Harbor Real Estate Fund"),
      ).toBeVisible();
      await expect(page.getByTestId("org-tree")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "org-desktop.png"),
        fullPage: true,
      });
    });

    test("captures mobile evidence (390x844)", async ({ page }) => {
      await page.setViewportSize(MOBILE);
      await expect(page.getByTestId("org-tree")).toBeVisible();
      await expect(page.getByTestId("org-detail")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "org-mobile.png"),
        fullPage: true,
      });
    });
  });
});
