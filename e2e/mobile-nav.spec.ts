import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdir } from "node:fs/promises";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m14-mobile-nav");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

/**
 * Unit m14-mobile-nav: the dashboard's registry-driven route nav holds ~40
 * links. Before the fix the nav row was a non-shrinking flex item, so at 390px
 * it forced the header — and therefore the document — wider than the viewport,
 * producing horizontal page overflow. The fix makes the nav a `min-w-0`,
 * `overflow-x-auto` self-contained horizontal scroller and pins the header
 * controls with `shrink-0`.
 *
 * Oracle: at 390x844 the document must not overflow horizontally
 * (`scrollWidth <= clientWidth`) on the dashboard and a couple of other pages,
 * while the nav links remain present and reachable. Desktop + mobile screenshots
 * and a trace are captured as visual-QA evidence.
 */
test.describe("m14 mobile nav — no horizontal overflow", () => {
  /** True when the document scrolls horizontally beyond the viewport. */
  async function hasHorizontalOverflow(page: import("@playwright/test").Page) {
    return page.evaluate(() => {
      const el = document.documentElement;
      // A 1px slack guards against sub-pixel rounding in layout; anything more
      // than that is a real overflow a user would see as a sideways scrollbar.
      return el.scrollWidth - el.clientWidth > 1;
    });
  }

  test("the dashboard does not overflow horizontally at 390px", async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
    // The nav itself still renders all its links — they are scrollable, not
    // dropped — so navigation is not lost on mobile.
    const nav = page.getByTestId("dashboard-nav");
    await expect(nav).toBeVisible();
    await expect(nav.locator('a[data-testid^="nav-"]')).toHaveCount(39);

    expect(await hasHorizontalOverflow(page)).toBe(false);
  });

  test("representative pages do not overflow horizontally at 390px", async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE);

    for (const path of ["/", "/#/home", "/#/reports", "/#/fees"]) {
      await page.goto(path);
      // Wait for the page's primary heading so layout has settled.
      await expect(page.locator("h1").first()).toBeVisible();
      expect(
        await hasHorizontalOverflow(page),
        `no horizontal overflow on ${path}`,
      ).toBe(false);
    }
  });

  test("the nav row is an internal horizontal scroller, not a page scroller", async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/");
    const nav = page.getByTestId("dashboard-nav");
    await expect(nav).toBeVisible();

    // The nav's own content is wider than its box (it scrolls internally), yet
    // the document does not overflow — proof the overflow is contained.
    const navScrolls = await nav.evaluate(
      (el) => el.scrollWidth > el.clientWidth,
    );
    expect(navScrolls).toBe(true);
    expect(await hasHorizontalOverflow(page)).toBe(false);

    // The last nav link can be scrolled into view inside the nav and clicked,
    // confirming the off-screen links remain reachable on mobile.
    const lastLink = nav.locator('a[data-testid^="nav-"]').last();
    await lastLink.scrollIntoViewIfNeeded();
    await expect(lastLink).toBeVisible();
  });

  test("desktop layout still shows the nav without page overflow (1280x800)", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
    await expect(page.getByTestId("dashboard-nav")).toBeVisible();
    expect(await hasHorizontalOverflow(page)).toBe(false);
  });

  test("captures desktop evidence (1280x800)", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await mkdir(EVIDENCE_DIR, { recursive: true });

    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
    await page.waitForTimeout(200);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "dashboard-desktop.png"),
      fullPage: true,
    });
  });

  test("captures mobile evidence (390x844)", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await mkdir(EVIDENCE_DIR, { recursive: true });

    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
    await page.waitForTimeout(200);
    // Header-only crop makes the nav-scroll behaviour easy to eyeball.
    await page.screenshot({
      path: join(EVIDENCE_DIR, "dashboard-mobile.png"),
      fullPage: true,
    });

    await page.goto("/#/reports");
    await expect(page.locator("h1").first()).toBeVisible();
    await page.waitForTimeout(200);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "reports-mobile.png"),
      fullPage: true,
    });
  });
});
