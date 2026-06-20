import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdir } from "node:fs/promises";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m12-route-registry");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

/**
 * Unit m12: typed route registry + shared AppShell.
 *
 * These smoke tests prove the dashboard navigation generated from the registry
 * routes correctly to each page, that the shared AppShell chrome (header + back
 * link) renders on migrated pages, and that no route trips the error boundary.
 */
test.describe("route registry + AppShell", () => {
  test("the dashboard nav routes to a representative set of pages and back", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();

    // A representative sample of nav targets across groups, including pages
    // migrated to the shared AppShell. Each entry asserts the nav link works
    // and the page-specific back link returns to the dashboard.
    const hops: { nav: string; back: string }[] = [
      { nav: "nav-fees", back: "fees-back" },
      { nav: "nav-reports", back: "reports-back" },
      { nav: "nav-ips", back: "ips-back" },
      { nav: "nav-org", back: "org-back" },
      { nav: "nav-giving", back: "giving-back" },
      { nav: "nav-goals", back: "goals-back" },
      { nav: "nav-estate", back: "estate-back" },
      { nav: "nav-lookthrough", back: "lookthrough-back" },
      { nav: "nav-insights", back: "insights-back" },
      { nav: "nav-home", back: "home-back" },
    ];

    for (const hop of hops) {
      await page.getByTestId(hop.nav).click();
      const back = page.getByTestId(hop.back);
      await expect(back).toBeVisible();
      // The shared AppShell back link points at the dashboard.
      await expect(back).toHaveAttribute("href", "#/");
      // The page mounted without the error boundary firing.
      await expect(page.getByRole("alert")).toHaveCount(0);
      await back.click();
      await expect(
        page.getByRole("heading", { name: "Family Office OS" }),
      ).toBeVisible();
    }
  });

  test("every dashboard nav link resolves to a non-dashboard page", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
    const links = page.locator('nav a[data-testid^="nav-"]');
    await expect(links.first()).toBeVisible();
    const hrefs = await links.evaluateAll((els) =>
      els.map((el) => el.getAttribute("href")),
    );
    expect(hrefs.length).toBe(39);

    for (const href of hrefs) {
      expect(href, "nav link has an href").toBeTruthy();
      await page.goto(`/${href}`);
      // No page in the registry blanks out into the error boundary.
      await expect(page.getByRole("alert")).toHaveCount(0);
      // The shared chrome always renders a single page heading.
      await expect(page.locator("h1").first()).toBeVisible();
      // Crucially, the route must NOT have fallen back to the dashboard shell:
      // only the dashboard renders the "Family Office OS" heading, so its
      // absence proves the registry resolved this href to a real page. Without
      // this, a regression that always rendered <Dashboard /> would pass.
      await expect(
        page.getByRole("heading", { name: "Family Office OS" }),
      ).toHaveCount(0);
    }
  });

  test("registry nav is keyboard-operable (focus + typed Enter activation)", async ({
    page,
  }) => {
    // The core workflow for this refactor is navigation via the registry-driven
    // nav. Exercise it with real keyboard input — focus a nav link and activate
    // it by pressing Enter — to prove the generated <a> links are operable, not
    // just clickable. (No page in this routing/chrome refactor has a form field
    // to fill, so keyboard activation is the realistic typed-input path here.)
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();

    const feesLink = page.getByTestId("nav-fees");
    await feesLink.focus();
    await expect(feesLink).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(page.getByTestId("fees-page")).toBeVisible();
    const back = page.getByTestId("fees-back");
    await expect(back).toBeVisible();
    // Activate the AppShell back link with the keyboard too.
    await back.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
  });

  test("the pipeline prefix route still drills into a deal (AppShell subtitle)", async ({
    page,
  }) => {
    await page.goto("/#/pipeline");
    await expect(
      page.getByRole("heading", { name: /deal pipeline/i }),
    ).toBeVisible();
    // The AppShell subtitle line (pipeline name + stage count) renders.
    await expect(page.getByText(/stages/i).first()).toBeVisible();
  });

  test("captures desktop evidence (1280x800)", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await mkdir(EVIDENCE_DIR, { recursive: true });

    // Dashboard with the registry-generated nav.
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
    await page.waitForTimeout(200);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "dashboard-nav-desktop.png"),
      fullPage: true,
    });

    // A migrated page (Fees) wearing the shared AppShell chrome.
    await page.getByTestId("nav-fees").click();
    await expect(page.getByTestId("fees-page")).toBeVisible();
    await expect(page.getByTestId("fees-back")).toBeVisible();
    await page.waitForTimeout(200);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "fees-appshell-desktop.png"),
      fullPage: true,
    });

    // A page with header actions + a title aside (Reports).
    await page.goto("/#/reports");
    await expect(page.getByTestId("reports-page")).toBeVisible();
    await expect(page.getByTestId("report-as-of")).toBeVisible();
    await expect(page.getByTestId("toggle-export")).toBeVisible();
    await page.waitForTimeout(200);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "reports-appshell-desktop.png"),
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
    await page.screenshot({
      path: join(EVIDENCE_DIR, "dashboard-nav-mobile.png"),
      fullPage: true,
    });

    await page.goto("/#/fees");
    await expect(page.getByTestId("fees-page")).toBeVisible();
    await page.waitForTimeout(200);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "fees-appshell-mobile.png"),
      fullPage: true,
    });

    await page.goto("/#/insights");
    await expect(page.getByTestId("insights-page")).toBeVisible();
    await page.waitForTimeout(200);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "insights-appshell-mobile.png"),
      fullPage: true,
    });
  });

  // The config records a Playwright trace for every test (`trace: "on"`). After
  // the run, this walkthrough's trace is copied from `test-results/` into the
  // committed evidence dir (e2e/evidence/m12-route-registry/) as proof of the
  // navigation flow across registry-driven nav + AppShell back links.
  test("nav walkthrough across groups (traced)", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/");
    await page.getByTestId("nav-fees").click();
    await expect(page.getByTestId("fees-page")).toBeVisible();
    await page.getByTestId("fees-back").click();
    await page.getByTestId("nav-org").click();
    await expect(page.getByRole("heading", { name: /org hierarchy/i })).toBeVisible();
    await page.getByTestId("org-back").click();
    await page.getByTestId("nav-reports").click();
    await expect(page.getByTestId("reports-page")).toBeVisible();
    await page.getByTestId("toggle-export").click();
    await expect(page.getByTestId("export-markdown")).toBeVisible();
    await page.getByTestId("reports-back").click();
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
  });
});
