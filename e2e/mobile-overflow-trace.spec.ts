import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdir } from "node:fs/promises";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m15-mobile-overflow");

const MOBILE = { width: 390, height: 844 };

const ROUTES = [
  "/charts",
  "/risk",
  "/concentration",
  "/data-quality",
  "/ops",
] as const;

/**
 * Standalone Playwright trace evidence for the m15 mobile-overflow pass.
 *
 * The global config sets `trace: "on"`, which auto-traces every test into
 * `test-results/`. This file disables that at file scope (`test.use({ trace:
 * "off" })`, which Playwright requires at the top level) so this test fully owns
 * the tracing lifecycle and can write a committed trace zip directly into the
 * evidence dir — proof the 390px sweep of all five standalone routes ran.
 */
test.use({ trace: "off" });

test("trace evidence: mobile sweep of the five standalone routes (390x844)", async ({
  page,
}) => {
  await mkdir(EVIDENCE_DIR, { recursive: true });
  await page.context().tracing.start({ screenshots: true, snapshots: true });
  try {
    await page.setViewportSize(MOBILE);
    for (const route of ROUTES) {
      await page.goto(`/#${route}`);
      await expect(page.locator("h1").first()).toBeVisible();
      await page.waitForTimeout(150);
      const overflow = await page.evaluate(() => {
        const el = document.documentElement;
        return el.scrollWidth - el.clientWidth;
      });
      expect(
        overflow,
        `no horizontal page overflow on ${route}`,
      ).toBeLessThanOrEqual(1);
    }
  } finally {
    await page.context().tracing.stop({
      path: join(EVIDENCE_DIR, "trace-mobile.zip"),
    });
  }
});
