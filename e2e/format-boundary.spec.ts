import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m13-format-boundary");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

// Pages whose money/percent rendering now flows through the shared
// `@/lib/format` render-boundary module. Each entry navigates by hash route and
// asserts a stable on-page marker, then we verify formatted strings still
// render exactly as before (compact `$x.xM`, whole `$x,xxx`, percent `x.x%`).
const PAGES: { route: string; testId: string; label: string }[] = [
  { route: "#/", testId: "networth-dashboard", label: "net worth" },
  { route: "#/fees", testId: "fees-page", label: "fees" },
  { route: "#/currency", testId: "currency-page", label: "currency" },
  { route: "#/liquidity", testId: "liquidity-page", label: "liquidity" },
  { route: "#/vault", testId: "vault-page", label: "vault" },
  { route: "#/stress", testId: "stress-page", label: "stress" },
  { route: "#/reports", testId: "reports-page", label: "reports" },
  { route: "#/privatemarkets", testId: "privatemarkets-page", label: "private markets" },
];

/** Compact currency, e.g. `$12.5M`, `€840K`, `$1.85B`. */
const COMPACT_MONEY = /[$€£¥][\d,]+(\.\d+)?[KMBT]/;
/** A percentage, e.g. `12.3%` / `+50.0%`. */
const PERCENT = /[-+]?\d[\d,]*(\.\d+)?%/;

test.describe("shared format render-boundary rollout", () => {
  test("every migrated page still renders compact money", async ({ page }) => {
    for (const p of PAGES) {
      await page.goto(p.route);
      await expect(
        page.getByTestId(p.testId),
        `${p.label} page mounts`,
      ).toBeVisible();
      const body = await page.locator("body").innerText();
      expect(body, `${p.label} renders compact money`).toMatch(COMPACT_MONEY);
    }
  });

  test("percent-bearing pages still render percentages", async ({ page }) => {
    const routes: { route: string; testId: string }[] = [
      { route: "#/fees", testId: "fees-page" },
      { route: "#/currency", testId: "currency-page" },
      { route: "#/reports", testId: "reports-page" },
      { route: "#/stress", testId: "stress-page" },
    ];
    for (const { route, testId } of routes) {
      await page.goto(route);
      await expect(page.getByTestId(testId)).toBeVisible();
      const body = await page.locator("body").innerText();
      expect(body, `${route} renders a percentage`).toMatch(PERCENT);
    }
  });

  test("captures desktop evidence (1280x800)", async ({ page }) => {
    await page.setViewportSize(DESKTOP);

    await page.goto("#/");
    await expect(page.getByTestId("networth-dashboard")).toBeVisible();
    await expect(page.getByTestId("networth-area")).toBeVisible();
    await page.screenshot({
      path: join(EVIDENCE_DIR, "networth-desktop.png"),
      fullPage: true,
    });

    await page.goto("#/currency");
    await expect(page.getByTestId("currency-page")).toBeVisible();
    await page.screenshot({
      path: join(EVIDENCE_DIR, "currency-desktop.png"),
      fullPage: true,
    });

    await page.goto("#/fees");
    await expect(page.getByTestId("fees-page")).toBeVisible();
    await page.screenshot({
      path: join(EVIDENCE_DIR, "fees-desktop.png"),
      fullPage: true,
    });
  });

  test("captures mobile evidence (390x844)", async ({ page }) => {
    await page.setViewportSize(MOBILE);

    await page.goto("#/");
    await expect(page.getByTestId("networth-dashboard")).toBeVisible();
    await page.screenshot({
      path: join(EVIDENCE_DIR, "networth-mobile.png"),
      fullPage: true,
    });

    await page.goto("#/currency");
    await expect(page.getByTestId("currency-page")).toBeVisible();
    await page.screenshot({
      path: join(EVIDENCE_DIR, "currency-mobile.png"),
      fullPage: true,
    });
  });
});
