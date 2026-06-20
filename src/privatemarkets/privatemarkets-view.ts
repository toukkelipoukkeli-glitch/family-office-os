import { Decimal } from "decimal.js";

import {
  computeLifecycle,
  type FundPosition,
  type JCurvePoint,
  type LifecycleMetrics,
} from "@/lib/privatemarkets";

/**
 * Presentation layer for the private-markets lifecycle page. Keeps all
 * formatting and derivation out of the React component so it is unit-testable
 * without a DOM. Everything in/out is a plain string; the heavy math stays in
 * {@link computeLifecycle}.
 */

/** Format a whole-currency amount (no minor units) as `$1,234,567`. */
export function formatMoney(amount: Decimal, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount.toNumber());
}

/** Format a multiple as `1.75x` (two decimals). */
export function formatMultiple(value: Decimal): string {
  return `${value.toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN).toFixed(2)}x`;
}

/** Format a fraction as a percentage, e.g. 0.8 -> `80.0%`. */
export function formatPct(value: Decimal, dp = 1): string {
  return `${value.times(100).toDecimalPlaces(dp, Decimal.ROUND_HALF_EVEN).toFixed(dp)}%`;
}

/** Format an IRR Decimal (or null) as a signed percentage or an em dash. */
export function formatIrr(irr: Decimal | null): string {
  if (irr === null) return "—";
  const pct = irr.times(100).toDecimalPlaces(1, Decimal.ROUND_HALF_EVEN);
  const sign = pct.isPositive() && !pct.isZero() ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

/** One ledger row rendered by the page. */
export interface LedgerRow {
  date: string;
  kind: "call" | "distribution";
  kindLabel: string;
  /** Signed, formatted amount (calls shown negative). */
  amount: string;
  note: string;
}

/** A single J-curve point shaped for the SVG sparkline + axis labels. */
export interface JCurveViewPoint {
  date: string;
  cumulativeNet: number;
  /** Formatted cumulative net cashflow. */
  cumulativeNetLabel: string;
}

/** Geometry for the J-curve SVG sparkline, computed in view space. */
export interface JCurveChart {
  /** SVG path `d` for the cumulative-net polyline. */
  path: string;
  /** Y coordinate of the zero baseline within the viewBox. */
  zeroY: number;
  width: number;
  height: number;
  points: { x: number; y: number; date: string; net: number }[];
  /** Most-negative cumulative net (the J-curve trough), formatted. */
  troughLabel: string;
  /** Final cumulative net, formatted. */
  finalLabel: string;
}

export interface LifecycleViewModel {
  fundName: string;
  vintageYear: number;
  currency: string;
  committed: string;
  paidIn: string;
  distributed: string;
  nav: string;
  unfunded: string;
  calledPct: string;
  /** Width fraction (0–100) for the called-capital progress bar. */
  calledBarPct: number;
  tvpi: string;
  dpi: string;
  rvpi: string;
  moic: string;
  irr: string;
  /** True when the fund has returned more than was paid in (TVPI > 1). */
  inProfit: boolean;
  ledger: LedgerRow[];
  jCurve: JCurveChart;
}

const VIEW_W = 600;
const VIEW_H = 160;
const PAD = 8;

function buildJCurveChart(
  points: JCurvePoint[],
  currency: string,
): JCurveChart {
  const nets = points.map((p) => p.cumulativeNet.toNumber());
  // Include zero so the baseline is always within range.
  const values = [...nets, 0];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const innerW = VIEW_W - PAD * 2;
  const innerH = VIEW_H - PAD * 2;

  const toY = (v: number) => PAD + innerH - ((v - min) / span) * innerH;
  const toX = (i: number) =>
    points.length <= 1 ? VIEW_W / 2 : PAD + (i / (points.length - 1)) * innerW;

  const coords = points.map((p, i) => ({
    x: toX(i),
    y: toY(p.cumulativeNet.toNumber()),
    date: p.date,
    net: p.cumulativeNet.toNumber(),
  }));

  const path = coords
    .map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(" ");

  const trough = nets.length ? Math.min(...nets) : 0;
  const final = nets.length ? nets[nets.length - 1] : 0;

  return {
    path,
    zeroY: toY(0),
    width: VIEW_W,
    height: VIEW_H,
    points: coords,
    troughLabel: formatMoney(new Decimal(trough), currency),
    finalLabel: formatMoney(new Decimal(final), currency),
  };
}

const KIND_LABEL: Record<"call" | "distribution", string> = {
  call: "Capital call",
  distribution: "Distribution",
};

/**
 * Build the full view model for a fund position: pre-formatted metrics, the
 * ledger rows, and the J-curve sparkline geometry.
 */
export function buildViewModel(position: FundPosition): LifecycleViewModel {
  const m: LifecycleMetrics = computeLifecycle(position);
  const currency = m.currency;

  // Re-derive the ledger in date order to match the engine's J-curve ordering.
  const ledger: LedgerRow[] = [...position.cashflows]
    .map((cf, i) => ({ ...cf, _i: i }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a._i - b._i))
    .map((cf) => {
      const amount = new Decimal(cf.amount);
      const signed = cf.kind === "call" ? amount.negated() : amount;
      return {
        date: cf.date,
        kind: cf.kind,
        kindLabel: KIND_LABEL[cf.kind],
        amount: formatMoney(signed, currency),
        note: cf.note ?? "",
      };
    });

  return {
    fundName: m.fundName,
    vintageYear: m.vintageYear,
    currency,
    committed: formatMoney(m.committed, currency),
    paidIn: formatMoney(m.paidIn, currency),
    distributed: formatMoney(m.distributed, currency),
    nav: formatMoney(m.nav, currency),
    unfunded: formatMoney(m.unfunded, currency),
    calledPct: formatPct(m.calledPct),
    calledBarPct: Math.min(
      100,
      Math.max(0, m.calledPct.times(100).toNumber()),
    ),
    tvpi: formatMultiple(m.tvpi),
    dpi: formatMultiple(m.dpi),
    rvpi: formatMultiple(m.rvpi),
    moic: formatMultiple(m.moic),
    irr: formatIrr(m.irr),
    inProfit: m.tvpi.greaterThan(1),
    ledger,
    jCurve: buildJCurveChart(m.jCurve, currency),
  };
}
