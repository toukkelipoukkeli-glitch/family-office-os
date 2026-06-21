import { existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m15-home-currency");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

/** Set the global reporting currency from the dashboard switcher. */
async function setCurrency(page: Page, code: string): Promise<void> {
  await page.goto("/");
  const select = page.getByTestId("reporting-currency");
  await expect(select).toBeVisible();
  await select.selectOption(code);
  await expect(select).toHaveValue(code);
}

/**
 * m15-home-currency — committed visual + trace evidence for the executive
 * overview re-expressing in the reporting currency.
 *
 * The global config sets `trace: "on"` (auto-traces into the gitignored
 * test-results/). Disabling that fixture at file scope lets this test own the
 * tracing lifecycle and write a committed trace zip into the evidence dir,
 * mirroring `a11y-trace.spec.ts`.
 */
test.use({ trace: "off" });

test("captures desktop (USD + EUR) and mobile (EUR) evidence with a trace", async ({
  page,
}) => {
  if (!existsSync(EVIDENCE_DIR)) mkdirSync(EVIDENCE_DIR, { recursive: true });
  await page.context().tracing.start({ screenshots: true, snapshots: true });
  try {
    // Desktop USD baseline.
    await page.setViewportSize(DESKTOP);
    await setCurrency(page, "USD");
    await page.goto("/#/home");
    await expect(page.getByTestId("home-kpi-grid")).toBeVisible();
    await page.screenshot({
      path: join(EVIDENCE_DIR, "home-usd-desktop.png"),
      fullPage: true,
    });

    // Desktop EUR re-expression of the same overview.
    await setCurrency(page, "EUR");
    await page.goto("/#/home");
    await expect(
      page
        .getByTestId("home-kpi")
        .filter({ hasText: "Net worth" })
        .getByTestId("home-kpi-value"),
    ).toContainText(/€|EUR/);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "home-eur-desktop.png"),
      fullPage: true,
    });

    // Mobile EUR re-expression, set from the mobile switcher.
    await page.setViewportSize(MOBILE);
    await page.goto("/");
    const mobileSwitcher = page.getByTestId("reporting-currency-mobile");
    await expect(mobileSwitcher).toBeVisible();
    await mobileSwitcher.selectOption("EUR");
    await page.goto("/#/home");
    await expect(page.getByTestId("home-kpi-grid")).toBeVisible();
    await expect(
      page
        .getByTestId("home-kpi")
        .filter({ hasText: "Net worth" })
        .getByTestId("home-kpi-value"),
    ).toContainText(/€|EUR/);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "home-eur-mobile.png"),
      fullPage: true,
    });
  } finally {
    await page.context().tracing.stop({
      path: join(EVIDENCE_DIR, "trace-desktop.zip"),
    });
  }
});
