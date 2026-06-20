/**
 * Page-model → export-payload adapters.
 *
 * Each `*Export` function turns one data-heavy page's deterministic model into a
 * pair of byte-stable payloads: a {@link CsvTable} (the page's primary table)
 * and a plain JSON-ready object (the full structured view). The page wires an
 * Export button to {@link buildExports}, which serializes these with
 * {@link toCsv} / {@link toJson} and hands them to {@link triggerDownload}.
 *
 * Money crosses the export boundary as an exact decimal *string* (via
 * {@link Money.amount}.toFixed()) in JSON, and as a `number` only in the CSV
 * numeric columns at the very edge — honouring AGENTS.md ("number only at the
 * render boundary"). Everything here is pure, deterministic and offline.
 */

import type { CsvCell, CsvTable } from "./csv";
import { toCsv } from "./csv";
import { toJson } from "./json";
import { MIME, slugifyFilename, type DownloadFile } from "./download";

import type { NetWorthDashboardModel } from "@/lib/networth";
import type { ScorecardView } from "@/lib/managers";
import type { TaxTimeline } from "@/lib/taxtimeline";
import type { BoardReport } from "@/lib/reporting";
import { assetClassLabel } from "@/lib/model/asset-class";

/** A named export comprising a CSV table and a JSON-serializable object. */
export interface ExportDataset {
  /** File-name stem (no extension), e.g. `net-worth-2026-06-19`. */
  readonly name: string;
  /** The primary table, for CSV. */
  readonly table: CsvTable;
  /** The full structured payload, for JSON. */
  readonly json: unknown;
}

/* ------------------------------------------------------------------------- */
/* Generic adapter                                                           */
/* ------------------------------------------------------------------------- */

/**
 * Build an {@link ExportDataset} from an already-flattened page model.
 *
 * Most page view-models are already plain, deterministic objects of finite
 * numbers and strings (Decimals collapsed to fixed strings / numbers at the
 * model boundary). For those pages the export is just: pick the primary table
 * (its `columns` + `rows`) for CSV, and hand the full view to JSON verbatim.
 * This keeps each page's export adapter a one-liner at the call site while still
 * routing through the same pure, byte-stable serializers.
 *
 * `name` is slugified into the file-name stem; `columns`/`rows` become the CSV
 * table; `json` is the full structured payload (defaults to a `{columns, rows}`
 * wrapper when omitted). Nothing here touches the clock, network or DOM.
 */
export function tableExport(
  name: string,
  columns: readonly string[],
  rows: ReadonlyArray<readonly CsvCell[]>,
  json?: unknown,
): ExportDataset {
  const table: CsvTable = { columns, rows };
  return {
    name: slugifyFilename(name),
    table,
    json: json ?? { columns, rows },
  };
}

/* ------------------------------------------------------------------------- */
/* Net worth / holdings                                                      */
/* ------------------------------------------------------------------------- */

/**
 * Net-worth dashboard → allocation-by-asset-class table + full series JSON.
 * The CSV is the allocation breakdown (one row per class); the JSON additionally
 * carries the consolidated and per-class monthly series.
 */
export function netWorthExport(model: NetWorthDashboardModel): ExportDataset {
  const asOf = model.total.points[model.total.points.length - 1]?.date ?? "";

  const rows: CsvCell[][] = model.byAssetClass.map((d) => [
    d.assetClass,
    assetClassLabel(d.assetClass),
    // Currency stays an exact Decimal string even in CSV — never floating-point.
    d.value.amount.toFixed(),
    d.weight.toNumber(),
    d.holdingCount,
  ]);

  const table: CsvTable = {
    columns: ["assetClass", "label", `value (${model.baseCurrency})`, "weight", "holdings"],
    rows,
  };

  const json = {
    asOf,
    baseCurrency: model.baseCurrency,
    current: model.current.amount.toFixed(),
    opening: model.opening.amount.toFixed(),
    totalReturn: model.totalReturn.toNumber(),
    byAssetClass: model.byAssetClass.map((d) => ({
      assetClass: d.assetClass,
      label: assetClassLabel(d.assetClass),
      value: d.value.amount.toFixed(),
      weight: d.weight.toNumber(),
      holdingCount: d.holdingCount,
    })),
    series: model.total.points.map((p) => ({
      date: p.date,
      value: p.value.amount.toFixed(),
    })),
  };

  return { name: slugifyFilename(`net-worth-${asOf}`), table, json };
}

/* ------------------------------------------------------------------------- */
/* Managers / fund scorecard                                                 */
/* ------------------------------------------------------------------------- */

