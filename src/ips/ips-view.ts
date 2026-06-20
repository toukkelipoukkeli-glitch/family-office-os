import type { ComplianceReport, ConstraintCheck } from "@/lib/ips";
import { formatLimit, formatWeight, KIND_LABEL, SEVERITY_LABEL } from "@/lib/ips";
import { Money } from "@/lib/money";

/**
 * View-model adapter for the IPS compliance dashboard. Turns a
 * {@link ComplianceReport} from the pure engine into ready-to-render strings,
 * keeping all formatting out of the React component so the page stays
 * declarative and the formatting is independently unit-testable.
 */

/** A single constraint-check row prepared for display. */
export interface IpsRow {
  id: string;
  /** Constraint label, e.g. "Equity allocation band". */
  constraintLabel: string;
  /** The group / position / pool measured, e.g. "USD Cash". */
  subject: string;
  /** Kind label, e.g. "Position cap". */
  kindLabel: string;
  /** Severity label ("Critical" / "Warning"). */
  severityLabel: string;
  /** Raw severity for styling. */
  severity: ConstraintCheck["severity"];
  /** Whether this row is a breach. */
  breached: boolean;
  /** Current measured weight, e.g. "86.8%". */
  weightLabel: string;
  /** Limit description, e.g. "max 20.0%". */
  limitLabel: string;
  /** Base-currency value of the subject, formatted. */
  valueLabel: string;
  /**
   * Human sentence describing the breach, or `undefined` when compliant.
   * e.g. "192,416 USD over the 20.0% ceiling".
   */
  breachDetail?: string;
  /** Progress of weight against the limit, clamped to [0, 1], for a bar. */
  fill: number;
}

/** The full prepared view-model for the page. */
export interface IpsViewModel {
  policyName: string;
  /** Benchmark label, e.g. "Balanced 60/40 policy", or undefined. */
  benchmarkLabel?: string;
  rows: IpsRow[];
  breaches: IpsRow[];
  criticalCount: number;
  warningCount: number;
  totalBreaches: number;
  /** True when nothing is breached (a compliant book). */
  compliant: boolean;
  /** Formatted portfolio total, e.g. "$287,920.00". */
  totalLabel: string;
  baseCurrency: string;
}

function formatBaseMoney(amount: { toFixed(): string }, currency: string): string {
  return Money.of(amount.toFixed(), currency).format();
}

function buildRow(c: ConstraintCheck, currency: string): IpsRow {
  const weightLabel = formatWeight(c.weight);
  const limitLabel = formatLimit(c.bound, c.limit);
  const valueLabel = c.value.format();

  let breachDetail: string | undefined;
  if (c.breached) {
    const over = formatBaseMoney(c.exceedanceAmount.amount, currency);
    breachDetail =
      c.bound === "max"
        ? `${over} over the ${formatWeight(c.limit)} ceiling`
        : `${over} short of the ${formatWeight(c.limit)} floor`;
  }

  // Bar fill: for a max check, fraction of the ceiling consumed; for a min
  // check, fraction of the floor reached. Clamped to [0, 1].
  const ratio = c.limit.isZero()
    ? c.weight.isZero()
      ? 0
      : 1
    : c.weight.div(c.limit).toNumber();
  const fill = Math.max(0, Math.min(1, ratio));

  return {
    id: `${c.constraint.id}::${c.bound}::${c.subject}`,
    constraintLabel: c.constraint.label,
    subject: c.subject,
    kindLabel: KIND_LABEL[c.kind],
    severityLabel: SEVERITY_LABEL[c.severity],
    severity: c.severity,
    breached: c.breached,
    weightLabel,
    limitLabel,
    valueLabel,
    breachDetail,
    fill,
  };
}

/** Adapt a {@link ComplianceReport} into an {@link IpsViewModel}. */
export function buildIpsViewModel(report: ComplianceReport): IpsViewModel {
  const rows = report.checks.map((c) => buildRow(c, report.baseCurrency));
  const breaches = rows.filter((r) => r.breached);
  return {
    policyName: report.policy.name,
    benchmarkLabel: report.policy.benchmark?.label,
    rows,
    breaches,
    criticalCount: report.counts.critical,
    warningCount: report.counts.warning,
    totalBreaches: report.breaches.length,
    compliant: report.compliant,
    totalLabel: report.total.format(),
    baseCurrency: report.baseCurrency,
  };
}
