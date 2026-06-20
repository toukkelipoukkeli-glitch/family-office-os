import { samplePortfolio } from "../model/fixtures";
import type { Holding } from "../model/holding";
import type { Portfolio } from "../model/portfolio";
import { usdRateTable } from "../allocation/fixtures";
import type { FxRateTable } from "../allocation/fx";
import type { InvestmentPolicy } from "./policy";

/**
 * Deterministic, offline fixtures for the IPS / mandate-compliance engine —
 * used by the engine + history tests and by the dashboard UI.
 *
 * The sample book ({@link samplePortfolio}, base USD, EUR = 1.10) has the mix:
 *  - USD Cash:     250,000  → 86.83%
 *  - Apple equity:  30,000  → 10.42%
 *  - Wine (EUR):     7,920  →  2.75%  (7,200 EUR × 1.10)
 *  - total:        287,920
 *
 * Liquid assets (cash + equity): 280,000 → 97.25%.
 * Currency exposure: USD 97.25%, EUR 2.75%.
 *
 * The {@link sampleIps} below is tuned so the book breaches some constraints and
 * satisfies others, giving the UI and tests a realistic mix:
 *  - Position cap 20%        → BREACHED by USD Cash (86.83%), critical.
 *  - Cash band max 50%       → BREACHED (cash 86.83%), warning.
 *  - Equity band min 15%     → BREACHED (equity 10.42%), warning.
 *  - Equity band max 40%     → satisfied (10.42% ≤ 40%).
 *  - Crypto band max 5%      → satisfied (no crypto, 0%).
 *  - Liquidity floor min 30% → satisfied (liquid 97.25%).
 *  - EUR currency cap 25%    → satisfied (EUR 2.75%).
 *
 * → 1 critical + 2 warning = 3 breaches.
 */

/** Re-export the shared sample portfolio for convenience. */
export const ipsPortfolio: Portfolio = samplePortfolio;

/** Re-export the shared USD rate table (base USD, EUR 1.10, GBP 1.25). */
export const ipsRateTable: FxRateTable = usdRateTable;

/** A realistic default IPS for a conservative family office. */
export const sampleIps: InvestmentPolicy = {
  id: "ips-ursin-2026",
  name: "Ursin Family Office IPS 2026",
  benchmark: { id: "balanced-60-40", label: "Balanced 60/40 policy" },
  constraints: [
    {
      id: "pos-cap-20",
      kind: "positionCap",
      label: "Single-position cap",
      max: "0.20",
      severity: "critical",
      note: "No single holding above 20% of the book.",
    },
    {
      id: "band-equity",
      kind: "assetClassBand",
      label: "Equity allocation band",
      assetClass: "equity",
      min: "0.15",
      max: "0.40",
      severity: "warning",
    },
    {
      id: "band-cash",
      kind: "assetClassBand",
      label: "Cash allocation band",
      assetClass: "cash",
      max: "0.50",
      severity: "warning",
    },
    {
      id: "band-crypto",
      kind: "assetClassBand",
      label: "Crypto allocation band",
      assetClass: "crypto",
      max: "0.05",
      severity: "warning",
    },
    {
      id: "liq-floor-30",
      kind: "liquidityFloor",
      label: "Liquidity floor",
      min: "0.30",
      severity: "warning",
      note: "At least 30% held in liquid, public-market assets.",
    },
    {
      id: "ccy-eur-25",
      kind: "currencyCap",
      label: "EUR exposure cap",
      currency: "EUR",
      max: "0.25",
      severity: "warning",
    },
  ],
};

/**
 * A second, *rebalanced* book used to exercise breach history. The family has
 * shifted partly into equities, crypto and a EUR cash account. The exact mix is
 * documented on {@link rebalancedPortfolio} below.
 */
const cashRebalanced: Holding = {
  id: "hold-cash-usd",
  name: "USD Cash",
  assetClass: "cash",
  currency: "USD",
  lots: [],
  valuations: [
    {
      id: "val-cash-2",
      value: { amount: "120000.00", currency: "USD" },
      asOf: "2026-07-31T00:00:00Z",
      source: "manual",
      confidence: "high",
    },
  ],
  tags: [],
};

const equityRebalanced: Holding = {
  id: "hold-aapl",
  name: "Apple Inc.",
  assetClass: "equity",
  symbol: "AAPL",
  currency: "USD",
  lots: [],
  valuations: [
    {
      id: "val-aapl-2",
      value: { amount: "90000.00", currency: "USD" },
      asOf: "2026-07-31T16:00:00Z",
      source: "market",
      confidence: "high",
    },
  ],
  tags: ["us", "tech"],
};

const cryptoRebalanced: Holding = {
  id: "hold-btc",
  name: "Bitcoin",
  assetClass: "crypto",
  symbol: "BTC",
  currency: "USD",
  lots: [],
  valuations: [
    {
      id: "val-btc-1",
      value: { amount: "90000.00", currency: "USD" },
      asOf: "2026-07-31T16:00:00Z",
      source: "market",
      confidence: "high",
    },
  ],
  tags: ["crypto"],
};

const cashHoldingRebal2: Holding = {
  id: "hold-cash-eur",
  name: "EUR Cash",
  assetClass: "cash",
  currency: "EUR",
  lots: [],
  valuations: [
    {
      id: "val-cash-eur-1",
      // 100,000 EUR × 1.10 = 110,000 USD.
      value: { amount: "100000.00", currency: "EUR" },
      asOf: "2026-07-31T00:00:00Z",
      source: "manual",
      confidence: "high",
    },
  ],
  tags: [],
};

/**
 * The rebalanced book, as-of 2026-07-31. Base-currency mix (total 410,000 USD):
 *  - USD Cash:    120,000 USD →  29.27%
 *  - EUR Cash:    110,000 USD →  26.83%  (100,000 EUR × 1.10)
 *  - Apple:        90,000 USD →  21.95%
 *  - Bitcoin:      90,000 USD →  21.95%
 *
 * Liquid (all four are liquid classes): 100% → liquidity floor satisfied.
 * Cash total: 230,000 → 56.10% → cash band max 50% BREACHED.
 * Equity 21.95% → within [15%, 40%] → equity band satisfied (both bounds).
 * Crypto 21.95% → crypto band max 5% BREACHED (warning).
 * EUR exposure: 110,000 / 410,000 = 26.83% → EUR cap 25% BREACHED.
 * Position cap 20%: USD Cash 29.27%, EUR Cash 26.83%, Apple 21.95%, BTC 21.95%
 *   — all four holdings BREACH the 20% cap (critical).
 */
export const rebalancedPortfolio: Portfolio = {
  id: "pf-ursin",
  name: "Ursin Family Office",
  baseCurrency: "USD",
  holdings: [cashRebalanced, equityRebalanced, cryptoRebalanced, cashHoldingRebal2],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-07-31T16:00:00Z",
};

/** As-of timestamps for the two history points. */
export const ipsAsOf1 = "2026-06-30T00:00:00Z";
export const ipsAsOf2 = "2026-07-31T00:00:00Z";