/** Manager scorecard view → ranked-roster table + full view JSON. */
export function managersExport(view: ScorecardView): ExportDataset {
  const rows: CsvCell[][] = view.roster.map((r) => [
    r.rank,
    r.id,
    r.name,
    r.strategy,
    r.vintage,
    r.aum,
    r.grossTotal,
    r.netTotal,
    r.excessReturn,
    r.informationRatio,
    r.feeDragShare,
    r.score,
  ]);

  const table: CsvTable = {
    columns: [
      "rank",
      "id",
      "name",
      "strategy",
      "vintage",
      "aum",
      "grossTotal",
      "netTotal",
      "excessReturn",
      "informationRatio",
      "feeDragShare",
      "score",
    ],
    rows,
  };

  const json = {
    selectedId: view.selectedId,
    roster: view.roster.map((r) => ({ ...r })),
    detail: {
      id: view.detail.id,
      name: view.detail.name,
      strategy: view.detail.strategy,
      vintage: view.detail.vintage,
      aum: view.detail.aum,
      grossTotal: view.detail.grossTotal,
      netTotal: view.detail.netTotal,
      feeDrag: view.detail.feeDrag,
      feeDragShare: view.detail.feeDragShare,
      excessReturn: view.detail.excessReturn,
      benchmarkReturn: view.detail.benchmarkReturn,
      trackingError: view.detail.trackingError,
      informationRatio: view.detail.informationRatio,
      beta: view.detail.beta,
      hitRate: view.detail.hitRate,
      score: view.detail.score,
    },
  };

  return { name: "manager-scorecard", table, json };
}

/* ------------------------------------------------------------------------- */
/* Tax timeline                                                              */
/* ------------------------------------------------------------------------- */

/** Tax timeline → chronological events table + full timeline JSON. */
export function taxTimelineExport(timeline: TaxTimeline): ExportDataset {
  const rows: CsvCell[][] = timeline.events.map((e) => [
    e.date,
    e.category,
    e.severity,
    e.title,
    e.detail,
    // Currency stays an exact Decimal string even in CSV — never floating-point.
    e.amount ? e.amount.amount.toFixed() : null,
    e.windowEnd ?? null,
  ]);

  const table: CsvTable = {
    columns: [
      "date",
      "category",
      "severity",
      "title",
      "detail",
      `amount (${timeline.currency})`,
      "windowEnd",
    ],
    rows,
  };

  const json = {
    year: timeline.year,
    currency: timeline.currency,
    deadlineCount: timeline.deadlineCount,
    estimatedTax: timeline.estimatedTax.amount.toFixed(),
    quarterlyPayment: timeline.quarterlyPayment.amount.toFixed(),
    harvestableLoss: timeline.harvestableLoss.amount.toFixed(),
    charitableBenefit: timeline.charitableBenefit.amount.toFixed(),
    byCategory: timeline.byCategory.map((c) => ({
      category: c.category,
      count: c.count,
      total: c.total.amount.toFixed(),
    })),
    events: timeline.events.map((e) => ({
      id: e.id,
      date: e.date,
      category: e.category,
      severity: e.severity,
      title: e.title,
      detail: e.detail,
      amount: e.amount ? e.amount.amount.toFixed() : null,
      windowEnd: e.windowEnd ?? null,
    })),
  };

  return { name: slugifyFilename(`tax-timeline-${timeline.year}`), table, json };
}

/* ------------------------------------------------------------------------- */
/* Board report                                                              */
/* ------------------------------------------------------------------------- */

/** Board report → headline KPI table + full report JSON. */
export function reportExport(report: BoardReport): ExportDataset {
  const rows: CsvCell[][] = report.kpis.map((k) => [
    k.key,
    k.label,
    k.display,
    k.raw,
  ]);

  const table: CsvTable = {
    columns: ["key", "label", "display", "raw"],
    rows,
  };

  // The BoardReport is already a plain, deterministic object of finite numbers
  // and strings; export it verbatim (canonicalized by `toJson`).
  return {
    name: slugifyFilename(`board-report-${report.asOf}`),
    table,
    json: report,
  };
}

/* ------------------------------------------------------------------------- */
/* Serialization                                                             */
/* ------------------------------------------------------------------------- */

/** A supported export format. */
export type ExportFormat = "csv" | "json";

/** Serialize an {@link ExportDataset} to a downloadable file in `format`. */
export function buildExportFile(
  dataset: ExportDataset,
  format: ExportFormat,
): DownloadFile {
  if (format === "csv") {
    return {
      filename: `${dataset.name}.csv`,
      content: toCsv(dataset.table),
      mimeType: MIME.csv,
    };
  }
  return {
    filename: `${dataset.name}.json`,
    content: toJson(dataset.json),
    mimeType: MIME.json,
  };
}
