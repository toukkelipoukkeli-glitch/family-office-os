import { existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m12-chart-a11y");

const DESKTOP = { width: 1280, height: 800 };

/**
 * Standalone Playwright trace evidence for the chart-a11y pass.
 *
 * The global config sets `trace: "on"`, which auto-traces every test into the
 * gitignored test-results/. Here we disable that fixture (top-level
 * `test.use({ trace: "off" })`, which Playwright requires at file scope) so this
 * test fully owns the tracing lifecycle and can write a committed trace zip
 * directly into the evidence dir.
 */
test.use({ trace: "off" });

test("a11y trace evidence: charts page with a data table open (desktop)", async ({
  page,
}) => {
  if (!existsSync(EVIDENCE_DIR)) mkdirSync(EVIDENCE_DIR, { recursive: true });

  await page.context().tracing.start({ screenshots: true, snapshots: true });
  try {
    await page.setViewportSize(DESKTOP);
    await page.goto("/#/charts");
    await expect(page.getByTestId("charts-gallery")).toBeVisible();
    await page.getByTestId("fig-bar-table-toggle").click();
    await expect(page.getByTestId("fig-bar-table")).toBeVisible();
  } finally {
    // Always flush the trace zip — even if an assertion above failed — so the
    // committed evidence captures the failure for debugging.
    await page.context().tracing.stop({
      path: join(EVIDENCE_DIR, "trace-desktop.zip"),
    });
  }
});
