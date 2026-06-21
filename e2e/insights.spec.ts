import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m10-ai-insights");
const GUARD_EVIDENCE_DIR = join(here, "evidence", "m14-no-key-guard");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

/**
 * Live AI/data provider hosts the client bundle must NEVER call without keys.
 * Mirrors `LIVE_PROVIDER_HOSTS` in `src/lib/ai/guard.ts`.
 */
const LIVE_PROVIDER_HOSTS = [
  "generativelanguage.googleapis.com",
  "api.elevenlabs.io",
  "api.tavily.com",
  "www.alphavantage.co",
  "alphavantage.co",
  "api.stlouisfed.org",
];

function isLiveProviderRequest(url: string): boolean {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return LIVE_PROVIDER_HOSTS.some(
    (provider) => host === provider || host.endsWith(`.${provider}`),
  );
}

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

/**
 * m14-no-key-guard — THE ORACLE: the client bundle makes NO live network call
 * to any AI/data provider host without keys. We record every request the page
 * issues and assert none target a live provider host; the page must still
 * render its graceful "unavailable" state plus the deterministic summary.
 */
test.describe("no live network call without keys (m14 guard)", () => {
  test("issues NO request to a live AI/data provider host on /insights", async ({
    page,
  }) => {
    const liveCalls: string[] = [];
    page.on("request", (req) => {
      if (isLiveProviderRequest(req.url())) liveCalls.push(req.url());
    });

    await page.goto("/#/insights");
    await expect(page.getByTestId("insights-page")).toBeVisible();

    // The adapter degrades gracefully (no key in the browser bundle).
    const unavailable = page.getByTestId("ai-unavailable");
    await expect(unavailable).toBeVisible();
    await expect(page.getByTestId("deterministic-narrative")).toBeVisible();

    // Regenerate must NOT trigger a live call either.
    await page.getByTestId("insights-refresh").click();
    await expect(page.getByTestId("ai-unavailable")).toBeVisible();
    // Give any errant fetch a chance to fire before asserting.
    await page.waitForTimeout(300);

    expect(
      liveCalls,
      `expected no live provider calls, saw: ${liveCalls.join(", ")}`,
    ).toEqual([]);
  });

  test("captures desktop guard evidence (1280x800)", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/#/insights");
    await expect(page.getByTestId("insights-page")).toBeVisible();
    await expect(page.getByTestId("ai-unavailable")).toBeVisible();
    await expect(page.getByTestId("deterministic-narrative")).toBeVisible();
    await page.waitForTimeout(200);
    await page.screenshot({
      path: join(GUARD_EVIDENCE_DIR, "guard-desktop.png"),
      fullPage: true,
    });
  });

  test("captures mobile guard evidence (390x844)", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/#/insights");
    await expect(page.getByTestId("insights-page")).toBeVisible();
    await expect(page.getByTestId("ai-unavailable")).toBeVisible();
    await expect(page.getByTestId("deterministic-narrative")).toBeVisible();
    await page.waitForTimeout(200);
    await page.screenshot({
      path: join(GUARD_EVIDENCE_DIR, "guard-mobile.png"),
      fullPage: true,
    });
  });
});
