import type { Holding } from "@/lib/model";

/**
 * A realistic, diverse seeded family-office portfolio spanning every asset
 * class in {@link import("@/lib/model").ASSET_CLASSES}: liquid public-market
 * instruments (equity, bond, etf, cash, crypto) and the illiquid /
 * collectible holdings a family office cares about (forest, wine, art, lego,
 * car, vineyard, pe, watch).
 *
 * Everything here is a deterministic, offline literal — fixed dates, fixed
 * amounts, no live API. Money is modelled as exact decimal strings (never
 * floating-point) per AGENTS.md. This is a READ-ONLY product: these fixtures
 * describe what a family owns and what it is worth; nothing here moves money
 * or places a trade.
 *
 * One holding per asset class is exported individually (so downstream units
 * can import a representative example) and all are collected into
 * {@link seededPortfolio}.
 */

// ── Liquid public-market holdings ──────────────────────────────────────────

/** US large-cap equity, two tax lots, live market valuation. */
export const equityAppleHolding: Holding = {
  id: "hold-equity-aapl",
  name: "Apple Inc.",
  assetClass: "equity",
  symbol: "AAPL",
  currency: "USD",
  lots: [
    {
      id: "lot-aapl-1",
      quantity: "400",
      unitCost: { amount: "120.50", currency: "USD" },
      acquiredOn: "2021-03-15",
      fees: { amount: "4.95", currency: "USD" },
      note: "Interactive Brokers",
    },
    {
      id: "lot-aapl-2",
      quantity: "150",
      unitCost: { amount: "150.00", currency: "USD" },
      acquiredOn: "2022-06-01",
      fees: { amount: "4.95", currency: "USD" },
    },
  ],
  valuations: [
    {
      id: "val-aapl-1",
      value: { amount: "108625.00", currency: "USD" },
      asOf: "2026-06-18T16:00:00Z",
      source: "market",
      confidence: "high",
      confidenceScore: 0.98,
      note: "Alpha Vantage close",
    },
  ],
  tags: ["us", "tech", "core"],
};

/** Sovereign bond denominated in EUR. */
export const bondBundHolding: Holding = {
  id: "hold-bond-bund",
  name: "German Bund 2.3% 2032",
  assetClass: "bond",
  symbol: "DE0001102606",
  currency: "EUR",
  lots: [
    {
      id: "lot-bund-1",
      quantity: "200000",
      unitCost: { amount: "0.9850", currency: "EUR" },
      acquiredOn: "2023-02-10",
      note: "Face value 200,000 EUR; price as % of par",
    },
  ],
  valuations: [
    {
      id: "val-bund-1",
      value: { amount: "201400.00", currency: "EUR" },
      asOf: "2026-06-17T17:30:00+02:00",
      source: "market",
      confidence: "high",
      confidenceScore: 0.95,
    },
  ],
  tags: ["fixed-income", "eu", "sovereign"],
};

/** Broad-market ETF tracked as a single liquid position. */
export const etfVwrlHolding: Holding = {
  id: "hold-etf-vwrl",
  name: "Vanguard FTSE All-World UCITS ETF",
  assetClass: "etf",
  symbol: "VWRL",
  currency: "USD",
  lots: [
    {
      id: "lot-vwrl-1",
      quantity: "1200",
      unitCost: { amount: "98.20", currency: "USD" },
      acquiredOn: "2020-09-30",
    },
    {
      id: "lot-vwrl-2",
      quantity: "300",
      unitCost: { amount: "112.40", currency: "USD" },
      acquiredOn: "2024-01-08",
    },
  ],
  valuations: [
    {
      id: "val-vwrl-1",
      value: { amount: "189000.00", currency: "USD" },
      asOf: "2026-06-18T16:00:00Z",
      source: "market",
      confidence: "high",
      confidenceScore: 0.97,
    },
  ],
  tags: ["etf", "global", "core"],
};

/** Multi-currency cash: no lots, a single manual statement valuation each. */
export const cashUsdHolding: Holding = {
  id: "hold-cash-usd",
  name: "USD Operating Cash",
  assetClass: "cash",
  currency: "USD",
  lots: [],
  valuations: [
    {
      id: "val-cash-usd-1",
      value: { amount: "250000.00", currency: "USD" },
      asOf: "2026-06-18T00:00:00Z",
      source: "manual",
      confidence: "high",
      note: "Bank statement",
    },
  ],
  tags: ["liquidity"],
};

/** Second cash holding in a different currency to exercise multi-currency rollups. */
export const cashChfHolding: Holding = {
  id: "hold-cash-chf",
  name: "CHF Reserve",
  assetClass: "cash",
  currency: "CHF",
  lots: [],
  valuations: [
    {
      id: "val-cash-chf-1",
      value: { amount: "85000.00", currency: "CHF" },
      asOf: "2026-06-18T00:00:00Z",
      source: "manual",
      confidence: "high",
    },
  ],
  tags: ["liquidity"],
};

