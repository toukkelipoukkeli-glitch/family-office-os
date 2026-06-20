import type { BreachSeverity } from "./policy";
import type { ComplianceReport, ConstraintBreach } from "./engine";

/**
 * Breach history — track how IPS compliance evolves across successive
 * portfolio valuations.
 *
 * A family office reviews its mandate periodically (e.g. each month-end). This
 * module turns a time-ordered list of {@link ComplianceReport}s into a
 * governance log: at each point it records the active breaches, and between
 * consecutive points it derives which breaches **opened**, which **persisted**,
 * and which were **resolved**. That diff is what a compliance officer reads —
 * "the equity floor breach we flagged in March cleared in April; a new crypto
 * cap breach opened".
 *
 * Pure and deterministic: it only diffs reports the engine already produced.
 * READ-ONLY product — a history is a record for humans, never an instruction.
 */

/** A breach keyed by its stable identity (constraint + bound + subject). */
function breachKey(b: ConstraintBreach): string {
  return `${b.constraint.id}::${b.bound}::${b.subject}`;
}

/** A single dated compliance observation paired with its report. */
export interface CompliancePoint {
  /** ISO date/time this evaluation is as-of. */
  asOf: string;
  /** The compliance report at this point. */
  report: ComplianceReport;
}

/** A breach as recorded in the history, with a stable key. */
export interface HistoricalBreach {
  /** Stable identity: constraint id + bound + subject. */
  key: string;
  /** The constraint label, e.g. "Equity allocation band". */
  label: string;
  /** The subject measured, e.g. "Equities". */
  subject: string;
  /** Severity at this observation. */
  severity: BreachSeverity;
}

/** The transition between two consecutive {@link CompliancePoint}s. */
export interface ComplianceTransition {
  /** As-of of the earlier point (`undefined` for the first point). */
  fromAsOf?: string;
  /** As-of of this point. */
  asOf: string;
  /** Breaches present now that were absent at the previous point. */
  opened: HistoricalBreach[];
  /** Breaches present at both the previous point and now. */
  persisting: HistoricalBreach[];
  /** Breaches present at the previous point but absent now. */
  resolved: HistoricalBreach[];
  /** Every breach active at this point. */
  active: HistoricalBreach[];
}

/** A full breach-history timeline. */
export interface BreachHistory {
  /** One transition per observed point, in chronological order. */
  transitions: ComplianceTransition[];
  /**
   * Breaches still active at the most recent point that have been open since a
   * strictly earlier point — i.e. unresolved breaches that are not brand new.
   * Useful to surface "outstanding" governance items.
   */
  outstanding: HistoricalBreach[];
}

function toHistorical(b: ConstraintBreach): HistoricalBreach {
  return {
    key: breachKey(b),
    label: b.constraint.label,
    subject: b.subject,
    severity: b.severity,
  };
}

function byKey(a: HistoricalBreach, b: HistoricalBreach): number {
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

/**
 * Build a {@link BreachHistory} from time-ordered compliance points.
 *
 * Points must already be sorted oldest-first by the caller (the engine has no
 * notion of time); this function does not reorder them so the governance log
 * reflects exactly the sequence supplied.
 *
 * @param points one observation per valuation date, oldest first.
 */
export function buildBreachHistory(points: CompliancePoint[]): BreachHistory {
  const transitions: ComplianceTransition[] = [];
  // Track the as-of when each currently-open breach key first opened, so we can
  // tell "brand new at the last point" from "outstanding for a while".
  const openedAt = new Map<string, string>();

  let prevKeys = new Set<string>();
  let prevByKey = new Map<string, HistoricalBreach>();

  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    const current = point.report.breaches.map(toHistorical);
    const currentByKey = new Map(current.map((b) => [b.key, b]));
    const currentKeys = new Set(currentByKey.keys());

    const opened: HistoricalBreach[] = [];
    const persisting: HistoricalBreach[] = [];
    for (const b of current) {
      if (prevKeys.has(b.key)) {
        persisting.push(b);
      } else {
        opened.push(b);
        openedAt.set(b.key, point.asOf);
      }
    }
    const resolved: HistoricalBreach[] = [];
    for (const [key, b] of prevByKey) {
      if (!currentKeys.has(key)) {
        resolved.push(b);
        openedAt.delete(key);
      }
    }

    opened.sort(byKey);
    persisting.sort(byKey);
    resolved.sort(byKey);
    const active = [...current].sort(byKey);

    transitions.push({
      fromAsOf: i === 0 ? undefined : points[i - 1].asOf,
      asOf: point.asOf,
      opened,
      persisting,
      resolved,
      active,
    });

    prevKeys = currentKeys;
    prevByKey = currentByKey;
  }

  // Outstanding = active at the last point AND opened before the last point.
  const lastAsOf = points.length ? points[points.length - 1].asOf : undefined;
  const outstanding: HistoricalBreach[] = [];
  if (points.length) {
    const last = points[points.length - 1].report.breaches.map(toHistorical);
    for (const b of last) {
      if (openedAt.get(b.key) !== lastAsOf) outstanding.push(b);
    }
    outstanding.sort(byKey);
  }

  return { transitions, outstanding };
}
