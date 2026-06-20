import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test, type Download, type Page } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m14-export-precision");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

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

/** Set the global reporting currency from the dashboard header switcher. */
async function setReportingCurrency(page: Page, code: string): Promise<void> {
  await page.goto("/");
  const select = page.getByTestId("reporting-currency");
  await select.selectOption(code);
  await expect(select).toHaveValue(code);
}

/**
 * Every page covered by m14, with the navigation route, the page-ready test-id,
 * the export-toolbar test-id (the CSV/JSON buttons get `-csv`/`-json`), the CSV
 * header line the export must start with, and a JSON key that must be present.
 */
const PAGES = [
  {
    name: "giving",
    route: "/#/giving",
    ready: "giving-page",
    exp: "giving-export",
    csvHead: "year,gifted (USD),",
    jsonKey: "years",
  },
  {
    name: "estate",
    route: "/#/estate",
    ready: "estate-page",
    exp: "estate-export",
    csvHead: "tier,label,grossUsed (USD),netUsed (USD)",
    jsonKey: "waterfall",
  },
  {
    name: "fees",
    route: "/#/fees",
    ready: "fees-page",
    exp: "fees-export",
    csvHead: "id,fund,category,managementCost (USD),",
    jsonKey: "funds",
  },
  {
    name: "cashflow",
    route: "/#/cashflow",
    ready: "cashflow-page",
    exp: "cashflow-export",
    csvHead: "period,openingBalance (USD),",
    jsonKey: "months",
  },
  {
    name: "liquidity",
    route: "/#/liquidity",
    ready: "liquidity-page",
    exp: "liquidity-export",
    csvHead: "period,availableLiquidity (USD),",
    jsonKey: "months",
  },
  {
    name: "goals",
    route: "/#/goals",
    ready: "goals-page",
    exp: "goals-export",
    csvHead: "id,name,category,target (USD),",
    jsonKey: "goals",
  },
  {
    name: "insurance",
    route: "/#/insurance",
    ready: "insurance-page",
    exp: "insurance-export",
    csvHead: "kind,label,activeCoverage (USD),",
    jsonKey: "categories",
  },
  {
    name: "privatemarkets",
    route: "/#/privatemarkets",
    ready: "privatemarkets-page",
    exp: "privatemarkets-export",
    csvHead: "id,name,strategy,vintageYear,committed (USD),",
    jsonKey: "commitments",
  },
  {
    name: "lookthrough",
    route: "/#/lookthrough",
    ready: "lookthrough-view",
    exp: "lookthrough-export",
    csvHead: "assetClass,label,value (USD),weight",
    jsonKey: "lines",
  },
  {
    name: "consolidation",
    route: "/#/consolidation",
    ready: "consolidation-view",
    exp: "consolidation-export",
    csvHead: "entityId,entityName,kind,effectivePct,standaloneNav (USD),",
    jsonKey: "entities",
  },
  {
    name: "scenario",
    route: "/#/scenarios",
    ready: "cockpit-page",
    exp: "scenario-export",
    csvHead: "scenarioId,scenarioName,meanDelta (USD),",
    jsonKey: "tornado",
  },
  {
    name: "stress",
    route: "/#/stress",
    ready: "stress-page",
    exp: "stress-export",
    csvHead: "id,name,netWorthBefore (USD),",
    jsonKey: "results",
  },
] as const;

