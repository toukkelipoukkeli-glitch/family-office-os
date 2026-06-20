import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test, type Download, type Page } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m13-export-rollout");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

test.use({ trace: "on", acceptDownloads: true });

/** Read the full text body of a Playwright download. */
async function downloadText(download: Download): Promise<string> {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
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

/**
 * One newly-covered page: its hash route, the export group's testId, the CSV
 * header line we expect, and the filename stem the file should carry.
 */
interface PageCase {
  readonly route: string;
  readonly exportId: string;
  /** Substring the CSV body must start with (the header row). */
  readonly csvHeader: string;
  /** RegExp the suggested CSV filename must match. */
  readonly csvName: RegExp;
}

const CASES: readonly PageCase[] = [
  { route: "/#/attribution", exportId: "attribution-export", csvHeader: "id,label,portfolioWeight", csvName: /^attribution\.csv$/ },
  { route: "/#/benchmark", exportId: "benchmark-export", csvHeader: "period,portfolioReturn", csvName: /^benchmark-.*\.csv$/ },
  { route: "/#/captable", exportId: "captable-export", csvHeader: "id,holder,securityClass", csvName: /^cap-table-.*\.csv$/ },
  { route: "/#/cashflow", exportId: "cashflow-export", csvHeader: "index,period,openingBalance", csvName: /^cashflow\.csv$/ },
  { route: "/#/concentration", exportId: "concentration-export", csvHeader: "issuerId,name,sector", csvName: /^concentration-.*\.csv$/ },
  { route: "/#/currency", exportId: "currency-export", csvHeader: "currency,isBase,valueBase", csvName: /^currency-exposure\.csv$/ },
  { route: "/#/data-quality", exportId: "dataquality-export", csvHeader: "holdingId,name,assetClass", csvName: /^data-quality-.*\.csv$/ },
  { route: "/#/factors", exportId: "factors-export", csvHeader: "key,label,beta", csvName: /^factor-attribution\.csv$/ },
  { route: "/#/fees", exportId: "fees-export", csvHeader: "id,name,category,invested", csvName: /^fees\.csv$/ },
  { route: "/#/harvest", exportId: "harvest-export", csvHeader: "lotId,symbol,acquiredOn", csvName: /^harvest-.*\.csv$/ },
  { route: "/#/estate", exportId: "estate-export", csvHeader: "beneficiaryId,name,relation", csvName: /^estate-beneficiaries\.csv$/ },
  { route: "/#/giving", exportId: "giving-export", csvHeader: "giftId,label,kind", csvName: /^giving-plan\.csv$/ },
  { route: "/#/goals", exportId: "goals-export", csvHeader: "goalId,name,category", csvName: /^goal-funding\.csv$/ },
  { route: "/#/lookthrough", exportId: "lookthrough-export", csvHeader: "assetClass,value", csvName: /^look-through-.*\.csv$/ },
  { route: "/#/ips", exportId: "ips-export", csvHeader: "id,constraintLabel,subject", csvName: /^ips-compliance\.csv$/ },
  { route: "/#/org", exportId: "org-export", csvHeader: "id,name,kind,jurisdiction", csvName: /^org-entities\.csv$/ },
  { route: "/#/consolidation", exportId: "consolidation-export", csvHeader: "entityId,entityName,kind", csvName: /^consolidation-.*\.csv$/ },
  { route: "/#/privatemarkets", exportId: "privatemarkets-export", csvHeader: "id,name,strategy,vintageYear", csvName: /^private-markets\.csv$/ },
  { route: "/#/stress", exportId: "stress-export", csvHeader: "scenarioId,scenarioName", csvName: /^stress-tests\.csv$/ },
  { route: "/#/rebalance", exportId: "rebalance-export", csvHeader: "assetClass,label,currentWeight", csvName: /^rebalance\.csv$/ },
  { route: "/#/alerts", exportId: "alerts-export", csvHeader: "id,ruleLabel,subject", csvName: /^limit-alerts\.csv$/ },
  { route: "/#/liquidity", exportId: "liquidity-export", csvHeader: "index,period,availableLiquidity", csvName: /^liquidity\.csv$/ },
  { route: "/#/scenarios", exportId: "scenario-export", csvHeader: "scenarioId,scenarioName,meanDelta", csvName: /^scenario-cockpit\.csv$/ },
  { route: "/#/insurance", exportId: "insurance-export", csvHeader: "kind,label,activeCoverage", csvName: /^insurance\.csv$/ },
  { route: "/#/vault", exportId: "vault-export", csvHeader: "id,title,kind,counterparty", csvName: /^vault-documents\.csv$/ },
  { route: "/#/pipeline", exportId: "pipeline-export", csvHeader: "id,name,stageId,status", csvName: /^deal-pipeline\.csv$/ },
  { route: "/#/companies", exportId: "company-export", csvHeader: "fiscalYear,revenue,ebitda", csvName: /^company-.*\.csv$/ },
  { route: "/#/relationships", exportId: "relationships-export", csvHeader: "id,sourceId,kind,label", csvName: /^relationship-graph\.csv$/ },
  { route: "/#/risk", exportId: "risk-export", csvHeader: "subject,kind,bound,weight", csvName: /^risk-limits-.*\.csv$/ },
  { route: "/#/insights", exportId: "insights-export", csvHeader: "key,label,display,raw", csvName: /^board-report-.*\.csv$/ },
  { route: "/#/home", exportId: "home-export", csvHeader: "id,label,value,detail", csvName: /^overview\.csv$/ },
  { route: "/#/ops", exportId: "ops-export", csvHeader: "milestoneId,milestoneTitle,id,title,status", csvName: /^ops-cockpit\.csv$/ },
];

test.describe("export rollout — every data-heavy page", () => {
  for (const c of CASES) {
    test(`${c.exportId} triggers a CSV + JSON download`, async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await page.goto(c.route);
      await expect(page.getByTestId(c.exportId)).toBeVisible();

      const csv = await clickExport(page, `${c.exportId}-csv`);
      expect(csv.suggestedFilename()).toMatch(c.csvName);
      const csvBody = await downloadText(csv);
      expect(csvBody.startsWith(c.csvHeader)).toBe(true);
      // RFC-4180 line terminator — proves it is the toolkit's serializer.
      expect(csvBody).toContain("\r\n");

      const json = await clickExport(page, `${c.exportId}-json`);
      expect(json.suggestedFilename()).toMatch(/\.json$/);
      // Parses cleanly and is non-empty.
      const parsed = JSON.parse(await downloadText(json));
      expect(parsed).toBeTruthy();
    });
  }

  test("captures desktop evidence (1280x800)", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    for (const route of ["/#/fees", "/#/concentration", "/#/risk", "/#/pipeline", "/#/ops"]) {
      await page.goto(route);
      const id = CASES.find((c) => c.route === route)!.exportId;
      await expect(page.getByTestId(id)).toBeVisible();
      await page.waitForTimeout(150);
      await page.screenshot({
        path: join(EVIDENCE_DIR, `${id}-desktop.png`),
        fullPage: true,
      });
    }
  });

  test("captures mobile evidence (390x844)", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    for (const route of ["/#/fees", "/#/concentration", "/#/risk", "/#/pipeline", "/#/ops"]) {
      await page.goto(route);
      const id = CASES.find((c) => c.route === route)!.exportId;
      await expect(page.getByTestId(id)).toBeVisible();
      await page.waitForTimeout(150);
      await page.screenshot({
        path: join(EVIDENCE_DIR, `${id}-mobile.png`),
        fullPage: true,
      });
    }
  });
});
