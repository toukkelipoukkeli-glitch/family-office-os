import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m9-vault");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

test.describe("document & obligation vault", () => {
  test("navigates from the dashboard to the vault and back", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();

    await page.getByTestId("nav-vault").click();
    await expect(page).toHaveURL(/#\/vault$/);
    await expect(
      page.getByRole("heading", { name: /document & obligation vault/i }),
    ).toBeVisible();
    await expect(page.getByTestId("vault-page")).toBeVisible();

    await page.getByTestId("vault-back").click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
  });

  test.describe("on the vault route", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/#/vault");
      await expect(page.getByTestId("vault-page")).toBeVisible();
    });

    test("renders the KPIs, registry and obligations", async ({ page }) => {
      await expect(page.getByTestId("kpi-documents")).toContainText("5");
      await expect(page.getByTestId("kpi-capital-calls")).toContainText("$5.5M");

      const rows = page.getByTestId("document-list").getByTestId("document-row");
      await expect(rows).toHaveCount(5);

      const obligations = page
        .getByTestId("obligation-list")
        .getByTestId("obligation-row");
      await expect(obligations).toHaveCount(4);
      await expect(page.getByTestId("obligation-amount").first()).toBeVisible();
    });

    test("selecting another document swaps the detail panel", async ({
      page,
    }) => {
      await page
        .locator('[data-testid="document-row"][data-document="doc-ins-zurich"]')
        .click();
      await expect(page.getByTestId("detail-title")).toContainText(
        /life policy/i,
      );
      await expect(
        page.locator('[data-testid="obligation-row"][data-kind="premium"]'),
      ).toBeVisible();
    });

    test("renders the global timeline", async ({ page }) => {
      const rows = page.getByTestId("timeline").getByTestId("timeline-row");
      await expect(rows).toHaveCount(11);
    });

    test("captures desktop evidence (1280x800)", async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await expect(page.getByTestId("timeline")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "vault-desktop.png"),
        fullPage: true,
      });
    });

    test("captures mobile evidence (390x844)", async ({ page }) => {
      await page.setViewportSize(MOBILE);
      await expect(page.getByTestId("kpi-documents")).toBeVisible();
      await expect(page.getByTestId("timeline")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "vault-mobile.png"),
        fullPage: true,
      });
    });
  });
});
