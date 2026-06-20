import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test, type Download, type Page } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m12-export-toolkit");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

// The Playwright config records a trace for every test; make it explicit here so
// the UI-evidence requirement holds even if the global default changes.
test.use({ trace: "on", acceptDownloads: true });

/** Read the full text body of a Playwright download. */
async function downloadText(download: Download): Promise<string> {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

/** Click an export button and return the triggered download. */
async function clickExport(page: Page, testId: string): Promise<Download> {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId(testId).click(),
  ]);
  return download;
}

test.describe("CSV/JSON export toolkit", () => {
  test("net-worth dashboard exports CSV + JSON downloads", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/");
    await expect(page.getByTestId("networth-dashboard")).toBeVisible();
    await expect(page.getByTestId("networth-export")).toBeVisible();

    const csv = await clickExport(page, "networth-export-csv");
    expect(csv.suggestedFilename()).toMatch(/^net-worth-.*\.csv$/);
    const csvBody = await downloadText(csv);
    expect(csvBody.startsWith("assetClass,label,value (USD),weight,holdings")).toBe(
      true,
    );
    expect(csvBody).toContain("\r\n");

    const json = await clickExport(page, "networth-export-json");
    expect(json.suggestedFilename()).toMatch(/^net-worth-.*\.json$/);
    const parsed = JSON.parse(await downloadText(json));
    expect(parsed).toHaveProperty("baseCurrency", "USD");
    expect(Array.isArray(parsed.series)).toBe(true);
  });

  test("reports page exports the board report", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/#/reports");
    await expect(page.getByTestId("reports-page")).toBeVisible();

    const csv = await clickExport(page, "reports-export-csv");
    expect(csv.suggestedFilename()).toMatch(/^board-report-.*\.csv$/);
    expect(await downloadText(csv)).toContain("key,label,display,raw");

    const json = await clickExport(page, "reports-export-json");
    expect(json.suggestedFilename()).toMatch(/^board-report-.*\.json$/);
    const parsed = JSON.parse(await downloadText(json));
    expect(parsed).toHaveProperty("currency", "USD");
    expect(parsed).toHaveProperty("netWorth");
  });

  test("tax timeline exports its events", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/#/tax-timeline");
    await expect(page.getByTestId("taxtimeline-page")).toBeVisible();

    const csv = await clickExport(page, "taxtimeline-export-csv");
    expect(csv.suggestedFilename()).toMatch(/^tax-timeline-\d{4}\.csv$/);
    expect(await downloadText(csv)).toContain(
      "date,category,severity,title,detail",
    );

    const json = await clickExport(page, "taxtimeline-export-json");
    const parsed = JSON.parse(await downloadText(json));
    expect(Array.isArray(parsed.events)).toBe(true);
    expect(parsed).toHaveProperty("year");
  });

  test("managers page exports the ranked roster", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/#/managers");
    await expect(page.getByTestId("managers-page")).toBeVisible();

    const csv = await clickExport(page, "managers-export-csv");
    expect(csv.suggestedFilename()).toBe("manager-scorecard.csv");
    expect(await downloadText(csv)).toContain("rank,id,name,strategy");

    const json = await clickExport(page, "managers-export-json");
    expect(json.suggestedFilename()).toBe("manager-scorecard.json");
    const parsed = JSON.parse(await downloadText(json));
    expect(Array.isArray(parsed.roster)).toBe(true);
    expect(parsed).toHaveProperty("detail");
  });

  test("captures desktop evidence (1280x800)", async ({ page }) => {
    await page.setViewportSize(DESKTOP);

    await page.goto("/");
    await expect(page.getByTestId("networth-export")).toBeVisible();
    await page.waitForTimeout(200);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "dashboard-export-desktop.png"),
      fullPage: true,
    });

    await page.goto("/#/reports");
    await expect(page.getByTestId("reports-export")).toBeVisible();
    await page.waitForTimeout(200);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "reports-export-desktop.png"),
      fullPage: true,
    });

    await page.goto("/#/managers");
    await expect(page.getByTestId("managers-export")).toBeVisible();
    await page.waitForTimeout(200);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "managers-export-desktop.png"),
      fullPage: true,
    });

    await page.goto("/#/tax-timeline");
    await expect(page.getByTestId("taxtimeline-export")).toBeVisible();
    await page.waitForTimeout(200);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "taxtimeline-export-desktop.png"),
      fullPage: true,
    });
  });

  test("captures mobile evidence (390x844)", async ({ page }) => {
    await page.setViewportSize(MOBILE);

    await page.goto("/");
    // On mobile the export menu is surfaced inline at the top of the page.
    await expect(page.getByTestId("networth-export-mobile")).toBeVisible();
    await page.waitForTimeout(200);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "dashboard-export-mobile.png"),
      fullPage: true,
    });

    await page.goto("/#/reports");
    await expect(page.getByTestId("reports-export")).toBeVisible();
    await page.waitForTimeout(200);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "reports-export-mobile.png"),
      fullPage: true,
    });

    await page.goto("/#/managers");
    await expect(page.getByTestId("managers-export")).toBeVisible();
    await page.waitForTimeout(200);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "managers-export-mobile.png"),
      fullPage: true,
    });

    await page.goto("/#/tax-timeline");
    await expect(page.getByTestId("taxtimeline-export")).toBeVisible();
    await page.waitForTimeout(200);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "taxtimeline-export-mobile.png"),
      fullPage: true,
    });
  });
});
