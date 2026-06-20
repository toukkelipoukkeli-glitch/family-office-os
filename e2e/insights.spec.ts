import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m10-ai-insights");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

test.describe("AI insights page", () => {
  test("navigates from the dashboard to the insights page and back", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();

    await page.getByTestId("nav-insights").click();
    await expect(page).toHaveURL(/#\/insights$/);
    await expect(page.getByTestId("insights-page")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /AI portfolio insights/i }),
    ).toBeVisible();

    await page.getByTestId("insights-back").click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
  });

  test.describe("on the insights route (graceful-fallback path)", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/#/insights");
      await expect(page.getByTestId("insights-page")).toBeVisible();
    });

    test("degrades gracefully to 'AI insights unavailable' with no key", async ({
      page,
    }) => {
      // The browser bundle has no GEMINI_API_KEY, so the single adapter must
      // degrade gracefully rather than crash or render blank.
      const unavailable = page.getByTestId("ai-unavailable");
      await expect(unavailable).toBeVisible();
      await expect(unavailable).toHaveAttribute("data-reason", "missing-key");
      await expect(
        page.getByText(/AI insights unavailable/i),
      ).toBeVisible();
      // No AI narrative text on the fallback path.
      await expect(page.getByTestId("ai-narrative")).toHaveCount(0);
    });

    test("always shows the deterministic summary with the facts", async ({
      page,
    }) => {
      const deterministic = page.getByTestId("deterministic-narrative");
      await expect(deterministic).toBeVisible();
      // The deterministic summary carries the as-of date and base currency.
      await expect(deterministic).toContainText("2026-06-30");
      await expect(deterministic).toContainText("USD");
    });

    test("regenerate keeps the graceful fallback (no crash)", async ({
      page,
    }) => {
      await page.getByTestId("insights-refresh").click();
      await expect(page.getByTestId("ai-unavailable")).toBeVisible();
      await expect(
        page.getByTestId("deterministic-narrative"),
      ).toBeVisible();
    });
  });

  test("captures desktop evidence (1280x800)", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/");
    await page.getByTestId("nav-insights").click();
    await expect(page.getByTestId("insights-page")).toBeVisible();
    await expect(page.getByTestId("ai-unavailable")).toBeVisible();
    await expect(page.getByTestId("deterministic-narrative")).toBeVisible();
    await page.waitForTimeout(200);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "insights-desktop.png"),
      fullPage: true,
    });
  });

  test("captures mobile evidence (390x844)", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/#/insights");
    await expect(page.getByTestId("insights-page")).toBeVisible();
    await expect(page.getByTestId("ai-unavailable")).toBeVisible();
    await expect(page.getByTestId("deterministic-narrative")).toBeVisible();
    await page.waitForTimeout(200);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "insights-mobile.png"),
      fullPage: true,
    });
  });
});