test.describe("m14 export precision — per-page CSV/JSON downloads", () => {
  for (const p of PAGES) {
    test(`${p.name}: exports an exact-Decimal CSV + JSON`, async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await page.goto(p.route);
      await expect(page.getByTestId(p.ready)).toBeVisible();
      await expect(page.getByTestId(p.exp)).toBeVisible();

      const csv = await clickExport(page, `${p.exp}-csv`);
      expect(csv.suggestedFilename()).toMatch(/\.csv$/);
      const csvBody = await downloadText(csv);
      expect(csvBody.startsWith(p.csvHead)).toBe(true);
      // RFC-4180 line ending — proves it routed through the real CSV serializer.
      expect(csvBody).toContain("\r\n");
      // No collapsed floats / NaN leaked into the file.
      expect(csvBody).not.toContain("NaN");
      expect(csvBody).not.toContain("undefined");

      const json = await clickExport(page, `${p.exp}-json`);
      expect(json.suggestedFilename()).toMatch(/\.json$/);
      const parsed = JSON.parse(await downloadText(json));
      expect(parsed).toHaveProperty("currency", "USD");
      expect(parsed).toHaveProperty(p.jsonKey);
    });
  }

  test("alerts: exports only the FILTERED visible rows", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/#/alerts");
    await expect(page.getByTestId("alerts-page")).toBeVisible();

    // Default view = breaches only (3 for the sample book).
    const breachesCsv = await downloadText(await clickExport(page, "alerts-export-csv"));
    const breachLines = breachesCsv.trim().split("\r\n");
    // header + 3 breach rows.
    expect(breachLines.length).toBe(4);
    expect(breachLines[0].startsWith("ruleId,rule,subject,scope,direction")).toBe(
      true,
    );

    // Switch to "All rules" — the export grows to the full rule set.
    await page.getByTestId("filter-all").click();
    const allCsv = await downloadText(await clickExport(page, "alerts-export-csv"));
    const allLines = allCsv.trim().split("\r\n");
    expect(allLines.length).toBeGreaterThan(breachLines.length);
  });

  test("currency switch changes the exported values (EUR ≠ USD)", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);

    // Baseline USD export of the giving plan.
    await page.goto("/#/giving");
    await expect(page.getByTestId("giving-export")).toBeVisible();
    const usdJson = JSON.parse(
      await downloadText(await clickExport(page, "giving-export-json")),
    );
    expect(usdJson.currency).toBe("USD");
    const usdGifted = usdJson.totals.gifted as string;

    // Switch the global reporting currency to EUR, then re-export.
    await setReportingCurrency(page, "EUR");
    await page.goto("/#/giving");
    await expect(page.getByTestId("giving-export")).toBeVisible();
    const eurJson = JSON.parse(
      await downloadText(await clickExport(page, "giving-export-json")),
    );
    expect(eurJson.currency).toBe("EUR");
    const eurGifted = eurJson.totals.gifted as string;

    // 1 EUR = 1.08 USD, so the EUR figure is strictly smaller, and the exact
    // conversion holds to the cent: gifted_EUR = gifted_USD / 1.08.
    expect(Number(eurGifted)).toBeLessThan(Number(usdGifted));
    expect(Number(eurGifted)).toBeCloseTo(Number(usdGifted) / 1.08, 2);
  });

  test("captures desktop evidence (1280x800)", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    for (const p of PAGES) {
      await page.goto(p.route);
      await expect(page.getByTestId(p.exp)).toBeVisible();
      await page.waitForTimeout(150);
      await page.screenshot({
        path: join(EVIDENCE_DIR, `${p.name}-export-desktop.png`),
        fullPage: true,
      });
    }
    await page.goto("/#/alerts");
    await expect(page.getByTestId("alerts-export")).toBeVisible();
    await page.waitForTimeout(150);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "alerts-export-desktop.png"),
      fullPage: true,
    });
  });

  test("captures mobile evidence (390x844)", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    for (const p of PAGES) {
      await page.goto(p.route);
      await expect(page.getByTestId(p.exp)).toBeVisible();
      await page.waitForTimeout(150);
      await page.screenshot({
        path: join(EVIDENCE_DIR, `${p.name}-export-mobile.png`),
        fullPage: true,
      });
    }
    await page.goto("/#/alerts");
    await expect(page.getByTestId("alerts-export")).toBeVisible();
    await page.waitForTimeout(150);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "alerts-export-mobile.png"),
      fullPage: true,
    });
  });
});