/** Crypto holding priced in USD; high but slightly-below-1 confidence. */
export const cryptoBtcHolding: Holding = {
  id: "hold-crypto-btc",
  name: "Bitcoin",
  assetClass: "crypto",
  symbol: "BTC",
  currency: "USD",
  lots: [
    {
      id: "lot-btc-1",
      quantity: "2.5",
      unitCost: { amount: "31250.00", currency: "USD" },
      acquiredOn: "2023-07-12",
      fees: { amount: "78.13", currency: "USD" },
      note: "Coinbase",
    },
    {
      id: "lot-btc-2",
      quantity: "1.25",
      unitCost: { amount: "62000.00", currency: "USD" },
      acquiredOn: "2025-02-20",
    },
  ],
  valuations: [
    {
      id: "val-btc-1",
      value: { amount: "303750.00", currency: "USD" },
      asOf: "2026-06-18T16:00:00Z",
      source: "market",
      confidence: "high",
      confidenceScore: 0.9,
      note: "CoinGecko spot",
    },
  ],
  tags: ["digital", "volatile"],
};

// ── Illiquid / collectible holdings ────────────────────────────────────────

/** Forest land, appraisal-valued, carried at cost as a secondary valuation. */
export const forestHolding: Holding = {
  id: "hold-forest-nordic",
  name: "Nordic Forest Parcel (120 ha)",
  assetClass: "forest",
  currency: "EUR",
  lots: [
    {
      id: "lot-forest-1",
      quantity: "120",
      unitCost: { amount: "4200.00", currency: "EUR" },
      acquiredOn: "2018-05-30",
      note: "Price per hectare",
    },
  ],
  valuations: [
    {
      id: "val-forest-cost",
      value: { amount: "504000.00", currency: "EUR" },
      asOf: "2018-05-30T00:00:00Z",
      source: "cost",
      confidence: "low",
    },
    {
      id: "val-forest-appraisal",
      value: { amount: "640000.00", currency: "EUR" },
      asOf: "2026-03-01T00:00:00Z",
      source: "appraisal",
      confidence: "medium",
      confidenceScore: 0.6,
      note: "Forestry valuation incl. standing timber",
    },
  ],
  tags: ["real-asset", "land", "timber"],
};

/** Fine wine, appraisal-valued against a comparable index. */
export const wineHolding: Holding = {
  id: "hold-wine-lafite",
  name: "Château Lafite Rothschild 2016 (6x75cl)",
  assetClass: "wine",
  currency: "EUR",
  lots: [
    {
      id: "lot-lafite-1",
      quantity: "6",
      unitCost: { amount: "850.00", currency: "EUR" },
      acquiredOn: "2019-11-20",
      note: "In-bond, Bordeaux Index",
    },
  ],
  valuations: [
    {
      id: "val-lafite-1",
      value: { amount: "7200.00", currency: "EUR" },
      asOf: "2026-01-10T00:00:00Z",
      source: "appraisal",
      confidence: "medium",
      confidenceScore: 0.55,
      note: "Liv-ex comparable",
    },
  ],
  tags: ["collectible", "wine"],
};

/** Fine art, single appraisal valuation. */
export const artHolding: Holding = {
  id: "hold-art-hockney",
  name: "David Hockney — Pool Study (lithograph, ed. 42/75)",
  assetClass: "art",
  currency: "GBP",
  lots: [
    {
      id: "lot-art-1",
      quantity: "1",
      unitCost: { amount: "180000.00", currency: "GBP" },
      acquiredOn: "2017-10-04",
      note: "Christie's, lot 118",
    },
  ],
  valuations: [
    {
      id: "val-art-1",
      value: { amount: "240000.00", currency: "GBP" },
      asOf: "2025-11-15T00:00:00Z",
      source: "appraisal",
      confidence: "low",
      confidenceScore: 0.4,
      note: "Gallery estimate, thin comparables",
    },
  ],
  tags: ["collectible", "art"],
};

/** Collectible LEGO sets valued from a secondary-market model. */
export const legoHolding: Holding = {
  id: "hold-lego-ucs",
  name: "LEGO UCS Millennium Falcon 75192 (sealed x3)",
  assetClass: "lego",
  currency: "USD",
  lots: [
    {
      id: "lot-lego-1",
      quantity: "3",
      unitCost: { amount: "799.99", currency: "USD" },
      acquiredOn: "2021-12-26",
      fees: { amount: "0", currency: "USD" },
    },
  ],
  valuations: [
    {
      id: "val-lego-1",
      value: { amount: "3600.00", currency: "USD" },
      asOf: "2026-04-01T00:00:00Z",
      source: "model",
      confidence: "low",
      confidenceScore: 0.35,
      note: "BrickEconomy sealed comps",
    },
  ],
  tags: ["collectible", "lego"],
};

