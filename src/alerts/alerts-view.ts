import type { AlertEvaluation, AlertReport } from "@/lib/alerts";
import { formatLimit, formatWeight, SCOPE_LABEL, SEVERITY_LABEL } from "@/lib/alerts";
import type { CsvCell, CsvTable, ExportDataset } from "@/lib/export";
import { Money } from "@/lib/money";

/**
 * View-model adapter for the alerts dashboard. Turns an {@link AlertReport} from
 * the pure engine into ready-to-render strings, keeping all formatting out of
 * the React component so the page stays declarative and the formatting is
 * independently unit-testable.
 */

/** A single alert row prepared for display. */
export interface AlertRow {
  id: string;
  /** Rule label, e.g. "Single-position limit". */
  ruleLabel: string;
  /** The group / position the rule measured, e.g. "USD Cash". */
  subject: string;
  /** Scope label, e.g. "Position". */
  scopeLabel: string;
  /** Severity label ("Critical" / "Warning"). */
  severityLabel: string;
  /** Raw severity for styling. */
  severity: AlertEvaluation["severity"];
  /** Whether this row is a breach. */
  breached: boolean;
  /** Current measured weight, e.g. "86.8%". */
  weightLabel: string;
  /** Limit description, e.g. "max 20.0%". */
  limitLabel: string;
  /** Base-currency value of the subject, formatted. */
  valueLabel: string;
  /**
   * Human sentence describing the breach, or `undefined` when within the limit.
   * e.g. "192,416 USD over the 20.0% ceiling".
   */
  breachDetail?: string;
  /** Progress of weight against the threshold, clamped to [0, 1], for a bar. */
  fill: number;
  /**
   * The raw engine evaluation behind this row, kept so an export can derive
   * exact-Decimal weights and base-currency {@link Money} amounts (rather than
   * re-parsing the formatted display strings).
   */
  evaluation: AlertEvaluation;
}

/** The full prepared view-model for the page. */
export interface AlertsViewModel {
  rows: AlertRow[];
  breaches: AlertRow[];
  criticalCount: number;
  warningCount: number;
  totalBreaches: number;
  /** True when nothing is breached (a clean book). */
  allClear: boolean;
  /** Formatted portfolio total, e.g. "$287,920.00". */
  totalLabel: string;
  baseCurrency: string;
}

function formatBaseMoney(amount: { toFixed(): string }, currency: string): string {
  return Money.of(amount.toFixed(), currency).format();
}

function buildRow(e: AlertEvaluation, currency: string): AlertRow {
  const weightLabel = formatWeight(e.weight);
  const limitLabel = formatLimit(e.direction, e.threshold);
  const valueLabel = e.value.format();

  let breachDetail: string | undefined;
  if (e.breached) {
    const over = formatBaseMoney(e.exceedanceAmount.amount, currency);
    if (e.direction === "max") {
      breachDetail = `${over} over the ${formatWeight(e.threshold)} ceiling`;
    } else {
      breachDetail = `${over} short of the ${formatWeight(e.threshold)} floor`;
    }
  }

  // Bar fill: for a max rule, fraction of the ceiling consumed; for a min rule,
  // fraction of the floor reached. Clamped to [0, 1].
  const ratio = e.threshold.isZero()
    ? e.weight.isZero()
      ? 0
      : 1
    : e.weight.div(e.threshold).toNumber();
  const fill = Math.max(0, Math.min(1, ratio));

  return {
    id: `${e.rule.id}::${e.subject}`,
    ruleLabel: e.rule.label,
    subject: e.subject,
    scopeLabel: SCOPE_LABEL[e.scope],
    severityLabel: SEVERITY_LABEL[e.severity],
    severity: e.severity,
    breached: e.breached,
    weightLabel,
    limitLabel,
    valueLabel,
    breachDetail,
    fill,
    evaluation: e,
  };
}

/** Adapt an {@link AlertReport} into a {@link AlertsViewModel}. */
export function buildAlertsViewModel(report: AlertReport): AlertsViewModel {
  const rows = report.evaluations.map((e) => buildRow(e, report.baseCurrency));
  const breaches = rows.filter((r) => r.breached);
  return {
    rows,
    breaches,
    criticalCount: report.counts.critical,
    warningCount: report.counts.warning,
    totalBreaches: report.breaches.length,
    allClear: report.breaches.length === 0,
    totalLabel: report.total.format(),
    baseCurrency: report.baseCurrency,
  };
}

/**
 * Build a CSV/JSON export of the alert rows **currently visible** on screen.
 *
 * The page passes the *filtered* row list (all rules, or just the breaches),
 * so the download reproduces exactly what the analyst is looking at — fixing
 * the prior behaviour where the export ignored the active filter. Weights,
 * thresholds and exceedances cross the boundary as exact-{@link Decimal} strings;
 * subject values are base-currency {@link Money} amounts (`amount`/`currency`).
 * READ-ONLY: it only serializes data already on screen.
 */
export function buildAlertsExport(
  rows: readonly AlertRow[],
  baseCurrency: string,
): ExportDataset {
  const cells = (row: AlertRow): CsvCell[] => {
    const e = row.evaluation;
    return [
      e.rule.id,
      row.ruleLabel,
      row.subject,
      row.scopeLabel,
      e.direction,
      row.severityLabel,
      row.breached,
      e.weight.toFixed(),
      e.threshold.toFixed(),
      e.exceedance.toFixed(),
      // Money stays an exact decimal string even in CSV — never floating-point.
      e.value.amount.toFixed(),
      e.exceedanceAmount.amount.toFixed(),
    ];
  };

  const table: CsvTable = {
    columns: [
      "ruleId",
      "rule",
      "subject",
      "scope",
      "direction",
      "severity",
      "breached",
      "weight",
      "threshold",
      "exceedance",
      `value (${baseCurrency})`,
      `exceedanceAmount (${baseCurrency})`,
    ],
    rows: rows.map(cells),
  };

  const json = {
    baseCurrency,
    count: rows.length,
    alerts: rows.map((row) => {
      const e = row.evaluation;
      return {
        ruleId: e.rule.id,
        rule: row.ruleLabel,
        subject: row.subject,
        scope: e.scope,
        direction: e.direction,
        severity: e.severity,
        breached: e.breached,
        weight: e.weight.toFixed(),
        threshold: e.threshold.toFixed(),
        exceedance: e.exceedance.toFixed(),
        value: e.value.amount.toFixed(),
        currency: e.value.currency,
        exceedanceAmount: e.exceedanceAmount.amount.toFixed(),
      };
    }),
  };

  return { name: "alerts", table, json };
}
