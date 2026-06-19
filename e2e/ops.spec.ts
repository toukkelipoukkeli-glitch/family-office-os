import { expect, test } from "@playwright/test";

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
