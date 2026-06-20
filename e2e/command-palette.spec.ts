import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdir } from "node:fs/promises";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m12-command-palette");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

/** Open the palette with the platform-appropriate Cmd/Ctrl-K shortcut. */
async function openWithShortcut(page: import("@playwright/test").Page) {
  // Use Control on all CI runners (Linux/Windows); Meta also works on macOS but
  // Control is wired up too, so this is portable.
  await page.keyboard.press("Control+k");
}

test.describe("command palette (Cmd/Ctrl-K)", () => {
  test("opens with Cmd/Ctrl-K, filters, and navigates", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();

    // Closed by default.
    await expect(page.getByTestId("command-palette")).toHaveCount(0);

    await openWithShortcut(page);
    const dialog = page.getByTestId("command-palette");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");

    // The input is a combobox controlling the results listbox and is focused.
    const input = page.getByTestId("command-palette-input");
    await expect(input).toBeFocused();
    await expect(input).toHaveAttribute("role", "combobox");
    await expect(page.getByRole("listbox")).toBeVisible();

    // Filter to a page and navigate via the keyboard.
    await input.fill("risk");
    const riskOption = page.getByTestId("command-option-route:/risk");
    await expect(riskOption).toBeVisible();
    await expect(riskOption).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Enter");

    // The palette closed and the URL changed to the chosen route.
    await expect(page.getByTestId("command-palette")).toHaveCount(0);
    await expect(page).toHaveURL(/#\/risk$/);
    await expect(
      page.getByRole("heading", { name: /risk/i }).first(),
    ).toBeVisible();
  });

  test("arrow keys move the selection and Esc closes", async ({ page }) => {
    await page.goto("/");
    await openWithShortcut(page);
    await expect(page.getByTestId("command-palette")).toBeVisible();

    // Scope to the palette: the shell now also mounts a native reporting-currency
    // <select>, whose <option> elements carry the implicit ARIA "option" role. An
    // unscoped getByRole("option") would intermittently match those, so anchor the
    // query inside the command palette where only the command rows live.
    const options = page.getByTestId("command-palette").getByRole("option");
    await expect(options.first()).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowDown");
    await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");
    await expect(options.first()).toHaveAttribute("aria-selected", "false");

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("command-palette")).toHaveCount(0);
    // Focus returned to the page (no trapped/lost focus).
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
  });

  test("opens from the visible header trigger button and runs a quick action", async ({
    page,
  }) => {
    // The Fees page wears the shared AppShell chrome, whose header carries the
    // visible palette trigger button (the Dashboard header has one too).
    await page.goto("/#/fees");
    await expect(page.getByTestId("fees-page")).toBeVisible();
    const trigger = page.getByTestId("command-palette-trigger").first();
    await expect(trigger).toBeVisible();
    await trigger.click();
    await expect(page.getByTestId("command-palette")).toBeVisible();

    // Run the "Go to dashboard" quick action by clicking it.
    await page.getByTestId("command-palette-input").fill("dashboard");
    await page.getByTestId("command-option-action:dashboard").click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
  });

  test("shows an empty state for a non-matching query", async ({ page }) => {
    await page.goto("/");
    await openWithShortcut(page);
    await page.getByTestId("command-palette-input").fill("zzzxqq");
    await expect(page.getByTestId("command-palette-empty")).toBeVisible();
  });

  test("works on a non-dashboard route too (mounted at app root)", async ({
    page,
  }) => {
    await page.goto("/#/fees");
    await expect(page.getByTestId("fees-page")).toBeVisible();
    await openWithShortcut(page);
    await expect(page.getByTestId("command-palette")).toBeVisible();
    await page.getByTestId("command-palette-input").fill("cashflow");
    await page.getByTestId("command-option-route:/cashflow").click();
    await expect(page).toHaveURL(/#\/cashflow$/);
  });

  test("captures desktop evidence (1280x800)", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await mkdir(EVIDENCE_DIR, { recursive: true });

    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
    // Header trigger visible on the dashboard.
    await expect(page.getByTestId("command-palette-trigger")).toBeVisible();
    await page.waitForTimeout(150);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "trigger-desktop.png"),
      fullPage: true,
    });

    // Open + show the full command list.
    await openWithShortcut(page);
    await expect(page.getByTestId("command-palette")).toBeVisible();
    await page.waitForTimeout(150);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "palette-open-desktop.png"),
    });

    // Filtered results.
    await page.getByTestId("command-palette-input").fill("re");
    await page.waitForTimeout(150);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "palette-filtered-desktop.png"),
    });
  });

  test("captures mobile evidence (390x844)", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await mkdir(EVIDENCE_DIR, { recursive: true });

    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
    await page.waitForTimeout(150);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "trigger-mobile.png"),
      fullPage: true,
    });

    await openWithShortcut(page);
    await expect(page.getByTestId("command-palette")).toBeVisible();
    await page.getByTestId("command-palette-input").fill("risk");
    await page.waitForTimeout(150);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "palette-open-mobile.png"),
    });
  });

  // Trace of the full open→filter→navigate workflow. The config records
  // `trace: "on"` for every test, writing this test's recording to
  // `test-results/<dir>/trace.zip`. That zip is copied into the committed
  // evidence dir (e2e/evidence/m12-command-palette/command-palette-trace.zip)
  // after the run as proof of the workflow.
  test("traced walkthrough (open, filter, navigate)", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/");
    await openWithShortcut(page);
    await expect(page.getByTestId("command-palette")).toBeVisible();
    await page.getByTestId("command-palette-input").fill("benchmark");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#\/benchmark$/);
  });
});
