import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

/**
 * Read the live harness phase straight off `tasks.json` at runtime. We read the
 * file (rather than `import`ing it) so this works under the Playwright/Node
 * runner without a JSON import attribute, and so the assertion always reflects
 * the current harness state instead of a baked-in literal.
 */
const tasksState = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../harness/state/tasks.json", import.meta.url)),
    "utf8",
  ),
) as { phase?: string };

test.describe("/ops cockpit", () => {
  test("renders the ops cockpit at #/ops", async ({ page }) => {
    await page.goto("/#/ops");

    await expect(
      page.getByRole("heading", { name: /ops cockpit/i }),
    ).toBeVisible();

    // Overall build-progress bar is present with a valid percentage.
    const progress = page.getByRole("progressbar", {
      name: /overall build progress/i,
    });
    await expect(progress).toBeVisible();
    const nowAttr = await progress.getAttribute("aria-valuenow");
    expect(nowAttr).not.toBeNull();
    const now = Number(nowAttr);
    expect(now).toBeGreaterThanOrEqual(0);
    expect(now).toBeLessThanOrEqual(100);
  });

  test("shows all four status columns", async ({ page }) => {
    await page.goto("/#/ops");
    for (const status of ["backlog", "active", "merged", "blocked"]) {
      await expect(page.getByTestId(`column-${status}`)).toBeVisible();
    }
  });

  test("shows at least one unit row and a status badge", async ({ page }) => {
    await page.goto("/#/ops");
    await expect(page.getByTestId("unit-row").first()).toBeVisible();
    await expect(page.getByTestId("status-badge").first()).toBeVisible();
  });

  test("navigates from the dashboard to ops and back", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /family office os/i }),
    ).toBeVisible();

    await page.getByRole("link", { name: /ops cockpit/i }).click();
    await expect(
      page.getByRole("heading", { name: /ops cockpit/i }),
    ).toBeVisible();

    await page.getByRole("link", { name: /back to dashboard/i }).click();
    await expect(
      page.getByRole("heading", { name: /family office os/i }),
    ).toBeVisible();
  });

  test("reflects live harness state, not a stale fixture", async ({ page }) => {
    await page.goto("/#/ops");

    // The header surfaces the live generation/phase derived from tasks.json.
    // Assert against the actual phase string in tasks.json rather than a
    // hard-coded snapshot, so this stays correct as the harness advances
    // generations (it is the "not a stale fixture" guarantee, after all).
    const phase = tasksState.phase ?? "";
    expect(phase.length).toBeGreaterThan(0);
    await expect(page.getByText(phase, { exact: false }).first()).toBeVisible();

    // gen-2 work is in flight: the currently-active unit appears in the
    // in-progress column (the old static snapshot never showed gen-2 at all).
    const activeColumn = page.getByTestId("column-active");
    await expect(
      activeColumn.getByTestId("unit-row").first(),
    ).toBeVisible();

    // gen-1 shipped: the cockpit shows a large merged count (35 gen-1 units +
    // the ops unit), far more than the handful the stale fixture listed.
    const mergedTile = page.getByTestId("summary-merged");
    const mergedText = (await mergedTile.textContent()) ?? "";
    const mergedCount = Number(mergedText.replace(/\D/g, ""));
    expect(mergedCount).toBeGreaterThanOrEqual(30);

    // Every milestone is rendered: m0..m6 from backlog.json plus the synthetic
    // m7/m8 milestones derived from the in-flight gen-2 units.
    for (const milestone of [
      "m0",
      "m1",
      "m2",
      "m3",
      "m4",
      "m5",
      "m6",
      "m7",
      "m8",
    ]) {
      await expect(page.getByTestId(`milestone-${milestone}`)).toBeVisible();
    }
  });

  // Visual-QA evidence: capture the cockpit at desktop + mobile viewports so a
  // human (and the worker's vision check) can confirm it renders correctly.
  test("captures desktop + mobile evidence", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/#/ops");
    await expect(
      page.getByRole("heading", { name: /ops cockpit/i }),
    ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: "e2e/evidence/m7-ops-live/ops-desktop.png",
      fullPage: true,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/#/ops");
    await expect(
      page.getByRole("heading", { name: /ops cockpit/i }),
    ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: "e2e/evidence/m7-ops-live/ops-mobile.png",
      fullPage: true,
    });
  });

  // Screenshot baselines are OS-specific (font rendering differs across
  // platforms). The committed baseline is generated on the maintainer's macOS
  // machine; in CI (Linux) there is no matching baseline, so skip there rather
  // than fail on an expected cross-OS pixel diff. The DOM assertions above are
  // the deterministic, cross-platform gate.
  test("visual snapshot of the ops cockpit", async ({ page }) => {
    test.skip(
      !!process.env.CI,
      "visual baseline is OS-specific; DOM assertions gate CI",
    );
    await page.goto("/#/ops");
    await expect(
      page.getByRole("heading", { name: /ops cockpit/i }),
    ).toBeVisible();
    // Wait for fonts/layout to settle for a stable screenshot.
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot("ops-cockpit.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });
});
