import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m13-filter-scope-consistency");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

// Each test gets a fresh browser context (Playwright default), so localStorage
// starts empty and a persisted filter selection cannot leak between tests.

/**
 * Routes where the global tag filter does NOT apply (no holding-tag dimension):
 * the control must render but be visibly inert/disabled there. These are the
 * routes the registry marks `filterScope: "n/a"` and that host the shared
 * shell chrome (so the control is actually surfaced).
 */
const NA_SHELL_ROUTES = ["/#/ips", "/#/giving"];

/** Open the tag-filter popover from the current page. */
async function openFilter(page: Page): Promise<void> {
  await page.getByTestId("tag-filter").click();
  await expect(page.getByTestId("tag-filter-popover")).toBeVisible();
}

test.describe("tag-filter scope consistency (m13)", () => {
  test("the filter narrows where it applies (the dashboard)", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByTestId("networth-dashboard")).toBeVisible();

    // Active, enabled control on the holdings dashboard.
    const root = page.getByTestId("tag-filter-root");
    await expect(root).toHaveAttribute("data-applies", "true");
    await expect(page.getByTestId("tag-filter")).toBeEnabled();

    // Whole book up front, then narrow to the 5 collectible asset classes.
    await expect(page.getByTestId("asset-class-row")).toHaveCount(13);
    await openFilter(page);
    await page.locator('[data-tag="collectible"]').click();
    await expect(page.getByTestId("asset-class-row")).toHaveCount(5);
    await expect(page.getByTestId("tag-filter-summary")).toBeVisible();
    await expect(root).toHaveAttribute("data-filtering", "true");
  });

  for (const route of NA_SHELL_ROUTES) {
    test(`the filter is clearly inert/disabled on ${route}`, async ({
      page,
    }) => {
      await page.goto(route);

      // The control is present (consistency) but marked not-applicable...
      const root = page.getByTestId("tag-filter-root");
      await expect(root).toBeVisible();
      await expect(root).toHaveAttribute("data-applies", "false");

      // ...and the trigger is disabled with an explanatory tooltip.
      const trigger = page.getByTestId("tag-filter");
      await expect(trigger).toBeVisible();
      await expect(trigger).toBeDisabled();
      await expect(trigger).toHaveAttribute("data-applies", "false");
      await expect(trigger).toHaveAttribute("title", /tag filter/i);

      // Clicking the inert control never opens a popover.
      await trigger.click({ force: true }).catch(() => {
        /* disabled buttons reject clicks; that is the point */
      });
      await expect(page.getByTestId("tag-filter-popover")).toHaveCount(0);
    });
  }

  test("the active selection survives navigation onto an inert page", async ({
    page,
  }) => {
    // Filter on the dashboard...
    await page.goto("/");
    await openFilter(page);
    await page.locator('[data-tag="core"]').click();
    await expect(page.getByTestId("asset-class-row")).toHaveCount(2);

    // ...navigate to an n/a page: the control goes inert but the selection is
    // preserved (it still drives pages where the filter applies)...
    await page.goto("/#/ips");
    await expect(page.getByTestId("tag-filter-root")).toHaveAttribute(
      "data-applies",
      "false",
    );
    await expect(page.getByTestId("tag-filter")).toBeDisabled();

    // ...and back on the dashboard the filter is still active.
    await page.goto("/");
    await expect(page.getByTestId("asset-class-row")).toHaveCount(2);
    await expect(page.getByTestId("tag-filter-root")).toHaveAttribute(
      "data-filtering",
      "true",
    );
  });

  test("captures desktop evidence (1280x800)", async ({ page }) => {
    await page.setViewportSize(DESKTOP);

    // Applies: dashboard, filtered.
    await page.goto("/");
    await expect(page.getByTestId("networth-area")).toBeVisible();
    await openFilter(page);
    await page.locator('[data-tag="collectible"]').click();
    await expect(page.getByTestId("tag-filter-summary")).toBeVisible();
    await page.screenshot({
      path: join(EVIDENCE_DIR, "applies-dashboard-filtered-desktop.png"),
      fullPage: true,
    });

    // Inert: a shell page where the filter does not apply.
    await page.goto("/#/ips");
    await expect(page.getByTestId("tag-filter-root")).toHaveAttribute(
      "data-applies",
      "false",
    );
    await page.screenshot({
      path: join(EVIDENCE_DIR, "inert-ips-desktop.png"),
      fullPage: true,
    });
  });

  test("captures mobile evidence (390x844)", async ({ page }) => {
    await page.setViewportSize(MOBILE);

    await page.goto("/");
    await expect(page.getByTestId("networth-area")).toBeVisible();
    await openFilter(page);
    await page.locator('[data-tag="collectible"]').click();
    await expect(page.getByTestId("tag-filter-summary")).toBeVisible();
    await page.screenshot({
      path: join(EVIDENCE_DIR, "applies-dashboard-filtered-mobile.png"),
      fullPage: true,
    });

    await page.goto("/#/giving");
    await expect(page.getByTestId("tag-filter-root")).toHaveAttribute(
      "data-applies",
      "false",
    );
    await page.screenshot({
      path: join(EVIDENCE_DIR, "inert-giving-mobile.png"),
      fullPage: true,
    });
  });
});
