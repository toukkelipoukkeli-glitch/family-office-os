import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdir } from "node:fs/promises";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m15-mobile-overflow");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

/**
 * Unit m15-mobile-overflow: the standalone pages (`/charts`, `/risk`,
 * `/concentration`, `/data-quality`, `/ops`) had pre-existing horizontal page
 * overflow at mobile width (390px), flagged by m14-mobile-nav. Each page uses
 * the same `min-h-screen` + `<main class="mx-auto max-w-5xl px-6">` chrome, and
 * each held wide content — fixed-width SVG charts, a wide data table, or long
 * label/value rows — inside a single-column CSS grid whose default `auto` track
 * sized to its content's intrinsic (over-viewport) width. That intrinsic width
 * propagated up through `main`, pushing the whole document wider than the
 * viewport (a sideways scrollbar a mobile user would see).
 *
 * The fix:
 *   - chart SVGs (`bar`, `line`, `area`, `candlestick`, `donut`, `treemap`)
 *     carry `h-auto max-w-full` so they scale down to their container instead of
 *     forcing it wider;
 *   - the two-column `lg:grid-cols-[1fr_18rem]` layouts use
 *     `minmax(0,1fr)` and `min-w-0` grid items so the auto track can shrink
 *     below content size on mobile, letting the wide table scroll *inside* its
 *     `overflow-x-auto` wrapper rather than expanding the page;
 *   - the ops cockpit's grid cards + milestone rows gain `min-w-0` / `truncate`
 *     so long titles clip instead of stretching the row.
 *
 * Oracle: at 390x844 the document must not overflow horizontally
 * (`scrollWidth <= clientWidth`) on each of the five routes, while wide content
 * (the data-quality table) remains reachable via an internal scroller bounded to
 * the viewport. Desktop + mobile screenshots and a trace are captured as
 * visual-QA evidence.
 */
const ROUTES = [
  "/charts",
  "/risk",
  "/concentration",
  "/data-quality",
  "/ops",
] as const;

/** Horizontal page overflow in pixels (≤1px slack for sub-pixel rounding). */
async function pageOverflowPx(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const el = document.documentElement;
    return el.scrollWidth - el.clientWidth;
  });
}

test.describe("m15 mobile overflow — standalone pages", () => {
  for (const route of ROUTES) {
    test(`${route} does not overflow horizontally at 390px`, async ({
      page,
    }) => {
      await page.setViewportSize(MOBILE);
      await page.goto(`/#${route}`);
      await expect(page.locator("h1").first()).toBeVisible();
      // Let charts/tables lay out before measuring.
      await page.waitForTimeout(200);
      expect(
        await pageOverflowPx(page),
        `no horizontal page overflow on ${route}`,
      ).toBeLessThanOrEqual(1);
    });
  }

  test("the data-quality table scrolls inside a bounded container, not the page", async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/#/data-quality");
    await expect(page.locator("h1").first()).toBeVisible();
    await page.waitForTimeout(200);

    const scroller = page
      .locator('[data-testid="dq-table"]')
      .locator("xpath=ancestor::div[contains(@class,'overflow-x-auto')][1]");
    await expect(scroller).toBeVisible();

    const info = await scroller.evaluate((el) => ({
      clientW: el.clientWidth,
      scrollW: el.scrollWidth,
      right: Math.round(el.getBoundingClientRect().right),
    }));
    // The table is wider than its box (scrolls internally)…
    expect(info.scrollW).toBeGreaterThan(info.clientW);
    // …yet the scroll container itself stays within the 390px viewport.
    expect(info.right).toBeLessThanOrEqual(391);
    // …and the page as a whole does not overflow.
    expect(await pageOverflowPx(page)).toBeLessThanOrEqual(1);
  });

  test("desktop layout still renders the pages without page overflow (1280x800)", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    for (const route of ROUTES) {
      await page.goto(`/#${route}`);
      await expect(page.locator("h1").first()).toBeVisible();
      await page.waitForTimeout(100);
      expect(
        await pageOverflowPx(page),
        `no horizontal page overflow on ${route} (desktop)`,
      ).toBeLessThanOrEqual(1);
    }
  });

  test("captures desktop evidence (1280x800)", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await mkdir(EVIDENCE_DIR, { recursive: true });
    for (const route of ROUTES) {
      await page.goto(`/#${route}`);
      await expect(page.locator("h1").first()).toBeVisible();
      await page.waitForTimeout(200);
      await page.screenshot({
        path: join(EVIDENCE_DIR, `${route.replace(/\//g, "")}-desktop.png`),
        fullPage: true,
      });
    }
  });

  test("captures mobile evidence (390x844)", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await mkdir(EVIDENCE_DIR, { recursive: true });
    for (const route of ROUTES) {
      await page.goto(`/#${route}`);
      await expect(page.locator("h1").first()).toBeVisible();
      await page.waitForTimeout(200);
      await page.screenshot({
        path: join(EVIDENCE_DIR, `${route.replace(/\//g, "")}-mobile.png`),
        fullPage: true,
      });
    }
  });
});
