import { describe, expect, it } from "vitest";

import { toCsv } from "./csv";
import { toJson } from "./json";
import {
  buildExportFile,
  holdingsExport,
  managersExport,
  netWorthExport,
  reportExport,
  taxTimelineExport,
} from "./tables";
import { MIME } from "./download";

import { seededNetWorth, networthRateTable } from "@/lib/networth";
import { buildScorecardView, MANAGERS, PERIODS_PER_YEAR } from "@/lib/managers";
import { buildTaxTimeline, seededTimelineInputs } from "@/lib/taxtimeline";
import { buildBoardReport } from "@/lib/reporting";
import { buildHoldingsView } from "@/lib/holdings";
import { seededPortfolio } from "@/fixtures";

const scorecardView = buildScorecardView({
  managers: MANAGERS,
  options: { periodsPerYear: PERIODS_PER_YEAR },
});
const timeline = buildTaxTimeline(seededTimelineInputs);
const report = buildBoardReport();
const holdingsView = buildHoldingsView(seededPortfolio, networthRateTable, {
  sort: [{ key: "value", direction: "desc" }],
});

describe("net worth export", () => {
  const ds = netWorthExport(seededNetWorth);
  it("produces byte-stable CSV", () => {
    expect(toCsv(ds.table)).toMatchSnapshot();
  });
  it("produces byte-stable JSON", () => {
    expect(toJson(ds.json)).toMatchSnapshot();
  });
  it("names the file with the as-of date", () => {
    expect(ds.name).toMatch(/^net-worth-\d{4}-\d{2}-\d{2}$/);
  });
});

describe("managers export", () => {
  const ds = managersExport(scorecardView);
  it("produces byte-stable CSV", () => {
    expect(toCsv(ds.table)).toMatchSnapshot();
  });
  it("produces byte-stable JSON", () => {
    expect(toJson(ds.json)).toMatchSnapshot();
  });
});

describe("tax timeline export", () => {
  const ds = taxTimelineExport(timeline);
  it("produces byte-stable CSV", () => {
    expect(toCsv(ds.table)).toMatchSnapshot();
  });
  it("produces byte-stable JSON", () => {
    expect(toJson(ds.json)).toMatchSnapshot();
  });
});

describe("board report export", () => {
  const ds = reportExport(report);
  it("produces byte-stable CSV", () => {
    expect(toCsv(ds.table)).toMatchSnapshot();
  });
  it("produces byte-stable JSON", () => {
    expect(toJson(ds.json)).toMatchSnapshot();
  });
});

describe("buildExportFile", () => {
  it("wraps a dataset as a CSV download with the right name + MIME", () => {
    const file = buildExportFile(netWorthExport(seededNetWorth), "csv");
    expect(file.filename).toMatch(/^net-worth-.*\.csv$/);
    expect(file.mimeType).toBe(MIME.csv);
    expect(file.content).toContain("assetClass,label,");
  });

  it("wraps a dataset as a JSON download with the right name + MIME", () => {
    const file = buildExportFile(reportExport(report), "json");
    expect(file.filename).toMatch(/^board-report-.*\.json$/);
    expect(file.mimeType).toBe(MIME.json);
    expect(() => JSON.parse(file.content)).not.toThrow();
  });

  it("is fully deterministic across repeated calls", () => {
    expect(buildExportFile(taxTimelineExport(timeline), "csv").content).toBe(
      buildExportFile(taxTimelineExport(timeline), "csv").content,
    );
    expect(buildExportFile(taxTimelineExport(timeline), "json").content).toBe(
      buildExportFile(taxTimelineExport(timeline), "json").content,
    );
  });

  it("emits valid round-trippable JSON for every page", () => {
    for (const ds of [
      netWorthExport(seededNetWorth),
      managersExport(scorecardView),
      taxTimelineExport(timeline),
      reportExport(report),
      holdingsExport(holdingsView),
    ]) {
      const parsed = JSON.parse(toJson(ds.json));
      expect(parsed).toBeTypeOf("object");
    }
  });
});

describe("holdings export", () => {
  const ds = holdingsExport(holdingsView);

  it("produces byte-stable CSV", () => {
    expect(toCsv(ds.table)).toMatchSnapshot();
  });

  it("produces byte-stable JSON", () => {
    expect(toJson(ds.json)).toMatchSnapshot();
  });

  it("emits one CSV row per visible holding, in the view's order", () => {
    expect(ds.table.rows).toHaveLength(holdingsView.rows.length);
    expect(ds.table.rows[0][0]).toBe(holdingsView.rows[0].name);
  });

  it("serializes money as exact decimal strings (never floats)", () => {
    const json = JSON.parse(toJson(ds.json)) as {
      holdings: { value: string; costBasis: string; gain: string }[];
    };
    for (const h of json.holdings) {
      expect(typeof h.value).toBe("string");
      expect(typeof h.costBasis).toBe("string");
      expect(typeof h.gain).toBe("string");
    }
  });

  it("is deterministic across repeated calls", () => {
    expect(buildExportFile(ds, "csv").content).toBe(
      buildExportFile(holdingsExport(holdingsView), "csv").content,
    );
    expect(buildExportFile(ds, "json").content).toBe(
      buildExportFile(holdingsExport(holdingsView), "json").content,
    );
  });
});
