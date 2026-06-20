import type { BoardReport } from "@/lib/reporting";

/**
 * Deterministic prompt construction for the portfolio-narrative adapter.
 *
 * The board report is already a pure, deterministic composition of every
 * family-office engine. Here we distill it into a compact, factual brief that
 * the Gemini adapter sends as the model prompt. Keeping this pure (and tested)
 * means the *input* to the AI is reproducible even though the model output is
 * not — and it gives us a deterministic, offline fallback narrative when the AI
 * is unavailable.
 */

function pct(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

function money(value: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

/**
 * A flat, machine-friendly set of portfolio facts extracted from the board
 * report. Exposed so tests can assert the brief without re-deriving formatting.
 */
export interface PortfolioBrief {
  readonly asOf: string;
  readonly currency: string;
  readonly netWorth: string;
  readonly totalReturn: string;
  readonly topHolding: string;
  readonly compliant: boolean;
  readonly breachCount: number;
  readonly excessReturn: string;
  readonly informationRatio: string;
  readonly feeRate: string;
  readonly tvpi: string;
}

/** Distill a {@link BoardReport} into a compact, deterministic brief. */
export function toPortfolioBrief(report: BoardReport): PortfolioBrief {
  const { currency } = report;
  const top = report.netWorth.byAssetClass[0];
  return {
    asOf: report.asOf,
    currency,
    netWorth: money(report.netWorth.current, currency),
    totalReturn: pct(report.netWorth.totalReturn),
    topHolding: top
      ? `${top.label} (${pct(top.weight)})`
      : "n/a",
    compliant: report.policy.compliant,
    breachCount: report.policy.breachCount,
    excessReturn: pct(report.benchmark.excessReturn),
    informationRatio: report.benchmark.informationRatio.toFixed(2),
    feeRate: pct(report.fees.blendedRate, 2),
    tvpi: `${report.privateMarkets.tvpi.toFixed(2)}×`,
  };
}

/**
 * Build the natural-language prompt sent to Gemini. Deterministic given the
 * report, so the request is reproducible in tests and the brief is auditable.
 */
export function buildNarrativePrompt(report: BoardReport): string {
  const b = toPortfolioBrief(report);
  const complianceLine = b.compliant
    ? "The portfolio is fully within its IPS policy limits."
    : `The portfolio has ${b.breachCount} IPS policy breach(es).`;
  return [
    "You are a family-office analyst. Write a concise, plain-English summary",
    "(3-5 sentences) of the portfolio's current state for a non-technical",
    "principal. Be factual and neutral. Do NOT give investment advice and do",
    "NOT recommend any trades.",
    "",
    `As of ${b.asOf}, the consolidated net worth is ${b.netWorth} in`,
    `${b.currency}, with a cumulative time-weighted return of ${b.totalReturn}.`,
    `The largest allocation is ${b.topHolding}. ${complianceLine}`,
    `Active (excess) return versus policy benchmark is ${b.excessReturn} with`,
    `an information ratio of ${b.informationRatio}. Blended fee rate is`,
    `${b.feeRate}; private-markets TVPI is ${b.tvpi}.`,
  ].join("\n");
}

/**
 * A deterministic, offline narrative built directly from the brief. The adapter
 * attaches this to every result, so when the AI is unavailable the panel can
 * show "AI insights unavailable" *and* still present the same facts in prose.
 * Pure and offline — reproducible given the report.
 */
export function deterministicNarrative(report: BoardReport): string {
  const b = toPortfolioBrief(report);
  const compliance = b.compliant
    ? "and is fully within its IPS policy limits"
    : `with ${b.breachCount} IPS policy breach(es) flagged`;
  return (
    `As of ${b.asOf}, consolidated net worth stands at ${b.netWorth} ` +
    `(${b.currency}), a cumulative time-weighted return of ${b.totalReturn}. ` +
    `The largest allocation is ${b.topHolding}, ${compliance}. ` +
    `Active return versus the policy benchmark is ${b.excessReturn} ` +
    `(information ratio ${b.informationRatio}). The blended fee rate is ` +
    `${b.feeRate} and private-markets TVPI is ${b.tvpi}.`
  );
}
