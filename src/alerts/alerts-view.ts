import type { AlertEvaluation, AlertReport } from "@/lib/alerts";
import { formatLimit, formatWeight, SCOPE_LABEL, SEVERITY_LABEL } from "@/lib/alerts";
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
