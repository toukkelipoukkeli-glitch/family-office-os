import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test, type Download, type Page } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m14-csv-injection");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

// The Playwright config records a trace for every test; make it explicit so the
// UI-evidence requirement holds even if the global default changes.
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

test.describe("CSV formula-injection hardening", () => {
  test("the production toCsv neutralizes dangerous string cells in-browser", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/");
    await expect(page.getByTestId("networth-dashboard")).toBeVisible();

    // Run the ACTUAL app-bundled toCsv (served by Vite) against an adversarial
    // table. This proves the hardening is live in the shipped code path, not a
    // test-only stub.
    const out = await page.evaluate(async () => {
      const mod = await import("/src/lib/export/csv.ts");
      const toCsv = (mod as { toCsv: (t: unknown, o?: unknown) => string })
        .toCsv;
      const table = {
        columns: ["payload", "weight", "note"],
        rows: [
          ["=cmd|'/c calc'!A1", -2.5, "benign"],
          ["@SUM(A1:A9)", 0.5, "+1+1"],
          ["-2+3+cmd|'x'!A1", 1, "all good"],
          ["-12.5", 3, "Acme, Inc."],
        ],
      };
      return toCsv(table);
    });

    // Dangerous string cells are prefixed with a single quote.
    expect(out).toContain("'=cmd|'/c calc'!A1");
    expect(out).toContain("'@SUM(A1:A9)");
    expect(out).toContain("'+1+1");
    expect(out).toContain("'-2+3+cmd|'x'!A1");
    // Negative NUMBER cells and negative NUMERIC strings stay exact (no quote).
    expect(out).toContain("-2.5");
    expect(out).not.toContain("'-12.5");
    expect(out).toContain("-12.5");
    // Benign text is untouched.
    expect(out).toContain("benign");
    expect(out).toContain("all good");
  });

  test("a real page export still produces a valid, unbroken CSV", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/#/tax-timeline");
    await expect(page.getByTestId("taxtimeline-page")).toBeVisible();

    const csv = await clickExport(page, "taxtimeline-export-csv");
    const body = await downloadText(csv);
    // Header shape unchanged by the hardening pass.
    expect(body).toContain("date,category,severity,title,detail");
    expect(body).toContain("\r\n");
    // No data row begins with a raw formula trigger (every line is either the
    // header, a date like 2026-..., or a neutralized cell).
    for (const line of body.split("\r\n")) {
      if (line.length === 0) continue;
      expect(["=", "+", "@"]).not.toContain(line[0]);
    }
  });

  test("captures desktop evidence (1280x800)", async ({ page }) => {
    await page.setViewportSize(DESKTOP);

    await page.goto("/#/tax-timeline");
    await expect(page.getByTestId("taxtimeline-export")).toBeVisible();
    await page.waitForTimeout(200);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "tax-timeline-export-desktop.png"),
      fullPage: true,
    });

    await page.goto("/#/managers");
    await expect(page.getByTestId("managers-export")).toBeVisible();
    await page.waitForTimeout(200);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "managers-export-desktop.png"),
      fullPage: true,
    });
  });

  test("captures mobile evidence (390x844)", async ({ page }) => {
    await page.setViewportSize(MOBILE);

    await page.goto("/#/tax-timeline");
    await expect(page.getByTestId("taxtimeline-export")).toBeVisible();
    await page.waitForTimeout(200);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "tax-timeline-export-mobile.png"),
      fullPage: true,
    });

    await page.goto("/#/managers");
    await expect(page.getByTestId("managers-export")).toBeVisible();
    await page.waitForTimeout(200);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "managers-export-mobile.png"),
      fullPage: true,
    });
  });
});