/** Classic car, appraisal-valued. */
export const carHolding: Holding = {
  id: "hold-car-porsche",
  name: "Porsche 911 (993) Carrera RS 1995",
  assetClass: "car",
  currency: "EUR",
  lots: [
    {
      id: "lot-car-1",
      quantity: "1",
      unitCost: { amount: "320000.00", currency: "EUR" },
      acquiredOn: "2016-06-18",
      note: "Matching numbers, FSH",
    },
  ],
  valuations: [
    {
      id: "val-car-1",
      value: { amount: "560000.00", currency: "EUR" },
      asOf: "2026-02-20T00:00:00Z",
      source: "appraisal",
      confidence: "medium",
      confidenceScore: 0.65,
      note: "Concours condition appraisal",
    },
  ],
  tags: ["collectible", "automobile"],
};

/** Operating vineyard, valued by a DCF-style model. */
export const vineyardHolding: Holding = {
  id: "hold-vineyard-tuscany",
  name: "Tuscan Vineyard Estate (8 ha, DOCG)",
  assetClass: "vineyard",
  currency: "EUR",
  lots: [
    {
      id: "lot-vineyard-1",
      quantity: "1",
      unitCost: { amount: "2100000.00", currency: "EUR" },
      acquiredOn: "2015-09-01",
      note: "Estate incl. cellar and equipment",
    },
  ],
  valuations: [
    {
      id: "val-vineyard-1",
      value: { amount: "2750000.00", currency: "EUR" },
      asOf: "2026-05-01T00:00:00Z",
      source: "model",
      confidence: "medium",
      confidenceScore: 0.5,
      note: "Income-approach valuation",
    },
  ],
  tags: ["real-asset", "operating", "agriculture"],
};

/** Private-equity fund commitment carried at the GP's reported NAV. */
export const peHolding: Holding = {
  id: "hold-pe-fundiii",
  name: "Helvetia Growth Fund III (LP interest)",
  assetClass: "pe",
  currency: "USD",
  lots: [
    {
      id: "lot-pe-1",
      quantity: "1",
      unitCost: { amount: "1000000.00", currency: "USD" },
      acquiredOn: "2022-04-15",
      note: "Capital called to date against 1.5M commitment",
    },
  ],
  valuations: [
    {
      id: "val-pe-1",
      value: { amount: "1340000.00", currency: "USD" },
      asOf: "2026-03-31T00:00:00Z",
      source: "manual",
      confidence: "low",
      confidenceScore: 0.45,
      note: "GP Q1 NAV statement (lagged)",
    },
  ],
  tags: ["alternative", "illiquid", "fund"],
};

/** Collectible watch, appraisal-valued. */
export const watchHolding: Holding = {
  id: "hold-watch-patek",
  name: "Patek Philippe Nautilus 5711/1A",
  assetClass: "watch",
  currency: "CHF",
  lots: [
    {
      id: "lot-watch-1",
      quantity: "1",
      unitCost: { amount: "85000.00", currency: "CHF" },
      acquiredOn: "2020-08-11",
      note: "Full set, box and papers",
    },
  ],
  valuations: [
    {
      id: "val-watch-1",
      value: { amount: "120000.00", currency: "CHF" },
      asOf: "2026-05-20T00:00:00Z",
      source: "appraisal",
      confidence: "medium",
      confidenceScore: 0.6,
      note: "Discontinued reference, secondary market",
    },
  ],
  tags: ["collectible", "watch"],
};

/**
 * Every seeded holding, one (or two, for cash) per asset class, in a stable
 * declaration order. Downstream code can iterate this list directly.
 */
export const seededHoldings: readonly Holding[] = [
  equityAppleHolding,
  bondBundHolding,
  etfVwrlHolding,
  cashUsdHolding,
  cashChfHolding,
  cryptoBtcHolding,
  forestHolding,
  wineHolding,
  artHolding,
  legoHolding,
  carHolding,
  vineyardHolding,
  peHolding,
  watchHolding,
];

/**
 * The full seeded portfolio: a diverse family-office book reported in USD,
 * spanning all 13 asset classes. Deterministic and offline — safe to use in
 * tests, stories, and demo UI without touching any live feed.
 */
export const seededPortfolio: import("@/lib/model").Portfolio = {
  id: "pf-seed-ursin",
  name: "Ursin Family Office (Seed)",
  baseCurrency: "USD",
  holdings: [...seededHoldings],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-06-18T16:00:00Z",
};
