/**
 * Deterministic export of a {@link BoardReport}.
 *
 * Two byte-stable serializations a board can archive or diff:
 *  - {@link exportReportJson} — canonical, key-ordered JSON.
 *  - {@link exportReportMarkdown} — a human-readable memo.
 *
 * Both are pure functions of the report object (which is itself deterministic),
 * so the same report always produces the exact same bytes — making the export
 * snapshot-testable and safe to commit. READ-ONLY: serializes a report, nothing
 * more.
 */

import { formatBps, formatMoneyWhole, formatPercent } from "@/lib/format";

import type { BoardReport } from "./report";

/** Format a fraction as a percent string, e.g. `0.123 → "12.3%"`. */
function pct(value: number, digits = 2): string {
  return formatPercent(value, { digits });
}

/** Format a base-currency amount with thousands separators, no decimals. */
function money(value: number, currency: string): string {
  return formatMoneyWhole(value, currency);
}

/** Signed basis points, e.g. `0.0123 → "+123 bps"`. */
function bps(value: number): string {
  return formatBps(value);
}

/**
 * Canonical JSON for the report.
 *
 * `JSON.stringify` already preserves the (deterministic) key insertion order of
 * the {@link BoardReport} object, and the report carries only finite numbers and
 * strings, so this is byte-stable for a given report. Pretty-printed with two
 * spaces for human-diffable archives.
 */
export function exportReportJson(report: BoardReport): string {
  return JSON.stringify(report, null, 2);
}

/**
 * A board-memo Markdown rendering of the report. Deterministic and offline; the
 * exact text is pinned by a snapshot test.
 */
export function exportReportMarkdown(report: BoardReport): string {
  const { currency } = report;
  const lines: string[] = [];

  lines.push(`# Board Report — ${report.asOf}`);
  lines.push("");
  lines.push(`Reporting currency: ${currency}`);
  lines.push("");

  // KPI strip.
  lines.push("## Headline");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("| --- | --- |");
  for (const k of report.kpis) {
    lines.push(`| ${k.label} | ${k.display} |`);
  }
  lines.push("");

  // Net worth & TWR.
  const nw = report.netWorth;
  lines.push("## Net worth & TWR");
  lines.push("");
  lines.push(`- Opening: ${money(nw.opening, currency)}`);
  lines.push(`- Current: ${money(nw.current, currency)}`);
  lines.push(`- Window TWR: ${pct(nw.totalReturn)} over ${nw.months} months`);
  lines.push("");
  lines.push("| Asset class | Value | Weight |");
  lines.push("| --- | --- | --- |");
  for (const a of nw.byAssetClass) {
    lines.push(`| ${a.label} | ${money(a.value, currency)} | ${pct(a.weight, 1)} |`);
  }
  lines.push("");

  // Allocation vs policy.
  const p = report.policy;
  lines.push("## Allocation vs. policy (IPS)");
  lines.push("");
  lines.push(
    p.compliant
      ? "- Status: COMPLIANT — no constraints breached."
      : `- Status: ${p.breachCount} breach(es) — ${p.criticalBreaches} critical, ${p.warningBreaches} warning.`,
  );
  if (!p.compliant) {
    lines.push("");
    lines.push("| Subject | Constraint | Weight | Limit | Over/Under |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const b of p.breaches) {
      lines.push(
        `| ${b.subject} | ${b.kind} (${b.bound}) | ${pct(b.weight, 1)} | ${pct(b.limit, 1)} | ${money(b.exceedanceAmount, currency)} |`,
      );
    }
  }
  lines.push("");

  // Benchmark-relative performance.
  const bm = report.benchmark;
  lines.push("## Benchmark-relative performance");
  lines.push("");
  lines.push(`- Benchmark: ${bm.benchmarkLabel}`);
  lines.push(`- Portfolio: ${pct(bm.portfolioReturn)}`);
  lines.push(`- Benchmark: ${pct(bm.benchmarkReturn)}`);
  lines.push(`- Excess (active): ${bps(bm.excessReturn)}`);
  lines.push(`- Tracking error: ${pct(bm.trackingError)}`);
  lines.push(`- Information ratio: ${bm.informationRatio.toFixed(2)}`);
  lines.push(`- Beta: ${bm.beta.toFixed(2)} · Alpha: ${bps(bm.alpha)}`);
  lines.push("");

  // Attribution.
  const at = report.attribution;
  lines.push(`## Attribution (${at.method})`);
  lines.push("");
  lines.push(`- Active return: ${bps(at.activeReturn)}`);
  lines.push(`- Allocation: ${bps(at.totalAllocation)}`);
  lines.push(`- Selection: ${bps(at.totalSelection)}`);
  lines.push(`- Interaction: ${bps(at.totalInteraction)}`);
  lines.push("");
  lines.push("| Segment | Allocation | Selection | Interaction | Total |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const s of at.segments) {
    lines.push(
      `| ${s.label} | ${bps(s.allocation)} | ${bps(s.selection)} | ${bps(s.interaction)} | ${bps(s.total)} |`,
    );
  }
  lines.push("");

  // Fees.
  const fe = report.fees;
  lines.push("## Fees & total cost of ownership");
  lines.push("");
  lines.push(`- Capital invested: ${money(fe.totalInvested, currency)}`);
  lines.push(`- All-in annual cost: ${money(fe.totalAnnualCost, currency)}`);
  lines.push(`- Blended expense ratio: ${pct(fe.blendedRate)}`);
  lines.push(
    `- Fee drag: ${pct(fe.dragShareOfProfit, 1)} of gross gains over ${fe.horizonYears} years (${money(fe.terminalDrag, currency)}).`,
  );
  lines.push("");

  // Private markets.
  const pm = report.privateMarkets;
  lines.push("## Private markets (PE)");
  lines.push("");
  lines.push(`- Committed: ${money(pm.committed, currency)}`);
  lines.push(`- Paid in: ${money(pm.paidIn, currency)} · Distributed: ${money(pm.distributed, currency)}`);
  lines.push(`- NAV: ${money(pm.nav, currency)} · Unfunded: ${money(pm.unfunded, currency)}`);
  lines.push(
    `- TVPI: ${pm.tvpi.toFixed(2)}× · DPI: ${pm.dpi.toFixed(2)}× · RVPI: ${pm.rvpi.toFixed(2)}×`,
  );
  lines.push(`- Pooled IRR: ${pm.irr === null ? "n/a" : pct(pm.irr)}`);
  lines.push("");

  // Trailing newline for a clean, diff-friendly file.
  return `${lines.join("\n")}\n`;
}
