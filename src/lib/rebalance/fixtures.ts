import { usdRateTable } from "../allocation/fixtures";
import type { FxRateTable } from "../allocation/fx";
import type { AssetClass } from "../model/asset-class";
import type { Holding } from "../model/holding";
import type { Portfolio } from "../model/portfolio";
import {
  sampleSchedule,
} from "../taxestimate/fixtures";
import type { RateSchedule } from "../taxestimate";
import type { TargetWeights } from "../allocation";

/**
 * Deterministic, offline fixtures for the m10 tax-aware rebalancer.
 *
 * The book is constructed so the numbers are easy to hand-verify and so the
 * lot-selection method actually matters (HIFO realizes a smaller gain than
 * FIFO). Base currency USD; EUR = 1.10 via the shared {@link usdRateTable}.
 *
 * Holdings (base-currency value = USD, all priced in USD):
 *
 *  - **Apple equity (AAPL)** — two lots:
 *      lot A: 100 sh @ $100 cost  (acquired 2021-03-15, long-term)
 *      lot B: 100 sh @ $180 cost  (acquired 2025-12-01, short-term vs 2026-06-18 asOf)
 *      mark: $200/sh → 200 sh × $200 = **$40,000**.
 *  - **Vanguard ETF (VTI)** — one lot:
 *      100 sh @ $150 cost (acquired 2020-01-10, long-term), mark $160/sh →
 *      100 × $160 = **$16,000**.
 *  - **USD Cash** — **$24,000** (no lots; a buffer that is never lot-sold).
 *
 * Total = 40,000 + 16,000 + 24,000 = **$80,000**.
 * Current mix: equity 50%, ETF 20%, cash 30%.
 *
 * Target ({@link rebalanceTargets}): equity 30%, ETF 30%, cash 40%.
 *  - equity drift +20% → SELL $16,000 of equity.
 *  - ETF    drift −10% → BUY  $8,000 of ETF.
 *  - cash   drift −10% → BUY  $8,000 of cash.
 *
 * Selling $16,000 of equity = 80 shares @ $200.
 *  - **HIFO** picks lot B first (highest $180 basis): 80 sh.
 *      proceeds 80×200 = 16,000; basis 80×180 = 14,400; gain **+1,600**,
 *      all SHORT-term (lot B acquired 2025-12-01).
 *  - **FIFO** picks lot A first (oldest, $100 basis): 80 sh.
 *      proceeds 16,000; basis 80×100 = 8,000; gain **+8,000**, all LONG-term.
 *
 * So HIFO realizes a $1,600 short-term gain; FIFO realizes an $8,000 long-term
 * gain. The proposal reports the tax saved by choosing HIFO.
 */

const aaplLotA = {
  id: "lot-aapl-a",
  quantity: "100",
  unitCost: { amount: "100.00", currency: "USD" },
  acquiredOn: "2021-03-15",
} as const;

const aaplLotB = {
  id: "lot-aapl-b",
  quantity: "100",
  unitCost: { amount: "180.00", currency: "USD" },
  acquiredOn: "2025-12-01",
} as const;

export const rebalanceEquity: Holding = {
  id: "hold-aapl",
  name: "Apple Inc.",
  assetClass: "equity",
  symbol: "AAPL",
  currency: "USD",
  lots: [aaplLotA, aaplLotB],
  valuations: [
    {
      id: "val-aapl",
      // 200 shares × $200 mark = $40,000.
      value: { amount: "40000.00", currency: "USD" },
      asOf: "2026-06-18T16:00:00Z",
      source: "market",
      confidence: "high",
    },
  ],
  tags: ["us", "tech"],
};

export const rebalanceEtf: Holding = {
  id: "hold-vti",
  name: "Vanguard Total Market ETF",
  assetClass: "etf",
  symbol: "VTI",
  currency: "USD",
  lots: [
    {
      id: "lot-vti-a",
      quantity: "100",
      unitCost: { amount: "150.00", currency: "USD" },
      acquiredOn: "2020-01-10",
    },
  ],
  valuations: [
    {
      id: "val-vti",
      // 100 shares × $160 mark = $16,000.
      value: { amount: "16000.00", currency: "USD" },
      asOf: "2026-06-18T16:00:00Z",
      source: "market",
      confidence: "high",
    },
  ],
  tags: ["us", "index"],
};

export const rebalanceCash: Holding = {
  id: "hold-cash-usd",
  name: "USD Cash",
  assetClass: "cash",
  currency: "USD",
  lots: [],
  valuations: [
    {
      id: "val-cash",
      value: { amount: "24000.00", currency: "USD" },
      asOf: "2026-06-18T00:00:00Z",
      source: "manual",
      confidence: "high",
    },
  ],
  tags: [],
};

/** The sample book to rebalance (base USD, total $80,000). */
export const rebalancePortfolio: Portfolio = {
  id: "pf-rebalance",
  name: "Ursin Family Office — rebalance",
  baseCurrency: "USD",
  holdings: [rebalanceEquity, rebalanceEtf, rebalanceCash],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-06-18T16:00:00Z",
};

/** Re-export the shared USD rate table (base USD, EUR 1.10, GBP 1.25). */
export const rebalanceRateTable: FxRateTable = usdRateTable;

/**
 * Per-symbol current unit prices (in each holding's own currency). AAPL marks
 * at $200/sh and VTI at $160/sh, matching the fixture valuations.
 */
export const rebalancePrices: Record<string, string> = {
  AAPL: "200",
  VTI: "160",
};

/**
 * The strategic target mix from the IPS: 30% equity, 30% ETF, 40% cash. Drives
 * a sell of equity and buys into ETF + cash.
 */
export const rebalanceTargets: TargetWeights<AssetClass> = {
  equity: "0.30",
  etf: "0.30",
  cash: "0.40",
};

/** The tax rate schedule (US-2024 single-filer shape) reused from m9. */
export const rebalanceSchedule: RateSchedule = sampleSchedule;

/** Valuation / sale date used to classify lot holding periods. */
export const rebalanceAsOf = "2026-06-18";

/** Tax year for the estimate label. */
export const rebalanceYear = 2026;
