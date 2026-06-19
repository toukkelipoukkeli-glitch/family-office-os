import type { Holding } from "./holding";
import type { Lot } from "./lot";
import type { Portfolio } from "./portfolio";
import type { Valuation } from "./valuation";

/**
 * Deterministic, offline fixtures for the portfolio data model. Used by the
 * model validation tests and available to downstream units that need realistic
 * sample data without touching any live API.
 *
 * All dates/timestamps are fixed literals so tests stay deterministic.
 */

export const lotAaplA: Lot = {
  id: "lot-aapl-1",
  quantity: "100",
  unitCost: { amount: "120.50", currency: "USD" },
  acquiredOn: "2021-03-15",
  fees: { amount: "4.95", currency: "USD" },
};

export const lotAaplB: Lot = {
  id: "lot-aapl-2",
  quantity: "50",
  unitCost: { amount: "150.00", currency: "USD" },
  acquiredOn: "2022-06-01",
};

export const valAaplMarket: Valuation = {
  id: "val-aapl-1",
  value: { amount: "30000.00", currency: "USD" },
  asOf: "2026-06-18T16:00:00Z",
  source: "market",
  confidence: "high",
  confidenceScore: 0.98,
};

export const equityHolding: Holding = {
  id: "hold-aapl",
  name: "Apple Inc.",
  assetClass: "equity",
  symbol: "AAPL",
  currency: "USD",
  lots: [lotAaplA, lotAaplB],
  valuations: [valAaplMarket],
  tags: ["us", "tech"],
};

export const wineHolding: Holding = {
  id: "hold-lafite",
  name: "Château Lafite Rothschild 2016 (6x75cl)",
  assetClass: "wine",
  currency: "EUR",
  lots: [
    {
      id: "lot-lafite-1",
      quantity: "6",
      unitCost: { amount: "850.00", currency: "EUR" },
      acquiredOn: "2019-11-20",
    },
  ],
  valuations: [
    {
      id: "val-lafite-1",
      value: { amount: "7200.00", currency: "EUR" },
      asOf: "2026-01-10T00:00:00Z",
      source: "appraisal",
      confidence: "medium",
      note: "Liv-ex comparable",
    },
  ],
  tags: ["collectible"],
};

export const cashHolding: Holding = {
  id: "hold-cash-usd",
  name: "USD Cash",
  assetClass: "cash",
  currency: "USD",
  lots: [],
  valuations: [
    {
      id: "val-cash-1",
      value: { amount: "250000.00", currency: "USD" },
      asOf: "2026-06-18T00:00:00Z",
      source: "manual",
      confidence: "high",
    },
  ],
  tags: [],
};

export const samplePortfolio: Portfolio = {
  id: "pf-ursin",
  name: "Ursin Family Office",
  baseCurrency: "USD",
  holdings: [equityHolding, wineHolding, cashHolding],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-06-18T16:00:00Z",
};
